# 157PREVBUDBALCOV-003: Phase C — Bounded one-step widen-on-uniform-projection

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `policy-eval.ts` allocator widening + per-decision-class memory; `policy-evaluation-core.ts` `previewUsage` trace surface
**Deps**: `archive/tickets/157PREVBUDBALCOV-001.md`, `archive/tickets/157PREVBUDBALCOV-002.md`

## Problem

When a preview decision's `previewUsage.utility === 'constant'`, the allocator's coverage + prior selection produced no differentiating signal — every previewed candidate projected to the same outcome. Repeating the same allocation for a second decision in the same class will likely produce the same uniform projection. A bounded one-step widening — bumping `fullCandidateCap` by `widenStep` for the immediately-next decision in the matching decision class — gives the allocator one chance to find a differentiating candidate before reverting to the baseline cap.

Phase A live evidence confirmed this remains a real residual after balanced coverage: the sampled FITL corpus produced 1/29 differentiating decisions at `fullCandidateCap: 4`, and forcing caps up to 64 only reached 4/29. If ticket 002's structural-impact prior does not materially improve that red utility evidence, this ticket owns the bounded adaptive response for repeated constant-projection decisions.

This is the smallest of the three Phase tickets and lands the `selectionReason: 'widening'` enum value (already reserved at `policy-eval.ts:84` from Spec 156, unused until now) plus the `widenedBecauseUniform: boolean` trace surface on `previewUsage`.

The schema fields (`widenOnUniformProjection`, `widenCap`, `widenStep`) were already accepted by ticket 001's validator — Phase C only wires the runtime behavior. No further migration is required.

## Assumption Reassessment (2026-05-06)

1. **`selectionReason: 'widening'` already in the enum** (verified): `SELECTION_REASONS = ['coverage', 'prior', 'shallowDelta', 'widening', 'cache', 'gated']` at `policy-eval.ts:84`. No enum change required.
2. **Schema fields accepted in ticket 001** (per Files to Touch in 001): `widenOnUniformProjection`/`widenCap`/`widenStep` validated by `lowerPreviewConfig`. Phase C only consumes them at runtime; no schema or validator change.
3. **`previewUsage.utility` is per-decision** (verified): populated at `policy-eval.ts:1117` via `classifyPreviewUtility(readyRefStats)`. Phase C reads the prior decision's utility. The "decision class" key (per the spec: `actionSelection at turnId X seatId Y`) is an engine-generic composition over `(turnId, seatId)` — no game-specific identifiers.
4. **Memory cleared on turn boundary**: needs an explicit hook. The kernel emits a turn-boundary event; per-decision-class memory is keyed by `(turnId, seatId)` and dropped when `turnId` advances.
5. **No re-bless required**: ticket 001 establishes the FITL canary trace; Phase C extends it only when `widenOnUniformProjection: true` is set on a profile. The default profile state is `widenOnUniformProjection: false` (or absent), so existing fixtures remain unchanged.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** One-step bounded adaptive widening is the smallest F#10-respecting response to the constant-projection failure mode. Compared to multi-step widening (rejected — unbounded growth risk), profile-wide cap increase (rejected — wastes budget on decisions that didn't need it), or shallow-pass screening (rejected — folded into Phase B), this captures the adaptive signal at the smallest possible state-machine surface: a one-element memory keyed by decision class, cleared on turn boundary.
2. **GameSpecDoc vs runtime boundary preserved.** Decision-class key `(turnId, seatId)` is engine-generic. Profile YAML opt-in via `widenOnUniformProjection: true` + `widenCap` + `widenStep` (validated in ticket 001). No game-specific text in engine code (F#1).
3. **No backwards-compatibility shims (F#14).** No previous widening mechanism existed; Phase C is purely additive. Profiles that don't set `widenOnUniformProjection` get default behavior identical to Phase B (no widening).
4. **Determinism (F#8).** Memory-clear on `turnId` advance is deterministic. Per-decision-class lookup is keyed by integer-derivable values (`turnId`, `seatId`). `widenStep × widenCap` arithmetic is integer-only.
5. **Bounded computation (F#10).** `widenCap` caps cumulative widening per turn; `widenStep` caps per-trigger growth. Hard upper bound on allocator output size: `fullCandidateCap + widenStep × widenCap`.

## What to Change

### 1. Per-decision-class one-step memory in `policy-eval.ts`

Introduce a `previewWideningState: Map<DecisionClassKey, { cumulativeWidenSteps: number, lastUtility: PreviewUtility }>` scoped to the kernel's per-turn context. The key `DecisionClassKey = ${turnId}:${seatId}` (string). Memory is created lazily on first decision and cleared when `turnId` advances (kernel emits a turn-boundary signal — hook into the existing per-turn cleanup).

### 2. Allocator widening logic

In `allocatePreviewBudget`, after computing `fullCandidateCap` from profile config:

```
if (profile.preview.budget.widenOnUniformProjection === true) {
  const key = `${context.turnId}:${context.seatId}`;
  const memory = previewWideningState.get(key);
  if (memory?.lastUtility === 'constant'
      && memory.cumulativeWidenSteps < profile.preview.budget.widenCap) {
    fullCandidateCap += profile.preview.budget.widenStep;
    memory.cumulativeWidenSteps += profile.preview.budget.widenStep;
    widenedBecauseUniform = true;
  }
}
```

Slots filled by the widened range emit `selectionReason: 'widening'` (distinct from `'coverage'`/`'prior'`).

### 3. Memory update post-decision

After the decision completes and `previewUsage.utility` is computed at `policy-eval.ts:1117`, store `{ lastUtility: utility, cumulativeWidenSteps: <preserved> }` back to the memory map. This lets the *next* decision in the same class observe the prior utility.

### 4. Trace surface — `widenedBecauseUniform` on `previewUsage`

Add `widenedBecauseUniform: boolean` field to the `previewUsage` trace object. Default `false`; set to `true` when widening fires in step 2. Update `policy-evaluation-core.ts` types and the schema validator (`schemas-core.ts`).

### 5. Turn-boundary memory clear

Hook into the kernel's per-turn cleanup (the existing teardown path for per-turn caches). Drop entries where `turnId` < current `turnId`. This is the only memory-management primitive needed — there is no cross-turn state.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — widening logic + memory + `widenedBecauseUniform` emission)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `previewUsage.widenedBecauseUniform` field type)
- `packages/engine/src/kernel/types-core.ts` (modify — `widenedBecauseUniform` on `PolicyPreviewUsageTrace`)
- `packages/engine/src/kernel/schemas-core.ts` (modify — schema accepts `widenedBecauseUniform`)
- `packages/engine/test/unit/agents/preview-widen-on-uniform.test.ts` (new — trigger + bounded-widening property tests)

## Out of Scope

- **Multi-step adaptive widening or convergence detection**: future spec if Phase C empirics demand it.
- **Per-game widening tuning**: profiles tune `widenStep`/`widenCap` themselves; engine has no per-game branches.
- **Re-bless of FITL canary fixture**: ticket 001's canary uses default profiles (`widenOnUniformProjection: false`); no re-bless required. New widening tests author their own minimal fixtures.

## Acceptance Criteria

### Tests That Must Pass

1. New: With `widenOnUniformProjection: true, widenCap: 4, widenStep: 2`, decision N+1 has `fullCandidateCap + 2` candidates allowed when decision N's `utility === 'constant'`; trace records `widenedBecauseUniform: true` on N+1.
2. New: When decision N's `utility !== 'constant'`, decision N+1 uses base `fullCandidateCap`; `widenedBecauseUniform: false`.
3. New: Cumulative widening over a turn never exceeds `widenStep × widenCap` (bounded).
4. New: Memory is cleared on turn boundary — decision N (last of turn T) had widening; decision 1 of turn T+1 does NOT inherit the widened cap.
5. New: Decision-class isolation — uniform projection in `(turnId=T, seatId=A)` does NOT trigger widening in `(turnId=T, seatId=B)`.
6. New: When `widenOnUniformProjection: false` (or absent), allocator behavior is byte-identical to Phase B (replay-identity proof).
7. Existing engine suite: `pnpm -F @ludoforge/engine test`.
8. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) Allocator output size ≤ `fullCandidateCap + widenStep × widenCap` (hard bound, F#10).
2. (architectural-invariant) Cumulative widening per `(turnId, seatId)` ≤ `widenStep × widenCap`.
3. (architectural-invariant) `widenedBecauseUniform: true` ⟹ `selectionReason: 'widening'` is set on at least one selected candidate.
4. (architectural-invariant) Memory cleanup is deterministic — replay produces identical `widenedBecauseUniform` flags across runs.
5. (architectural-invariant) When `widenOnUniformProjection: false` (or absent), `widenedBecauseUniform === false` for every decision (Phase A/B parity).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-widen-on-uniform.test.ts` (new) — `architectural-invariant`. Trigger property (constant ⟹ next-decision widening); bounded-widening property (cumulative ≤ `widenStep × widenCap`); turn-boundary clear; decision-class isolation; replay-identity under `widenOnUniformProjection: true`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/preview-widen-on-uniform`
2. `pnpm turbo lint typecheck test`
