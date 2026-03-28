# 92ENUSTASNA-001: Snapshot types and lazy accessor factories

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: Spec 90 (compiled condition predicates — already implemented)

## Problem

Legal move enumeration redundantly queries the same state properties (global vars, per-player vars, zone token counts, zone variables, marker states) across 20+ pipeline actions per `legalMoves` call. A flat, once-per-call snapshot with lazy accessors eliminates this redundancy without modifying any hot-path kernel function.

## Assumption Reassessment (2026-03-28)

1. `GameState` has `globalVars`, `perPlayerVars`, `zoneVars` fields — confirmed in `packages/engine/src/kernel/types.ts`.
2. `PlayerId` branded type exists — confirmed in kernel types.
3. `GameDef` has zone definitions needed for token iteration — confirmed.
4. No `enumeration-snapshot.ts` file exists yet — confirmed.

## Architecture Check

1. The snapshot is a pure, read-only data structure with lazy accessors backed by plain `Map` + closure — no class instances, no prototype chains. This is the simplest possible design that avoids V8 hidden-class deoptimization.
2. All snapshot fields use generic state properties (`globalVars`, `perPlayerVars`, `zoneVars`, zone tokens, markers). No game-specific knowledge. Satisfies F1 (Agnosticism).
3. No backwards-compatibility shims — this is a new module with no pre-existing consumers.

## What to Change

### 1. Create `packages/engine/src/kernel/enumeration-snapshot.ts`

Define the following types and factory functions:

- `EnumerationStateSnapshot` interface — fields: `globalVars`, `activePlayerVars`, `activePlayer`, `zoneTotals`, `zoneVars`, `markerStates`
- `LazyZoneTotals` interface — `get(key: string): number`
- `LazyZoneVars` interface — `get(zoneId: string, varName: string): number | boolean | string | undefined`
- `LazyMarkerStates` interface — `get(spaceId: string, markerName: string): number | string | undefined`
- `createEnumerationSnapshot(def, state, activePlayer)` — factory that creates the snapshot
- `createLazyZoneTotals(state, def)` — lazy zone token count accessor (composite key: `"zoneId:tokenType"` or `"zoneId:*"`)
- `createLazyZoneVars(state)` — lazy zone variable accessor
- `createLazyMarkerStates(state)` — lazy marker state accessor
- `computeZoneTotal(state, def, key)` — parses composite key, iterates zone tokens once

Each lazy accessor is a closure over a backing `Map<string, T>` and the source state. First access computes and caches; subsequent accesses are O(1) Map lookups.

## Files to Touch

- `packages/engine/src/kernel/enumeration-snapshot.ts` (new)

## Out of Scope

- Modifying `CompiledConditionPredicate` type signature (ticket 002)
- Modifying `condition-compiler.ts` compiled closures (ticket 002)
- Threading snapshot through `pipeline-viability-policy.ts` (ticket 003)
- Wiring snapshot creation in `legal-moves.ts` (ticket 004)
- Modifying any existing kernel types (`GameState`, `GameDef`, `ReadContext`, `GameDefRuntime`, `EffectCursor`, `Move`)
- Adding fields to any hot-path kernel object
- Any runner/frontend changes

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `createEnumerationSnapshot` produces an object with correct `globalVars` reference (same object identity as `state.globalVars`)
2. Unit test: `createEnumerationSnapshot` produces correct `activePlayerVars` reference for the given player
3. Unit test: `createEnumerationSnapshot` returns empty object for `activePlayerVars` when player has no vars
4. Unit test: `LazyZoneTotals.get("zoneId:tokenType")` returns correct count on first access
5. Unit test: `LazyZoneTotals.get("zoneId:*")` returns total token count in zone
6. Unit test: `LazyZoneTotals.get` returns cached value on second access (same result, computed once)
7. Unit test: `LazyZoneVars.get(zoneId, varName)` returns correct zone variable value
8. Unit test: `LazyZoneVars.get` returns `undefined` for nonexistent zone/var
9. Unit test: `LazyMarkerStates.get(spaceId, markerName)` returns correct marker value
10. Unit test: `LazyMarkerStates.get` returns `undefined` for nonexistent space/marker
11. Existing suite: `pnpm turbo test --force`

### Invariants

1. Snapshot is a plain object — no class instances, no prototype chains.
2. Lazy accessors compute each unique key at most once (write-once cache semantics).
3. Snapshot does not mutate the source `GameState` or `GameDef`.
4. All types use `PlayerId` branded type for `activePlayer` (F12).
5. No game-specific knowledge in any function — purely generic state access (F1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` — covers all acceptance criteria above. Uses minimal synthetic `GameState`/`GameDef` fixtures.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="enumeration-snapshot"`
2. `pnpm turbo test --force`
3. `pnpm turbo typecheck`
