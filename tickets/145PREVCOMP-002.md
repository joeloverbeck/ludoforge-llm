# 145PREVCOMP-002: Policy-evaluation top-K preview gate

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts`
**Deps**: `archive/tickets/145PREVCOMP-001.md`

## Problem

Per Spec 145 D7: previewing every action-selection candidate is too expensive (target: under 5% wall-time overhead). Empirically, ARVN microturns publish 8–12 candidates; previewing the top 4 by move-only score captures realistic competition while keeping cost bounded.

This ticket splits `policy-evaluation-core.ts`'s candidate scoring loop into two phases: (1) compute move-scope-only score for every candidate (no `preview.*` refs), (2) drive synthetic completion only for the top `K_PREVIEW_TOPK` candidates. Lower-ranked candidates' `previewOutcome` is set to `{ kind: 'unknown', reason: 'gated' }` and their preview-derived considerations fall through `coalesce` naturally. This is the cost-control mechanism that makes the driver from `145PREVCOMP-001` deployable on full-game runs.

## Assumption Reassessment (2026-04-25)

1. `policy-evaluation-core.ts` candidate scoring loop is the right insertion point per Spec 145 D7 ("This cap is implemented in the policy-evaluation pass (not in `policy-preview.ts`)"). Verified file at `packages/engine/src/agents/policy-evaluation-core.ts`.
2. The `'gated'` reason is new — added to `PolicyPreviewUnavailabilityReason` here (it is *not* added in `145PREVCOMP-001`, which only adds `'depthCap'` and `'noPreviewDecision'`).
3. `preview.topK` config field threading and validation already landed in `145PREVCOMP-001`; this ticket consumes the validated value.
4. `K_PREVIEW_TOPK` default is 4 per Spec 145 D7. Justified empirically by the 8–12 candidate-count observation; the derivation script lands in `145PREVCOMP-006`.
5. Composability with existing modes preserved: `disabled` mode still bypasses driver entirely; `tolerateStochastic` mode admits stochastic outcomes from gated and ungated candidates alike.

## Architecture Check

1. **F#10 (Bounded Computation)** — `K_PREVIEW_TOPK` is an explicit per-microturn bound on driver invocations; combined with `145PREVCOMP-001`'s `K_PREVIEW_DEPTH`, total preview work per microturn is bounded by `topK × depthCap = 32` `applyPublishedDecision` calls.
2. **F#11 (Immutability)** — gating is read-only over candidate move-scores; produces a new gating decision per microturn, no mutation of candidate or runtime state.
3. **F#12 (Compiler-Kernel Validation Boundary)** — `preview.topK` validation already lives at compile time (per `145PREVCOMP-001`); runtime here only consumes the validated value with the documented default.
4. **F#15 (Architectural Completeness)** — gates the cost surface introduced by the driver before deployment; without this, the driver is technically correct but operationally too expensive on full-game runs.

No backwards-compatibility shims. The split into "move-only score" and "preview-augmented score for top K" is functional, not a behavioral toggle — when `topK >= candidateCount`, behavior matches "drive every candidate" and is therefore a strict superset of "preview none."

## What to Change

### 1. Add `'gated'` reason

In `packages/engine/src/agents/policy-preview.ts`, extend `PolicyPreviewUnavailabilityReason` to include `'gated'`. Update any associated string-enum schemas in `kernel/schemas-core.ts` if `previewFailureReason` is exposed in trace fixtures.

### 2. Two-phase candidate scoring in `policy-evaluation-core.ts`

Per Spec 145 D7, restructure the candidate scoring loop:

```ts
// Phase A: move-only score (no preview.* refs touched)
const moveOnlyScores = candidates.map((c) => computeMoveOnlyScore(c, ...));

// Phase B: identify top K by move-only score (stable ordering by stableMoveKey for ties)
const topKKeys = pickTopKByScore(moveOnlyScores, profile.preview.topK ?? 4);

// Phase C: preview-augmented score
const finalScores = candidates.map((c, i) => {
  if (topKKeys.has(c.stableMoveKey)) {
    return computeFullScore(c, /* triggers preview via getPreviewOutcome */);
  }
  // Mark gated; coalesce in scoring naturally falls through preview.* refs
  previewRuntime.markGated(c.stableMoveKey);
  return computeMoveOnlyScore(c, /* same as Phase A */);
});
```

The `markGated` call inserts `{ kind: 'unknown', reason: 'gated' }` into the preview cache for the gated candidate, so `getPreviewOutcome` returns the gated outcome on lookup and any `preview.*` ref evaluator sees `unresolved`.

Tie-breaking among candidates with equal move-only scores at the K boundary uses `stableMoveKey` ordering for determinism.

### 3. Composability with `disabled` and `tolerateStochastic`

When `previewMode === 'disabled'`, skip the gate entirely — every candidate already returns `{ kind: 'unknown', reason: 'failed' }` via the existing `disabled` short-circuit. When `previewMode === 'tolerateStochastic'`, the gate still applies; gated candidates do not invoke the driver, so their stochastic-surfacing decision is moot.

### 4. `K_PREVIEW_TOPK` constant

```ts
const K_PREVIEW_TOPK = 4;
```

Module-private to `policy-evaluation-core.ts`. Override path is `profile.preview.topK` (already wired by `145PREVCOMP-001`).

### 5. Top-K gate unit tests

- `topK=1` previews only the highest-scoring candidate; all others marked `'gated'`.
- `topK >= candidateCount` previews every candidate (matches pre-gate behavior).
- `topK=4` with 12 candidates: exactly 4 candidates have non-`'gated'` outcomes; the other 8 have `reason: 'gated'`.
- Tie-breaking at K boundary uses `stableMoveKey` ordering deterministically.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify — add `'gated'` reason and `markGated` cache helper)
- `packages/engine/src/kernel/schemas-core.ts` (modify — extend `PolicyPreviewUnavailabilityReason` schema if exposed)
- `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (new)

## Out of Scope

- The driver itself — covered by `145PREVCOMP-001`.
- Trace diagnostics emitting `previewGatedCount` / `previewGatedTopFlipDetected` — covered by `145PREVCOMP-005`.
- Empirical re-derivation of the 8–12 candidate-count floor — covered by `145PREVCOMP-006`.
- Profile-level `preview.topK` overrides in shipped data — Spec 145 §I3 keeps shipped profiles on the default; profile audit lives in `145PREVCOMP-003`.

## Acceptance Criteria

### Tests That Must Pass

1. New top-K gate unit tests in `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts`.
2. Existing `policy-evaluation-core.ts` consumer tests — green (existing convergence witnesses may shift slightly due to gating; if any regress, classify per `.claude/rules/testing.md` distillation rules — do not silently re-bless).
3. `pnpm -F @ludoforge/engine test:unit` and `pnpm -F @ludoforge/engine test:integration` green (modulo intentional re-bless in `145PREVCOMP-003`).
4. `pnpm turbo lint` and `pnpm turbo typecheck` green.

### Invariants

1. `K_PREVIEW_TOPK` ≥ 1 always; values from profile config are positive integers (validated by `145PREVCOMP-001`).
2. When `topK >= candidateCount`, no candidate is gated — behavior is a strict superset of the pre-gate path.
3. Gating decision is deterministic given (move-only scores, `stableMoveKey` ordering) — F#8.
4. Gated candidates do NOT invoke `driveSyntheticCompletion` (verified by spy/counter in unit tests).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` (new) — `@test-class: architectural-invariant` for the gate's monotonicity, determinism, and `topK >= candidateCount` superset property.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
