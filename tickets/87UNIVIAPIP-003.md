# 87UNIVIAPIP-003: Create cached discoverer in enumerateRawLegalMoves and thread to enumeration call sites

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/legal-moves.ts
**Deps**: archive/tickets/87UNIVIAPIP-001.md

## Problem

During enumeration, `isMoveDecisionSequenceAdmittedForLegalMove` calls `classifyMoveDecisionSequenceSatisfiability` which calls `legalChoicesDiscover(def, state, baseMove)`. During classification, `probeMoveViability` calls `resolveMoveDecisionSequence` which calls `legalChoicesDiscover(def, state, baseMove)` on the **same** `(def, state, baseMove)` tuple for event moves. This ticket creates the cache and populates it during enumeration.

## Assumption Reassessment (2026-03-27)

1. `enumerateRawLegalMoves` (legal-moves.ts:1077) returns `RawLegalMoveEnumerationResult` with `{ moves, warnings }` — confirmed at line 1082.
2. `isMoveDecisionSequenceAdmittedForLegalMove` is called at lines 441, 963, 1057, and 1228 in legal-moves.ts — confirmed via grep.
3. All four call sites pass `(def, state, move, context, { budgets, onWarning }, runtime)` — after 87UNIVIAPIP-001, those helper options use `MoveDecisionSequenceSatisfiabilityOptions`, which now also accepts `discoverer`.
4. `applyTurnFlowWindowFilters` (line 1259) calls `Array.prototype.filter` on `enumeration.moves`, preserving Move object references — confirmed by reading legal-moves-turn-order.ts.
5. `RawLegalMoveEnumerationResult` is a private interface (line 101) — extending it with `discoveryCache` does not affect public API.

## Architecture Check

1. The cached discoverer wraps `legalChoicesDiscover` with a Map keyed by Move object reference. This avoids identity-key computation cost and leverages reference stability through the pipeline.
2. The cache is created once in `enumerateRawLegalMoves` and discarded after `enumerateLegalMoves` completes — no lifecycle management needed.
3. No backwards-compatibility shims. The `discoverer` parameter added by 87UNIVIAPIP-001 is optional, so existing tests and callers are unaffected.

## Architectural Note

87UNIVIAPIP-001 did **not** add `discoverer` through `Omit<ResolveMoveDecisionSequenceOptions, 'choose'>`.
It introduced a dedicated `MoveDecisionSequenceSatisfiabilityOptions` type instead. Implement this ticket against that explicit classification-options contract so resolve-time and classification-time concerns remain separated.

## What to Change

### 1. Extend `RawLegalMoveEnumerationResult` with optional discoveryCache

```typescript
interface RawLegalMoveEnumerationResult {
  readonly moves: readonly Move[];
  readonly warnings: readonly RuntimeWarning[];
  readonly discoveryCache: DiscoveryCache;
}
```

### 2. Create cached discoverer in `enumerateRawLegalMoves`

At the top of `enumerateRawLegalMoves` (after the early return for ineligible seats), create the cache and a discoverer wrapper:

```typescript
const discoveryCache: DiscoveryCache = new Map();

const cachedDiscover: DecisionSequenceChoiceDiscoverer = (move, discoverOptions) => {
  const cached = discoveryCache.get(move);
  if (cached !== undefined) return cached;
  const result = legalChoicesDiscover(def, state, move, {
    ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
      ? {}
      : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
  }, runtime);
  discoveryCache.set(move, result);
  return result;
};
```

### 3. Pass `cachedDiscover` to all `isMoveDecisionSequenceAdmittedForLegalMove` call sites

At each of the four call sites (lines ~441, ~963, ~1057, ~1228), add `discoverer: cachedDiscover` to the options object:

```typescript
isMoveDecisionSequenceAdmittedForLegalMove(
  def, state, move, context,
  { budgets: enumeration.budgets, onWarning: ..., discoverer: cachedDiscover },
  runtime,
)
```

**Note**: The `cachedDiscover` function must be accessible at all four call sites. Since all four are inside functions called within `enumerateRawLegalMoves`'s scope (either directly or via helper functions that accept parameters), the discoverer needs to be threaded as a parameter to internal helpers that call `isMoveDecisionSequenceAdmittedForLegalMove` or `classifyMoveDecisionSequenceAdmissionForLegalMove`.

Verify each helper's signature and add a `discoverer` parameter where needed. These are all module-private functions — no public API change.

### 4. Return discoveryCache from `enumerateRawLegalMoves`

```typescript
return { moves: finalMoves, warnings, discoveryCache };
```

Also handle the early-return case (ineligible seat) by returning an empty Map:

```typescript
if (!isActiveSeatEligibleForTurnFlow(def, state, seatResolution)) {
  return { moves: [], warnings, discoveryCache: new Map() };
}
```

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify) — create cache, wrap discoverer, thread to call sites, extend return type

## Out of Scope

- `move-decision-sequence.ts` — already handled in 87UNIVIAPIP-001 and 87UNIVIAPIP-002
- `apply-move.ts` — `probeMoveViability` is NOT changed here (that's 87UNIVIAPIP-004)
- Classification pipeline (`classifyEnumeratedMoves`) — NOT changed here (that's 87UNIVIAPIP-004)
- `enumerateLegalMoves` — NOT changed here beyond consuming the new return field (that's 87UNIVIAPIP-004)
- Any hot-path object shapes (Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, GameDefRuntime)
- `legalMoves` function (line 1277) — this calls `enumerateRawLegalMoves` but discards the cache (it only returns `moves`), which is correct

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests pass unchanged — cache population is transparent (same `legalChoicesDiscover` calls happen, just stored in a Map).
2. `pnpm turbo test` passes with no regressions.
3. `pnpm turbo typecheck` passes.
4. `classified-move-parity.test.ts` passes — same moves enumerated, same classification results.

### Invariants

1. The cached discoverer calls `legalChoicesDiscover` exactly once per unique Move object reference. Subsequent calls for the same Move object return the cached `ChoiceRequest`.
2. The cache is scoped to a single `enumerateRawLegalMoves` invocation and does not persist.
3. No new fields on Move, MoveEnumerationState, ClassifiedMove, EffectCursor, ReadContext, or GameDefRuntime.
4. The `legalMoves` convenience function (line 1277) continues to work — it accesses `.moves` and ignores `discoveryCache`.
5. All four `isMoveDecisionSequenceAdmittedForLegalMove` call sites receive the cached discoverer.

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — behavioral verification in 87UNIVIAPIP-005.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
