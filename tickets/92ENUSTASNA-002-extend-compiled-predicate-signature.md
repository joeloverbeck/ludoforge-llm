# 92ENUSTASNA-002: Extend CompiledConditionPredicate signature for snapshot reads

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — condition-compiler type + closure bodies
**Deps**: 92ENUSTASNA-001

## Problem

Spec 90's compiled condition predicates read state properties via `state.globalVars[name]` and `state.perPlayerVars[player][name]` at call time. When a snapshot is available (during legalMoves enumeration), closures should prefer pre-materialized snapshot reads to eliminate redundant property access chains across pipeline actions.

## Assumption Reassessment (2026-03-28)

1. `CompiledConditionPredicate` is currently `(state, activePlayer, bindings) => boolean` — confirmed in `condition-compiler.ts:7-11`.
2. `tryCompileCondition` compiles comparison conditions with `compileComparisonAccessor` producing closures that read `state.globalVars`, `state.perPlayerVars` — confirmed.
3. `CompiledConditionPredicate` is referenced in `compiled-condition-cache.ts` — the type flows through; no structural cache changes needed.
4. Compiled closures for `and`, `or`, `not` delegate to sub-closures — these must also thread the snapshot parameter.
5. Ticket `001` introduced `snapshot.zoneTotals`, but this ticket still does not consume it. The remaining Spec 92 series only wires snapshot reads for `globalVars` and active-player `perPlayerVars`. Any future compiled aggregate use of zone totals should move off the composite-string accessor first.

## Architecture Check

1. Adding an optional trailing parameter to `CompiledConditionPredicate` is the minimal change. V8 handles optional parameters efficiently (undefined if not provided). No hidden-class changes to call sites that omit the parameter.
2. Closures use a ternary (`snapshot ? snapshot.X : state.X`) — no branching at the type level, clean fallback for non-snapshot contexts.
3. No backwards-compatibility shims: all consumers are updated in the same ticket series (F9). The optional parameter means existing call sites that don't pass snapshot continue working identically.

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

### 2. Update `compileComparisonAccessor` closures

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

### 3. Thread snapshot in `and`, `or`, `not` combinators

The compiled `and`/`or`/`not` closures must pass the `snapshot` parameter through to their sub-closures:
```typescript
// and:
(state, activePlayer, bindings, snapshot) =>
  compiledArgs.every(fn => fn(state, activePlayer, bindings, snapshot))
```

### 4. Import `EnumerationStateSnapshot` type

Add import of `EnumerationStateSnapshot` from `./enumeration-snapshot.js` in `condition-compiler.ts`.

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (modify)

## Out of Scope

- Creating the snapshot module (ticket 001)
- Modifying `pipeline-viability-policy.ts` to pass snapshot (ticket 003)
- Modifying `legal-moves.ts` (ticket 004)
- Adding snapshot reads for `zoneTotals`, `zoneVars`, or `markerStates` (those require aggregate/zone-level compiled closures — future enhancement beyond current `tryCompileCondition` scope)
- Introducing any new compiled consumer of the composite-string `snapshot.zoneTotals.get(key)` API; that follow-up belongs in `92ENUSTASNA-007`
- Modifying `compiled-condition-cache.ts` (type flows automatically from the re-exported `CompiledConditionPredicate`)
- Modifying any other kernel types or hot-path objects

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: compiled predicate for `gvar.X == value` returns correct result when called WITH snapshot (reads from `snapshot.globalVars`)
2. Unit test: compiled predicate for `gvar.X == value` returns correct result when called WITHOUT snapshot (reads from `state.globalVars`) — backwards compatibility
3. Unit test: compiled predicate for `pvar.X == value` (active player) returns correct result with snapshot (reads from `snapshot.activePlayerVars`)
4. Unit test: compiled predicate for `pvar.X == value` (active player) returns correct result without snapshot
5. Unit test: `and` combinator threads snapshot to all sub-closures
6. Unit test: `or` combinator threads snapshot to all sub-closures
7. Unit test: `not` combinator threads snapshot to sub-closure
8. Unit test: snapshot with DIFFERENT values from state → compiled closure reads snapshot values (proves snapshot is preferred over state)
9. Existing suite: `pnpm turbo test --force`

### Invariants

1. `CompiledConditionPredicate` without a snapshot argument produces identical results to before this change — no behavioral regression.
2. No new imports in hot-path kernel functions (`evalCondition`, `evalValue`, `resolveRef`).
3. `compiled-condition-cache.ts` requires no code changes (type propagates).
4. No fields added to `GameDefRuntime`, `ReadContext`, `EffectCursor`, or `Move`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/compiled-predicate-snapshot.test.ts` — tests compiled predicate behavior with and without snapshot for all accessor types and logical combinators.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/compiled-predicate-snapshot.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`
