# SIMTRALOG-002 - Deterministic State Delta Engine

**Status**: Proposed  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-001`

## Goal
Implement deterministic `computeDeltas(preState, postState)` for trace logging with stable path ordering and strict field coverage/exclusions.

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
- Simulator loop (`runGame` / `runGames`).
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

