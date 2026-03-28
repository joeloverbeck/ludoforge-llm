# 91FIRDECDOMCOM-003: Cache infrastructure and legal-moves integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new cache module + modify `legal-moves.ts`
**Deps**: tickets/91FIRDECDOMCOM-002.md

## Problem

The compiled first-decision domain checks from 002 need to be:
1. Cached per GameDef (computed once at `createGameDefRuntime` time, reused
   for every `legalMoves` call).
2. Integrated into the three admission check call sites in `legal-moves.ts`
   (pipeline ~line 1287, plain action ~line 480, event card ~line 1097).

## Assumption Reassessment (2026-03-28)

1. Spec 90's cache uses a module-level `WeakMap<GameDef, ...>` pattern in
   `compiled-condition-cache.ts`. Same pattern applies here — no fields
   added to `GameDefRuntime` (spec requirement: "No fields added to
   GameDefRuntime or any hot-path object").
2. `isMoveDecisionSequenceAdmittedForLegalMove` is called at exactly 3
   sites in `legal-moves.ts` (confirmed: lines ~477, ~1097, ~1287).
3. Event card admission checks fall through to the interpreter (spec says
   "Event card admission checks fall through to the interpreter" for v1).
4. `GameDefRuntime` is NOT modified — the WeakMap is keyed on `GameDef`.
5. The `runtime` parameter is already threaded to all three call sites.

## Architecture Check

1. WeakMap keyed on `GameDef` — cache is garbage-collected when the GameDef
   is no longer referenced. No memory leaks. Matches Spec 90 pattern exactly.
2. Integration is a GUARD pattern: check compiled result first, skip the
   expensive `isMoveDecisionSequenceAdmittedForLegalMove` when possible,
   fall through otherwise. No restructuring of existing control flow.
3. F7 (immutability): cache is populated once per GameDef, stored in a
   `ReadonlyMap`. F9 (no backwards compat): no fallback shims — actions
   without compiled checks use the existing path naturally.

## What to Change

### 1. Create `first-decision-cache.ts`

```typescript
/** Module-level WeakMap cache, same pattern as compiled-condition-cache.ts. */
const cache = new WeakMap<GameDef, ReadonlyMap<ActionId, FirstDecisionDomainResult>>();

/**
 * Returns the compiled first-decision domain check for the given action,
 * or undefined if the action was not compilable.
 */
export function getCompiledFirstDecisionDomain(
  def: GameDef,
  actionId: ActionId,
): FirstDecisionDomainResult | undefined;
```

The cache is lazily populated on first access for a given `GameDef`.
Population iterates all actions in `def.actions`, calling
`compileActionFirstDecision` from 002 for each.

### 2. Modify `legal-moves.ts` — Pipeline call site (~line 1287)

Before the existing `isMoveDecisionSequenceAdmittedForLegalMove` call:

```typescript
const domainResult = getCompiledFirstDecisionDomain(def, action.id);
if (domainResult?.compilable && domainResult.check) {
  const checkResult = domainResult.check(state, state.activePlayer);
  if (!checkResult.admissible) {
    continue; // Fast rejection
  }
  if (domainResult.isSingleDecision && checkResult.domain !== undefined) {
    // Single-decision bypass: emit move directly from compiled domain.
    // ... (construct move from domain, push to results)
    continue;
  }
}
// Fall through to existing isMoveDecisionSequenceAdmittedForLegalMove
```

### 3. Modify `legal-moves.ts` — Plain action call site (~line 480)

Same guard pattern as pipeline. The compiled check operates on
`action.effects` (non-pipeline path).

### 4. Modify `legal-moves.ts` — Event card call site (~line 1097)

No compiled check — event cards fall through to interpreter. Add a comment
explaining why (runtime-resolved effect trees per spec).

## Files to Touch

- `packages/engine/src/kernel/first-decision-cache.ts` (new)
- `packages/engine/src/kernel/legal-moves.ts` (modify — 3 call sites)
- `packages/engine/test/unit/kernel/first-decision-cache.test.ts` (new)

## Out of Scope

- Modifying `gamedef-runtime.ts` — the cache is module-level, NOT in
  GameDefRuntime.
- Event card first-decision compilation (per-card cache is future work).
- Modifying the `isMoveDecisionSequenceAdmittedForLegalMove` function
  itself — it remains unchanged as the fallback.
- Changing the `ChoiceRequest` construction logic for single-decision
  bypass beyond what's needed to emit the move correctly.
- Modifying any other kernel module besides `legal-moves.ts`.

## Acceptance Criteria

### Tests That Must Pass

1. `getCompiledFirstDecisionDomain` returns `undefined` for actions not
   present in the GameDef.
2. `getCompiledFirstDecisionDomain` returns a `FirstDecisionDomainResult`
   for actions that ARE compilable.
3. `getCompiledFirstDecisionDomain` returns `{ compilable: false }` for
   actions with non-compilable first-decision patterns.
4. Cache is populated lazily — second call with same GameDef does NOT
   recompile.
5. Cache is per-GameDef — two different GameDefs get separate caches.
6. Integration: pipeline action with compilable first decision and empty
   domain is SKIPPED (not included in legal moves).
7. Integration: pipeline action with compilable first decision and non-empty
   domain proceeds to full admission check (multi-decision) OR is emitted
   directly (single-decision).
8. Integration: plain action with compilable first decision and empty domain
   is SKIPPED.
9. Integration: event card actions still go through the interpreter path
   (no regression).
10. Integration: actions with `{ compilable: false }` fall through to
    `isMoveDecisionSequenceAdmittedForLegalMove` without error.
11. Existing suite: `pnpm turbo test --force`

### Invariants

1. `GameDefRuntime` interface is NOT modified.
2. No new fields on any hot-path object (`Move`, `GameState`, etc.).
3. The guard pattern is ADDITIVE — if the compiled check is inconclusive
   or absent, the existing interpreter path executes unchanged.
4. The `legalMoves` function produces identical results with and without
   the compiled checks (semantic equivalence — proven by 91FIRDECDOMCOM-004).
5. WeakMap cache is garbage-collected when GameDef is dereferenced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/first-decision-cache.test.ts` —
   Cache API tests (lazy population, per-GameDef isolation, lookup behavior).
2. Targeted integration tests for the guard pattern in legal-moves.ts
   (can be co-located with cache tests or in a separate file).

### Commands

1. `pnpm -F @ludoforge/engine test 2>&1 | grep -E 'first-decision|FAIL'`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`
