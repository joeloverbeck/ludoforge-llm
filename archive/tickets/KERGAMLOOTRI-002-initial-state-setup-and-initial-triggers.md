# KERGAMLOOTRI-002 - Initial State Setup and Initial Triggers

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement `initialState(def, seed, playerCount?)` with deterministic setup execution, initial trigger dispatch order, and full-hash initialization.

## Reassessed Assumptions (Current Code/Test Baseline)
- `src/kernel/initial-state.ts` is still a `KERGAMLOOTRI-001` stub and currently throws.
- `src/kernel/trigger-dispatch.ts` is also a stub and currently throws.
- `test/unit/game-loop-api-shape.test.ts` currently expects these stubs to throw `not implemented`.
- There is no `test/unit/initial-state.test.ts` yet.
- Existing hash tests (`test/unit/zobrist-hash-updates.test.ts`) are independent helpers and do not currently cover `initialState`.

## Scope
- Validate and resolve `playerCount` (argument or `metadata.players.min`).
- Initialize base `GameState` fields:
  - `globalVars`, `perPlayerVars`, `zones`, `playerCount`, `activePlayer`, `currentPhase`, `turnCount`, `actionUsage`, `rng`.
- Apply `def.setup` effects.
- Dispatch startup events in required order:
  - `turnStart` (depth 0)
  - `phaseEnter(firstPhase)` (depth 0)
- Compute and set `stateHash` via `computeFullHash` after setup + startup triggers.
- Implement only the trigger-dispatch behavior required to support startup dispatch in `initialState`:
  - deterministic trigger matching order (`def.triggers` order),
  - event matching,
  - optional `match`/`when` condition evaluation,
  - trigger effect application.

## File List Expected To Touch
- `src/kernel/initial-state.ts`
- `src/kernel/trigger-dispatch.ts` (minimal implementation needed by startup trigger dispatch)
- `test/unit/initial-state.test.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (update expectations now that `initialState`/`dispatchTriggers` are implemented)

## Out Of Scope
- Legal move generation.
- Move application and action usage increments after moves.
- Phase/turn advancement beyond startup initialization.
- No-legal-move auto-advance loop.
- Recursive trigger event cascade behavior beyond current startup needs.
- Trigger truncation/depth-limit cascade metadata beyond honoring dispatch call signature.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/initial-state.test.ts`
  - initial vars/zones/player metadata are initialized as defined.
  - omitted `playerCount` defaults to `metadata.players.min`.
  - invalid `playerCount` throws a descriptive error.
  - setup effects are applied before final hash capture.
  - startup trigger order is `turnStart` then `phaseEnter`.
  - returned `stateHash` equals `computeFullHash` recomputation.
  - same `seed` + same `GameDef` yields byte-identical initial state fields.
- Existing deterministic hash tests remain green:
  - `test/unit/zobrist-hash-updates.test.ts`

## Invariants That Must Remain True
- `initialState` is deterministic for fixed `(def, seed, playerCount)`.
- `turnCount` starts at `0`, `activePlayer` at player `0`, and phase at first declared phase.
- No token is created except via setup effects/triggers.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Implemented `initialState(def, seed, playerCount?)` with deterministic base state initialization, setup execution, startup event dispatch (`turnStart` then `phaseEnter(firstPhase)`), and final `computeFullHash` state hashing.
  - Implemented a minimal deterministic `dispatchTriggers` needed by startup flow (event matching, ordered trigger evaluation, optional `match`/`when`, effect application, depth truncation for `depth > maxDepth`).
  - Added `test/unit/initial-state.test.ts` for initialization, defaults/validation, setup+trigger ordering, hash recomputation, determinism, and empty-phase invariant coverage.
  - Updated `test/unit/game-loop-api-shape.test.ts` to assert implemented behavior for `initialState` and `dispatchTriggers` while leaving other game-loop stubs unchanged.
- Deviations from original plan:
  - Added a focused `dispatchTriggers` implementation in this ticket because startup trigger dispatch could not be completed correctly while it remained stubbed.
  - Added an explicit empty `turnStructure.phases` failure test as an extra invariant guard.
- Verification:
  - `npm test` (passes)
  - `node --test \"dist/test/unit/initial-state.test.js\"` (passes)
