# 87UNIVIAPIP-002: Add discoveryCache to ResolveMoveDecisionSequenceOptions and use it in resolveMoveDecisionSequence

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/move-decision-sequence.ts
**Deps**: archive/tickets/87UNIVIAPIP-001.md

## Problem

`resolveMoveDecisionSequence` calls `legalChoicesDiscover` on every iteration of its decision-probing loop. When a `DiscoveryCache` is available from prior enumeration, the first call for the original move can be served from cache, eliminating redundant partial effect execution while preserving the rest of the probe pipeline.

## Assumption Reassessment (2026-03-27)

1. `resolveMoveDecisionSequence` currently loops over decision-probing steps and directly calls `legalChoicesDiscover(def, state, move, ...)` on each step — confirmed.
2. The first iteration uses the original `baseMove`; subsequent iterations replace `move` with new objects carrying resolved params — confirmed.
3. A `DiscoveryCache` type already exists and is already exported from `move-decision-sequence.ts` — the ticket must not reintroduce or relocate that type.
4. `classifyMoveDecisionSequenceSatisfiability` already exposes a generic `discoverer` override through `MoveDecisionSequenceSatisfiabilityOptions` — this ticket is only about the resolve path, not the satisfiability path.
5. `ResolveMoveDecisionSequenceOptions` currently contains `choose`, `budgets`, and `onWarning`, and is a cold-path options bag. Extending it with `discoveryCache` does not change any hot-path object shape — confirmed.
6. The cache only helps on the first step for the original move object. Once the loop fills a decision param and creates a new move object, the cache will correctly miss unless some future caller explicitly stores those derived moves too.

## Architecture Check

1. The current architecture already has a generic injection seam for satisfiability (`discoverer`) and a concrete cache artifact (`DiscoveryCache`) for this optimization family. For the resolve path, accepting the cache directly is the smallest change that composes with Spec 87 without widening resolve-time behavior more than necessary.
2. The optimization belongs inside `resolveMoveDecisionSequence`, not in callers, because the deduplication target is the resolver's first `legalChoicesDiscover` call. Centralizing the lookup there preserves a single source of truth for resolve behavior.
3. No aliasing, wrappers, or probe bypass are justified here. The resolver should do a simple cache lookup, then fall through to the existing discovery path on miss.
4. This ticket should not broaden into threading the cache through enumeration or viability probing; those remain separate concerns handled by downstream tickets.

## What to Change

### 1. Add `discoveryCache` to `ResolveMoveDecisionSequenceOptions`

```typescript
export interface ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoveryCache?: DiscoveryCache;
}
```

### 2. Cache lookup in `resolveMoveDecisionSequence` loop

Replace line 62:

```typescript
const request = legalChoicesDiscover(def, state, move, { ... }, runtime);
```

With:

```typescript
const cached = options?.discoveryCache?.get(move);
const request = cached ?? legalChoicesDiscover(def, state, move, {
  onDeferredPredicatesEvaluated: (count) => {
    deferredPredicatesEvaluated += count;
  },
}, runtime);
```

**Important**: When a cache hit occurs, `deferredPredicatesEvaluated` is NOT incremented for the cached call's predicates. This is safe because:
- The deferred predicate budget was already checked during enumeration when the original call was made.
- The budget in `resolveMoveDecisionSequence` is a separate budget instance scoped to this resolve call.
- A cache hit on step 0 means the exact same `ChoiceRequest` is returned — the resolve loop processes it identically.
- This ticket only consumes an existing cache entry. It does not create or mutate the cache.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify) — add `discoveryCache` field to `ResolveMoveDecisionSequenceOptions`, add cache lookup in `resolveMoveDecisionSequence`
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify) — add resolver tests covering cache hit and cache miss behavior

## Out of Scope

- `legal-moves.ts` — callers are NOT updated here (that's 87UNIVIAPIP-003 and 87UNIVIAPIP-004)
- `apply-move.ts` — `probeMoveViability` is NOT changed here (that's 87UNIVIAPIP-004)
- `decision-sequence-satisfiability.ts` — no changes
- The `classifyMoveDecisionSequenceSatisfiability` function and its existing `discoverer` option — already handled in 87UNIVIAPIP-001
- Any hot-path object shapes
- Creating or populating a `DiscoveryCache`

## Acceptance Criteria

### Tests That Must Pass

1. Existing tests that call `resolveMoveDecisionSequence` continue to pass when `discoveryCache` is omitted.
2. A unit test proves `resolveMoveDecisionSequence` consumes a cached first-step `ChoiceRequest` and still completes the sequence correctly.
3. A unit test proves a cache miss still falls back to the normal `legalChoicesDiscover` path.
4. `pnpm -F @ludoforge/engine test` passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. When `discoveryCache` is omitted or undefined, behavior is identical to current code.
2. When a cache hit occurs, the returned `ChoiceRequest` is the exact same object that was stored during enumeration — no cloning, no transformation.
3. No new fields on Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, or GameDefRuntime.
4. The resolver still owns all decision-loop behavior after the cache lookup, including chooser application, warning emission, and illegal/pending handling.

## Test Plan

### New/Modified Tests

1. Add unit coverage in `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` for a cache hit on the first resolve step.
2. Add unit coverage in `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` proving cache omission or miss falls through to the normal discovery path.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-27
- What actually changed: `ResolveMoveDecisionSequenceOptions` now accepts an optional `discoveryCache`, `resolveMoveDecisionSequence` checks that cache before calling `legalChoicesDiscover`, and resolver unit coverage now proves both cache-hit and identity-cache-miss behavior.
- Deviations from original plan: the ticket was corrected before implementation because `DiscoveryCache` and the satisfiability-side `discoverer` seam already existed in the codebase; the final work therefore focused only on the missing resolve-path cache hook and added tests instead of deferring cache-path verification to a later ticket.
- Verification results: `node packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`, `pnpm -F @ludoforge/engine test`, `pnpm turbo typecheck`, and `pnpm turbo lint` all passed.
