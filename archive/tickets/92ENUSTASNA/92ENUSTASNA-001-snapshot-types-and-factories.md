# 92ENUSTASNA-001: Snapshot types and lazy accessor factories

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: archive/tickets/90COMCONPRE/90COMCONPRE-001-condition-compiler-tier1-scalar.md, archive/specs/92-enumeration-state-snapshot.md

## Problem

Legal move enumeration redundantly queries the same state properties (global vars, per-player vars, zone token counts, zone variables, marker states) across 20+ pipeline actions per `legalMoves` call. A flat, once-per-call snapshot with lazy accessors eliminates this redundancy without modifying any hot-path kernel function.

## Assumption Reassessment (2026-03-28)

1. `GameState` has `globalVars`, `perPlayerVars`, `zoneVars`, `zones`, and `markers` fields in `packages/engine/src/kernel/types-core.ts`, re-exported through `packages/engine/src/kernel/types.ts`.
2. `VariableValue` is `number | boolean`, not `number | boolean | string`. Zone vars remain `number`, and marker states remain `string`.
3. `PlayerId` and `ZoneId` branded types already exist in `packages/engine/src/kernel/branded.ts`.
4. `CompiledConditionPredicate` currently compiles reads for `gvar`, active-player `pvar`, and unfiltered `count(tokensInZone)` only. Zone-var and marker snapshot accessors are foundation work in this ticket, but they are not consumed until later compiler/runtime tickets.
5. No `enumeration-snapshot.ts` file exists yet — confirmed.

## Architecture Check

1. The snapshot is a pure, read-only data structure with lazy accessors backed by plain `Map` + closure — no class instances, no prototype chains. This is the simplest possible design that avoids V8 hidden-class deoptimization.
2. All snapshot fields use generic state properties (`globalVars`, `perPlayerVars`, `zoneVars`, zone tokens, markers). No game-specific knowledge. Satisfies F1 (Agnosticism).
3. A dedicated enumeration snapshot module is cleaner than pushing caches into `evalCondition`, `evalValue`, `resolveRef`, or `ReadContext`. It keeps enumeration-specific memoization out of the generic evaluator path and preserves the current architecture’s separation between generic evaluation and legal-move preflight optimization.
4. No backwards-compatibility shims — this is a new module with no pre-existing consumers.

## What to Change

### 1. Create `packages/engine/src/kernel/enumeration-snapshot.ts`

Define the following types and factory functions:

- `EnumerationStateSnapshot` interface — fields: `globalVars`, `activePlayerVars`, `activePlayer`, `zoneTotals`, `zoneVars`, `markerStates`
- `LazyZoneTotals` interface — `get(key: string): number`
- `LazyZoneVars` interface — `get(zoneId: ZoneId | string, varName: string): number | undefined`
- `LazyMarkerStates` interface — `get(spaceId: string, markerName: string): string | undefined`
- `createEnumerationSnapshot(def, state, activePlayer)` — factory that creates the snapshot
- `createLazyZoneTotals(state, def)` — lazy zone token count accessor (composite key: `"zoneId:tokenType"` or `"zoneId:*"`)
- `createLazyZoneVars(state)` — lazy zone variable accessor
- `createLazyMarkerStates(state)` — lazy marker state accessor
- `computeZoneTotal(state, def, key)` — parses composite key, iterates zone tokens once

Each lazy accessor is a closure over a backing `Map<string, T>` and the source state. First access computes and caches; subsequent accesses are O(1) Map lookups.

Implementation note:
- `createEnumerationSnapshot` should accept `def` for architectural alignment with the spec and downstream tickets, even if ticket 001 only needs `state` to compute the currently used accessors.
- `zoneTotals` should support both `"zoneId:*"` and `"zoneId:tokenType"` keys so the foundation is ready for later compiled aggregate extensions without reshaping the snapshot API again.

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
11. Unit test: `computeZoneTotal` throws on malformed composite keys instead of silently returning an incorrect count
12. Existing suite: `pnpm turbo test --force`

### Invariants

1. Snapshot is a plain object — no class instances, no prototype chains.
2. Lazy accessors compute each unique key at most once (write-once cache semantics).
3. Snapshot does not mutate the source `GameState` or `GameDef`.
4. All types use `PlayerId` branded type for `activePlayer` (F12).
5. Accessors expose current truth types only: global/per-player vars are `number | boolean`, zone vars are `number`, marker states are `string`.
6. No game-specific knowledge in any function — purely generic state access (F1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` — covers all acceptance criteria above. Uses minimal synthetic `GameState`/`GameDef` fixtures.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-28

What actually changed:
- Added `packages/engine/src/kernel/enumeration-snapshot.ts` with `EnumerationStateSnapshot`, lazy accessor interfaces, `createEnumerationSnapshot`, `createLazyZoneTotals`, `createLazyZoneVars`, `createLazyMarkerStates`, and `computeZoneTotal`.
- Exported the new module from `packages/engine/src/kernel/index.ts`.
- Added `packages/engine/test/unit/kernel/enumeration-snapshot.test.ts` covering snapshot references, missing active-player vars, zone totals, lazy caching behavior, zone vars, marker states, and malformed composite-key handling.
- Corrected this ticket’s assumptions so they match the real codebase: current variable types, current compiled-condition coverage, and Node test-runner command shape.

Deviations from original plan:
- `computeZoneTotal` parses composite keys against declared `def.zones` instead of naively splitting on `:`. This keeps the specified key format while avoiding ambiguity because runtime zone ids already contain `:`.
- The ticket remains intentionally foundational. Zone-var and marker accessors are implemented here, but they are not yet wired into compiled predicate consumers in this ticket.

Verification results:
- `pnpm turbo build` ✅
- `node --test packages/engine/dist/test/unit/kernel/enumeration-snapshot.test.js` ✅
- `pnpm turbo test --force` ✅
- `pnpm turbo lint` ✅
- `pnpm -F @ludoforge/engine typecheck` ✅
- `pnpm turbo typecheck` ❌ pre-existing `packages/runner` failures, dominated by unresolved `@ludoforge/engine/runtime` / `@ludoforge/engine/cnl` imports and unrelated implicit-`any` errors. No failures were reported in `packages/engine`.
