# KERGAMLOOTRI-002 - Initial State Setup and Initial Triggers

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement `initialState(def, seed, playerCount?)` with deterministic setup execution, initial trigger dispatch order, and full-hash initialization.

## Scope
- Validate and resolve `playerCount` (argument or `metadata.players.min`).
- Initialize base `GameState` fields:
  - `globalVars`, `perPlayerVars`, `zones`, `playerCount`, `activePlayer`, `currentPhase`, `turnCount`, `actionUsage`, `rng`.
- Apply `def.setup` effects.
- Dispatch startup events in required order:
  - `turnStart` (depth 0)
  - `phaseEnter(firstPhase)` (depth 0)
- Compute and set `stateHash` via `computeFullHash` after setup + startup triggers.

## File List Expected To Touch
- `src/kernel/initial-state.ts`
- `src/kernel/types.ts` (only if startup trigger metadata requires shape updates)
- `src/kernel/zobrist.ts` (only for required helper reuse; avoid logic expansion)
- `test/unit/initial-state.test.ts` (new)

## Out Of Scope
- Legal move generation.
- Move application and action usage increments after moves.
- Phase/turn advancement beyond startup initialization.
- No-legal-move auto-advance loop.

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
