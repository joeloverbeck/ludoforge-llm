# 157PREVBUDBALCOV-003: Phase C — Bounded one-step widen-on-uniform-projection

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — allocator widening + per-decision-class memory; `previewUsage` trace/schema surface
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

## Implementation Outcome (2026-05-06)

**Closeout state**: implemented in code; terminal proof passed on 2026-05-06.

Phase C is implemented through explicit run-local preview widening memory:

- `preview-budget-allocator.ts` now accepts optional per-decision-class widening memory keyed by `(turnId, seatId)`, applies one-step `fullCandidateCap + widenStep` when the previous same-class decision had `previewUsage.utility === 'constant'`, and marks extra selected candidates with `selectionReason: 'widening'`.
- `PolicyAgent` owns the production `PreviewWideningState` map and passes the live microturn `turnId`/`seatId` into policy evaluation. Direct `evaluatePolicyMoveCore` callers can pass explicit widening state/context for deterministic focused tests; no module-global memory is introduced.
- `policy-eval.ts` records `previewUsage.widenedBecauseUniform`, updates the memory after the decision utility is classified, and prunes older turn entries when a later turn id is observed.
- `PolicyPreviewUsageTrace` and the runtime Zod/schema artifact now require `widenedBecauseUniform: boolean`; safe-empty/default paths emit `false`.
- Added `packages/engine/test/unit/agents/preview-widen-on-uniform.test.ts` for trigger, non-trigger, cumulative bound, turn-boundary clear, seat isolation, and disabled/absent parity.

Semantic corrections against the draft:

- The live allocator owner is `packages/engine/src/agents/preview-budget-allocator.ts`, not an inline `policy-eval.ts` block.
- The live turn-boundary hook is deterministic keying plus old-turn pruning from the policy decision context; there is no separate kernel event hook needed for this ticket.
- `widenCap` is treated as the number of one-step widening triggers per turn/seat class, so cumulative added candidates are bounded by `widenStep * widenCap`, matching this ticket's acceptance invariant.

Verification substitution:

- The drafted `pnpm -F @ludoforge/engine test:unit -- agents/preview-widen-on-uniform` command does not focus Node tests in the live package script. The focused proof is `pnpm -F @ludoforge/engine build` followed by direct compiled `node --test dist/test/unit/agents/preview-widen-on-uniform.test.js` with the existing allocator and trace-shape consumers. The broader ticket lanes remain `pnpm -F @ludoforge/engine test`, `pnpm turbo typecheck`, and the split `pnpm turbo lint` / `pnpm turbo test` equivalents for `pnpm turbo lint typecheck test`.

Final proof ledger:

- `pnpm -F @ludoforge/engine build` passed after fixing exact-optional return shape.
- Focused built Node lane passed after schema artifact regeneration: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-widen-on-uniform.test.js dist/test/unit/agents/preview-budget-allocator.test.js dist/test/unit/trace/policy-trace-shape.test.js dist/test/unit/agents/policy-diagnostics.test.js dist/test/unit/agents/policy-diagnostics-preview.test.js` (`24` tests, `5` suites).
- `pnpm turbo schema:artifacts` passed and regenerated `Trace.schema.json`.
- Focused schema fallout lane passed after updating trace fixtures: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js dist/test/unit/agents/preview-widen-on-uniform.test.js dist/test/unit/trace/policy-trace-shape.test.js` (`44` tests, `3` suites).
- `pnpm -F @ludoforge/engine test` passed after the owned trace fixture fallout was fixed (`64/64` files).
- `pnpm turbo typecheck` initially exposed one downstream runner trace fixture missing `widenedBecauseUniform`; after the owned fixture patch, rerun passed (`3/3` tasks).
- `pnpm turbo lint` passed (`2/2` tasks).
- `pnpm turbo test` passed (`5/5` tasks; engine default lane `64/64` files, runner `205` files / `2019` tests).
- `pnpm run check:ticket-deps` passed after the terminal status flip.

Post-proof validity:

- The terminal status and proof-ledger edits are transcription-only: they do not change code, schema, fixture, command semantics, scope, acceptance criteria, or dependency ownership. No proof lane is invalidated by this final ticket edit.

Source-size/runtime-surface ledger:

- Preexisting over-guidance files touched surgically: `policy-eval.ts`, `policy-evaluation-core.ts`, `types-core.ts`, and `schemas-core.ts`. New widening logic stayed in the small existing allocator module; extraction beyond this ticket is deferred because the active growth is narrow contract/wiring work.
- Runtime surface breadth: policy/agent-only behavior plus shared engine trace/schema surface for `previewUsage.widenedBecauseUniform`.

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

## Outcome

Completed: 2026-05-06.

Phase C landed as a bounded, opt-in widen-on-uniform preview budget path. The allocator now observes run-local `(turnId, seatId)` preview widening memory, widens by `widenStep` only after the previous same-class decision had constant preview utility, caps cumulative widening by `widenCap`, and marks widened selections with `selectionReason: 'widening'`.

The trace contract now includes required `previewUsage.widenedBecauseUniform`, with runtime type/schema updates, regenerated `Trace.schema.json`, and updated owned fixtures. The production owner is `preview-budget-allocator.ts` plus `policy-eval.ts` / `PolicyAgent` wiring; the drafted `policy-evaluation-core.ts` touched-file claim was verified unnecessary because the live trace/type owners sit in `policy-eval.ts`, `types-core.ts`, and `schemas-core.ts`.

Post-review decision: no must-fix cleanup or follow-up ticket was warranted. The implementation remains aligned with Foundations: no game-specific engine branch, no compatibility alias, deterministic per-run memory, and bounded computation.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-widen-on-uniform.test.js dist/test/unit/agents/preview-budget-allocator.test.js dist/test/unit/trace/policy-trace-shape.test.js dist/test/unit/agents/policy-diagnostics.test.js dist/test/unit/agents/policy-diagnostics-preview.test.js`
- `pnpm turbo schema:artifacts`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js dist/test/unit/agents/preview-widen-on-uniform.test.js dist/test/unit/trace/policy-trace-shape.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
- `pnpm run check:ticket-deps`
