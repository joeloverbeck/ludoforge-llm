# SIMTRALOG-002 - Deterministic State Delta Engine

**Status**: ✅ COMPLETED  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-001` (completed)

## Goal
Implement deterministic `computeDeltas(preState, postState)` for trace logging with stable path ordering and strict field coverage/exclusions.

## Reassessed Assumptions (Before Implementation)
- `src/sim` currently contains only a stub `index.ts`; there is no existing simulator module to integrate with yet.
- `StateDelta` contract already exists in `src/kernel/types.ts`; this ticket should consume that contract, not redefine it.
- Trace contract updates from `SIMTRALOG-001` are already present (including `stopReason`), so this ticket should not touch trace schema/serde artifacts.
- Test coverage for delta behavior does not yet exist; a new focused unit suite is required.
- Because `GameState.zones` stores token objects, zone deltas must normalize to token-id arrays (`Token.id`) to satisfy Spec 10 stability requirements.

## Scope
- Create `src/sim/delta.ts` exporting `computeDeltas(preState, postState): readonly StateDelta[]`.
- Track only:
  - `globalVars.<name>`
  - `perPlayerVars.<playerId>.<name>`
  - `zones.<zoneId>` (zone-level token id arrays only)
  - `currentPhase`
  - `activePlayer`
  - `turnCount`
- Exclude `rng` and `stateHash`.
- Emit deltas sorted lexicographically by `path`.
- Re-export delta API from `src/sim/index.ts`.

## File List Expected To Touch
- `src/sim/delta.ts` (new)
- `src/sim/index.ts`
- `test/unit/sim/delta.test.ts` (new)

## Out Of Scope
- `runGame` / `runGames` implementation (no simulator loop exists yet in `src/sim`).
- Kernel hash computation changes.
- Trace schema/serde changes.
- Non-deterministic or index-level zone diff formats.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/sim/delta.test.ts`
  - One global var change emits exactly one delta at `globalVars.<name>`.
  - Per-player var changes emit `perPlayerVars.<playerId>.<name>` paths.
  - Token movement updates changed zones via `zones.<zoneId>` arrays of token ids.
  - Phase, active player, and turn count transitions emit correct deltas.
  - `rng` and `stateHash` changes alone emit no deltas.
  - Output is path-sorted and deterministic.
- Baseline regression guard:
  - `npm run test:unit -- --coverage=false`

### Invariants That Must Remain True
- Delta output is a pure function of `(preState, postState)`.
- No mutation of input states.
- Zone delta encoding remains bounded at one entry per changed zone.

## Diff Size Guardrail
Keep ticket limited to one new module + one focused test file. Target review size: ~220 lines or less.

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added `src/sim/delta.ts` with deterministic `computeDeltas(preState, postState)` covering only Spec 10 tracked fields.
  - Exported `computeDeltas` from `src/sim/index.ts`.
  - Added `test/unit/sim/delta.test.ts` to cover required delta behavior and deterministic ordering.
- Deviations from original plan:
  - Added one extra edge-case test for tracked-key additions/removals to lock deterministic union-of-keys behavior.
  - No simulator loop files (`runGame`/`runGames`) were touched because they do not exist yet in current baseline and are out of scope.
- Verification:
  - `npm run test:unit -- --coverage=false`
  - `npm run build`
  - `node --test dist/test/unit/sim/delta.test.js`
