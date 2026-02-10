# SIMTRALOG-003 - `runGame` Loop, Validation, and Stop Semantics

**Status**: Proposed  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-001`, `SIMTRALOG-002`

## Goal
Implement `runGame(...)` as the core simulator loop with strict input validation, legal-move boundaries, move logging, and exact stop-reason behavior.

## Scope
- Add `runGame(def, seed, agents, maxTurns, playerCount?)` in `src/sim/simulator.ts`.
- Validate:
  - `seed` is a safe integer.
  - `maxTurns` is a non-negative safe integer.
  - `agents.length === initialState(...).playerCount`.
- Loop behavior:
  - terminal check first
  - max-turn cap check
  - legal moves check (no-legal-move stop)
  - agent move selection
  - apply move via kernel `applyMove`
  - compute and append `MoveLog` (including deltas and trigger logs)
- Ensure `turnsCount` is sourced from `finalState.turnCount`.
- Ensure `MoveLog.stateHash` is post-state hash.
- Export `runGame` from `src/sim/index.ts`.

## File List Expected To Touch
- `src/sim/simulator.ts` (new)
- `src/sim/index.ts`
- `test/unit/sim/simulator.test.ts` (new)

## Out Of Scope
- Batch API (`runGames`).
- Agent RNG stream isolation strategy details beyond what is necessary for single-run correctness.
- Golden/property suites.
- Trace file I/O or CLI integration.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/sim/simulator.test.ts`
  - Single-turn terminal game yields 1 `MoveLog`, non-null `result`, `stopReason: 'terminal'`.
  - `maxTurns = 0` yields zero moves and `stopReason: 'maxTurns'`.
  - Cap truncation yields `result: null` and `stopReason: 'maxTurns'`.
  - No-legal-move stall yields `result: null`, zero synthetic moves, `stopReason: 'noLegalMoves'`.
  - Invalid `seed`, invalid `maxTurns`, mismatched agent count each throw descriptive errors.
  - `turnsCount === finalState.turnCount` (explicitly not `moves.length`).
  - For each logged move, recomputed full hash equals logged `stateHash`.
- Baseline regression guards:
  - `npm run test:unit -- --coverage=false`
  - `npm run test:integration`

### Invariants That Must Remain True
- Simulator does not bypass kernel legality checks.
- Logged move count is always `<= maxTurns`.
- `stopReason` is exact:
  - `'terminal'` iff `result !== null`
  - `'maxTurns'` iff cap reached with `result === null`
  - `'noLegalMoves'` iff no legal moves and `result === null`
- `triggerFirings` in trace are verbatim kernel `applyMove` outputs for each move.

## Diff Size Guardrail
Keep this ticket focused on single-run behavior and unit-level checks only. Target review size: ~300 lines or less.

