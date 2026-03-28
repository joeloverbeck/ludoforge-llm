# 92ENUSTASNA-002: Extend CompiledConditionPredicate signature for snapshot reads

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — condition-compiler type + closure bodies
**Deps**: 92ENUSTASNA-001

## Problem

Spec 90's compiled condition predicates read state properties via `state.globalVars[name]` and `state.perPlayerVars[player][name]` at call time. When a snapshot is available (during legalMoves enumeration), closures should prefer pre-materialized snapshot reads to eliminate redundant property access chains across pipeline actions.

## Assumption Reassessment (2026-03-28)

1. `CompiledConditionPredicate` is currently `(state, activePlayer, bindings) => boolean` — confirmed in `condition-compiler.ts`.
2. There is no `compileComparisonAccessor` helper in the current code. The relevant flow is `tryCompileCondition` → `tryCompileValueExpr` → `compileReferenceAccessor` / `compileAggregateCountAccessor` → `compileComparison`.
3. `enumeration-snapshot.ts` already exists and exports `EnumerationStateSnapshot`, `createEnumerationSnapshot`, and the lazy accessors introduced by ticket `001`.
4. `CompiledConditionPredicate` is referenced in `compiled-condition-cache.ts` and a few test helpers. Because this ticket only extends the callable signature, the cache structure still requires no direct changes.
5. Compiled boolean combinators (`and`, `or`, `not`) currently delegate to child predicates without any snapshot parameter. They must thread the snapshot through to preserve fast-path behavior for nested compiled trees.
6. The current compiler already handles a small aggregate fast path (`count(tokensInZone(<static-zone>))`) via `compileAggregateCountAccessor`. The original ticket scoped that out too aggressively. If we are extending compiled closures to consume enumeration snapshots, the existing aggregate fast path should also read from `snapshot.zoneTotals` when present rather than leaving one compiled accessor family on the old architecture.
7. Existing coverage already lives in `packages/engine/test/unit/kernel/condition-compiler.test.ts` and `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts`. Creating a brand-new snapshot-specific compiled predicate test file is optional, not required.

## Architecture Check

1. Extending both `CompiledConditionPredicate` and `CompiledConditionValueAccessor` with the same optional trailing `snapshot` parameter is cleaner than only changing the top-level predicate type. This keeps the architecture uniform: leaf accessors decide whether to read raw state or snapshot data, while `compileComparison` and the boolean combinators simply thread the argument through.
2. The current architecture already has a dedicated compiled-accessor layer. Using that layer for snapshot preference is more robust than duplicating snapshot branching inside each comparison closure.
3. The aggregate fast path should consume `snapshot.zoneTotals` now. Leaving aggregate accessors outside the snapshot architecture would create an inconsistent compiled layer where some compiled reads are snapshot-aware and others are not.
4. No backwards-compatibility shims or aliases are introduced. All internal callers are updated together, while non-enumeration call sites can continue omitting the trailing optional parameter.

## What to Change

### 1. Extend `CompiledConditionPredicate` type

In `packages/engine/src/kernel/condition-compiler.ts`, change:

```typescript
export type CompiledConditionPredicate = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
) => boolean;
```

to:

```typescript
export type CompiledConditionPredicate = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
  snapshot?: EnumerationStateSnapshot,
) => boolean;
```

### 2. Extend compiled value accessors, not just top-level predicates

In `packages/engine/src/kernel/condition-compiler.ts`, change:

```typescript
export type CompiledConditionValueAccessor = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
) => ScalarValue | ScalarArrayValue;
```

to:

```typescript
export type CompiledConditionValueAccessor = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
  snapshot?: EnumerationStateSnapshot,
) => ScalarValue | ScalarArrayValue;
```

### 3. Update compiled accessor closures

When the accessor reads a global variable (`gvar`), the closure becomes:
```typescript
(state, _activePlayer, _bindings, snapshot) =>
  snapshot ? snapshot.globalVars[name] : state.globalVars[name]
```

When the accessor reads an active player variable (`pvar` with `active` player), the closure becomes:
```typescript
(state, activePlayer, _bindings, snapshot) =>
  snapshot ? snapshot.activePlayerVars[name] : state.perPlayerVars[activePlayer]?.[name]
```

For the existing aggregate fast path `count(tokensInZone(<static-zone>))`, the accessor becomes:
```typescript
(_state, _activePlayer, _bindings, snapshot) =>
  snapshot ? snapshot.zoneTotals.get(`${zoneId}:*`) : /* existing zone token count logic */
```

### 4. Thread snapshot through `compileComparison` and `and` / `or` / `not`

`compileComparison` must pass `snapshot` to both accessors. The compiled `and`/`or`/`not` closures must also pass the snapshot parameter through to their sub-closures:

```typescript
// and:
(state, activePlayer, bindings, snapshot) =>
  compiledArgs.every(fn => fn(state, activePlayer, bindings, snapshot))
```

### 5. Import `EnumerationStateSnapshot` type

Add import of `EnumerationStateSnapshot` from `./enumeration-snapshot.js` in `condition-compiler.ts`.

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (modify)

## Out of Scope

- Creating the snapshot module (ticket 001)
- Modifying `pipeline-viability-policy.ts` to pass snapshot (ticket 003)
- Modifying `legal-moves.ts` (ticket 004)
- Adding snapshot reads for `zoneVars` or `markerStates` (the current compiler has no fast path for those references yet)
- Expanding compiled aggregate support beyond the existing `count(tokensInZone(<static-zone>))` fast path
- Modifying `compiled-condition-cache.ts` (type flows automatically from the re-exported `CompiledConditionPredicate`)
- Modifying any other kernel types or hot-path objects

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: compiled predicate for `gvar.X == value` returns correct result when called WITH snapshot (reads from `snapshot.globalVars`)
2. Unit test: compiled predicate for `gvar.X == value` returns correct result when called WITHOUT snapshot (reads from `state.globalVars`) — backwards compatibility
3. Unit test: compiled predicate for `pvar.X == value` (active player) returns correct result with snapshot (reads from `snapshot.activePlayerVars`)
4. Unit test: compiled predicate for `pvar.X == value` (active player) returns correct result without snapshot
5. Unit test: compiled aggregate `count(tokensInZone(<static-zone>))` returns the snapshot-backed count when called with snapshot
6. Unit test: `and` combinator threads snapshot to all sub-closures
7. Unit test: `or` combinator threads snapshot to all sub-closures
8. Unit test: `not` combinator threads snapshot to sub-closure
9. Unit test: snapshot with DIFFERENT values from state → compiled closure reads snapshot values (proves snapshot is preferred over state)
10. Existing suite: `pnpm turbo test --force`

### Invariants

1. `CompiledConditionPredicate` without a snapshot argument produces identical results to before this change — no behavioral regression.
2. No new imports in hot-path kernel functions (`evalCondition`, `evalValue`, `resolveRef`).
3. `compiled-condition-cache.ts` requires no code changes (type propagates).
4. No fields added to `GameDefRuntime`, `ReadContext`, `EffectCursor`, or `Move`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — extend existing compiled predicate coverage with snapshot-aware assertions for `gvar`, active `pvar`, static-zone aggregate count, and boolean combinators.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Extended both `CompiledConditionPredicate` and `CompiledConditionValueAccessor` to accept an optional `EnumerationStateSnapshot`.
  - Threaded the snapshot through `compileComparison` and compiled boolean combinators (`and`, `or`, `not`).
  - Updated compiled `gvar`, active-player `pvar`, and the existing static-zone aggregate count fast path to prefer snapshot data when provided.
  - Strengthened `packages/engine/test/unit/kernel/condition-compiler.test.ts` with snapshot-specific coverage instead of creating a new standalone test file.
- Deviations from original plan:
  - The ticket was corrected before implementation because its assumptions were stale: `enumeration-snapshot.ts` already existed, the compiler flow no longer used `compileComparisonAccessor`, and the existing aggregate count fast path was brought into scope because leaving it raw-state-only would have produced an inconsistent compiled architecture.
  - Test coverage was added to the existing condition-compiler unit file rather than a new `compiled-predicate-snapshot.test.ts` file.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test --force`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
