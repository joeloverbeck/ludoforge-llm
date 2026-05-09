# 162PRESIGINT-005: Runtime evaluateConsideration consumes previewFallback; fallbackExplicit selectionReason fires

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-evaluation-core.ts`, `policy-agent.ts`
**Deps**: `archive/tickets/162PRESIGINT-004.md`

## Problem

After 002 plumbs per-ref unavailability into `candidate.unknownPreviewRefs`, after 003 lands the trace surface, and after 004's compiler enforces that every preview-ref consideration declares `previewFallback`, the runtime `evaluateConsideration` (`policy-evaluation-core.ts:484-521`) is the last piece. Today it falls through to `unknownAs ?? 0` whenever the value does not resolve to a number — that path silently produces a numeric contribution from an unavailable preview ref, the exact behavior Foundation #20 forbids.

This ticket changes `evaluateConsideration` to consume the compiled `previewFallback` field for preview-ref considerations: `noContribution` omits the contribution entirely (no entry in `scoreContributions`); `{ constant: N }` produces the constant contribution and traces it via a new `previewFallbackFired` candidate trace field. The `fallbackExplicit` selectionReason variant (reserved in 003) starts firing here.

## Assumption Reassessment (2026-05-09)

1. **Compiler enforces `previewFallback` on preview-ref considerations.** Verified by 004 — every preview-ref consideration in the conformance corpus has `previewFallback` after 004 lands. The legacy `unknownAs ?? 0` branch becomes unreachable for preview-ref considerations.
2. **`evaluateConsideration` shape.** Verified at `policy-evaluation-core.ts:484-521`. The current logic: evaluate `when`, evaluate `weight`, evaluate `value`. If either is non-number → `unknownAs ?? 0` → done. Otherwise multiply, clamp, return.
3. **`PolicyEvaluationCandidate.unknownPreviewRefs`.** Populated by 002. When `evaluateConsideration` runs and the value resolved through `resolvePreviewOptionRef`, the candidate's tracking map already has the relevant entry by the time we get to the contribution-computation branch.
4. **Detecting "this consideration's value comes from a preview ref".** Two options:
   - At compile time, set a flag on the compiled consideration (`hasPreviewRef: boolean`). Cheap, deterministic, no runtime AST walk.
   - At runtime, check whether `candidate.unknownPreviewRefs` gained an entry during this consideration's evaluation, OR walk the value AST at evaluation time.
   Recommended: compiler sets `hasPreviewRef`. Confirm during implementation that the compiled consideration shape can carry a new boolean — tied to 004's compiler diff.
5. **`previewFallbackFired` candidate trace field.** Spec §5.4: `previewFallbackFired?: { termId: string; kind: 'noContribution' | 'constant'; value?: number }`. Added to the per-candidate trace alongside `unknownPreviewRefs` and `selectionReason`.
6. **`fallbackExplicit` firing condition.** Spec §5.3: "the selected candidate's score includes a contribution that came from an explicit `previewFallback.onUnavailable.constant` path (not the default `noContribution` path)." Per-candidate flag, classified at trace-build time.

## Architecture Check

1. **Foundation #20 direct fulfillment.** Without this ticket, the integrity claim of Foundation #20 is not honored at runtime — the silent-coercion path remains alive in `evaluateConsideration`. After this ticket, the spec's core invariant ("any consideration that converts an unavailable preview ref into a contribution MUST declare that fallback explicitly") holds end-to-end.
2. **Compiler-set flag preferred over runtime AST walk.** The compiled consideration is already a generated artifact; adding a deterministic `hasPreviewRef: boolean` (or equivalent) keeps the runtime hot path branch-free for non-preview considerations. Compatible with Foundation #12 (compiler validates everything knowable from the spec alone).
3. **`noContribution` vs `unknownAs` semantic distinction.** Today's `unknownAs ?? 0` produces a `0` contribution that DOES enter `scoreContributions[]`. The new `noContribution` semantics OMIT the entry from `scoreContributions[]`. This is a visible trace difference, not a numeric-equivalent — the spec calls this out as the integrity contract. Tests must assert the omission, not just the zero.
4. **Engine-agnostic.** All changes live in the policy-evaluation pipeline. No game id appears.
5. **No backwards-compatibility shim.** The branch in `evaluateConsideration` is unconditional: if the consideration `hasPreviewRef === true` and the value did not resolve to a number, consult `previewFallback` (which the compiler guarantees is present). No fallback to `unknownAs` for preview-ref considerations. `unknownAs` continues to operate for non-preview considerations exactly as today.

## What to Change

### 1. Extend compiled consideration shape (small follow-up to 004)

In `compile-agents.ts`, set a flag on each compiled consideration:

```ts
readonly hasPreviewRef: boolean;  // true iff `value` AST contains a `previewOptionRef`
```

004 already walks the value AST to emit `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`. Reuse that walk to set `hasPreviewRef`. (If the field was already added in 004, this step is a no-op; otherwise add it here.)

### 2. Branch on `hasPreviewRef` in `evaluateConsideration`

In `policy-evaluation-core.ts:484-521`, replace the silent-coercion fallback for preview-ref considerations:

```ts
if (typeof weight !== 'number' || typeof value !== 'number') {
  if (consideration.hasPreviewRef === true) {
    // Compiler guarantees previewFallback is present.
    const fallback = consideration.previewFallback!.onUnavailable;
    if (fallback === 'noContribution') {
      // Mark for trace; do NOT call onContribution(...). Contribution is OMITTED.
      candidate?.previewFallbackFired = {
        termId: considerationId,
        kind: 'noContribution',
      };
      return 0;
    }
    // Explicit constant.
    candidate?.previewFallbackFired = {
      termId: considerationId,
      kind: 'constant',
      value: fallback.value,
    };
    onContribution?.(fallback.value);
    return fallback.value;
  }
  // Non-preview-ref consideration: legacy path unchanged.
  const contribution = consideration.unknownAs ?? 0;
  onContribution?.(contribution);
  return contribution;
}
```

Verify the candidate type extension supports `previewFallbackFired` (likely needs to be added to `PolicyEvaluationCandidate` if not already on the trace shape only).

### 3. Trace surface — `previewFallbackFired` on candidate trace

Per spec §5.4, the per-candidate trace gains `previewFallbackFired?: { termId: string; kind: 'noContribution' | 'constant'; value?: number }`. Populate this in `traceCandidatesForFrontier` (`policy-agent.ts:74`) and the guided-choice frontier path (`policy-agent.ts:280-310`). Source the value from `candidate.previewFallbackFired` set in §2.

### 4. Fire `fallbackExplicit` selectionReason

In the trace-builder classification (extended by 003), wire the `fallbackExplicit` branch:

> A candidate's `selectionReason` is `fallbackExplicit` when it is the selected candidate AND its `previewFallbackFired.kind === 'constant'` AND that contribution materially affected the selection (i.e., score difference vs runner-up exists with the constant present and disappears with `noContribution`).

The simpler form per spec §5.3: "fired when the selected candidate's score includes a contribution that came from an explicit `previewFallback.onUnavailable.constant` path (not the default `noContribution` path)". Implementation:
- If `selected.previewFallbackFired?.kind === 'constant'` → `selectionReason = 'fallbackExplicit'`.
- Otherwise existing classification (`gated`/`scored`/`tiebreak`/`tiebreakAfterPreviewNoSignal`) per 003.

### 5. New architectural-invariant tests

`packages/engine/test/architecture/preview-integrity/preview-unavailable-not-silently-zero.test.ts` (T1 from spec §9.1):

```ts
// @test-class: architectural-invariant
```

- Construct a synthetic compiled profile whose preview drive will exit at `depthCap` with no resolved surface refs. The consideration has `previewFallback: { onUnavailable: noContribution }`.
- Run a chooseN frontier evaluation.
- Assert: every candidate's contribution from the preview consideration is OMITTED (no entry in `scoreContributions` for that termId).
- Assert: candidate score equals `chooseNStepProgressBias(input, decision)` (the only remaining score component).
- Assert: `selectionReason` of the selected candidate is `tiebreakAfterPreviewNoSignal`.

`packages/engine/test/architecture/preview-integrity/preview-fallback-explicit-zero-traced.test.ts` (T2 from spec §9.1):

```ts
// @test-class: architectural-invariant
```

- Same harness with `previewFallback: { onUnavailable: { constant: 0 } }`.
- Assert: contribution EXISTS in `scoreContributions` with value 0.
- Assert: candidate's `previewFallbackFired === { termId: ..., kind: 'constant', value: 0 }`.
- Assert: if it is the selected candidate, `selectionReason === 'fallbackExplicit'`.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `evaluateConsideration` branch on `hasPreviewRef`; `PolicyEvaluationCandidate.previewFallbackFired` field)
- `packages/engine/src/agents/policy-agent.ts` (modify — `traceCandidatesForFrontier` populates `previewFallbackFired`; `fallbackExplicit` selectionReason classification)
- `packages/engine/src/cnl/compile-agents.ts` (modify if `hasPreviewRef` field was not added in 004 — likely a small touch)
- `packages/engine/test/architecture/preview-integrity/preview-unavailable-not-silently-zero.test.ts` (new, T1)
- `packages/engine/test/architecture/preview-integrity/preview-fallback-explicit-zero-traced.test.ts` (new, T2)

## Out of Scope

- ARVN seed 1000 convergence-witness regression test. Owned by 006.
- Cookbook update. Owned by 006.
- Raising the cap (Spec 164).
- New ref families (Spec 163).

## Acceptance Criteria

### Tests That Must Pass

1. T1: `preview-unavailable-not-silently-zero.test.ts` — `noContribution` omits the score contribution, candidate score reduces to `chooseNStepProgressBias`, `selectionReason === 'tiebreakAfterPreviewNoSignal'`.
2. T2: `preview-fallback-explicit-zero-traced.test.ts` — `{ constant: 0 }` produces explicit zero contribution, `previewFallbackFired` records it, `selectionReason === 'fallbackExplicit'` when selected.
3. T3, T4 (from 003) still pass.
4. T6, T7 (from 004) still pass.
5. Existing FITL canary golden tests still pass — FITL `preferOptionProjectedMargin` (with `previewFallback: noContribution` from 004) now genuinely omits contributions when preview is unavailable. If a canary golden was authored against the old silent-zero behavior, it needs an update; treat that as a re-bless under the convergence-witness category with an explanation in the commit body.
6. Existing replay-identity tests still pass byte-identical.
7. Existing suite: `pnpm turbo build && pnpm turbo test`.

### Invariants

1. **Foundation #20 core invariant**: a non-`ready` `previewOptionRef` MUST NOT produce a non-zero contribution unless the consideration declares `previewFallback.onUnavailable: { constant: <n> }`. Verified by injecting an unavailable status and asserting `score == chooseNStepProgressBias` (T1).
2. `fallbackExplicit` selectionReason fires only when the explicit constant path is taken (T2).
3. `noContribution` semantics OMIT the trace entry — not "produce zero in trace". Visible trace difference.
4. `unknownAs` path remains active for non-preview-ref considerations.
5. `INNER_PREVIEW_HARD_CAP === 256` unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-integrity/preview-unavailable-not-silently-zero.test.ts` (new, T1) — silent-zero is impossible.
2. `packages/engine/test/architecture/preview-integrity/preview-fallback-explicit-zero-traced.test.ts` (new, T2) — explicit fallback is traced and classified.
3. If a FITL canary golden test asserts the old silent-zero behavior, update it with a re-bless note in the commit body.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-integrity/preview-unavailable-not-silently-zero.test.js dist/test/architecture/preview-integrity/preview-fallback-explicit-zero-traced.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
