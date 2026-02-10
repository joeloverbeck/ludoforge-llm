# SIMTRALOG-005 - Property + Golden Trace Stability Coverage

**Status**: Proposed  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-004`

## Goal
Lock Spec 10 guarantees with property and golden tests that protect termination, move-bound constraints, and deterministic hash-sequence stability.

## Scope
- Add property tests for simulator termination and trace invariants.
- Add golden test(s) for known `GameDef` + fixed agents + seed hash timeline.
- Add/update fixture(s) for golden trace/hash expectations if needed.
- Ensure kernel serde round-trip remains exact for produced traces with `stopReason`.

## File List Expected To Touch
- `test/unit/property/simulator.property.test.ts` (new)
- `test/integration/sim/simulator-golden.test.ts` (new)
- `test/fixtures/trace/simulator-golden-*.json` (new, if needed)
- `test/unit/serde.test.ts` (optional small assertion extension for simulator-produced traces)

## Out Of Scope
- New simulator runtime features.
- Changing kernel hash algorithm or table construction.
- Performance benchmarking/memory profiling.
- Refactoring unrelated integration suites.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/property/simulator.property.test.ts`
  - For generated valid inputs and finite `maxTurns`, `runGame` always terminates.
  - Logged move count is always `<= maxTurns`.
  - Every logged move has `legalMoveCount >= 1`.
  - `turnsCount === finalState.turnCount` across generated runs.
- `test/integration/sim/simulator-golden.test.ts`
  - Fixed setup yields expected state-hash sequence and stable serialized trace snapshot.
  - Repeated run with same seed/setup is byte-identical after `serializeTrace`.
- Optional serde extension:
  - simulator-produced traces survive `deserializeTrace(serializeTrace(trace))` exactly.
- Baseline regression guards:
  - `npm run test:unit -- --coverage=false`
  - `npm run test:integration`

### Invariants That Must Remain True
- Golden expectations only change with intentional, reviewed simulator behavior changes.
- Property tests remain deterministic (fixed property seeds / bounded cases).
- No test relies on wall-clock timing or nondeterministic ordering.

## Diff Size Guardrail
Keep to tests/fixtures only unless a minimal helper extraction is required. Target review size: ~220 lines or less.

