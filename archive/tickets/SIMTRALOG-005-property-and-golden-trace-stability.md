# SIMTRALOG-005 - Property + Golden Trace Stability Coverage

**Status**: ✅ COMPLETED  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-004`

## Assumptions Reassessment (2026-02-10)
- `runGame(...)` and `runGames(...)` are already implemented in `src/sim/simulator.ts`.
- Simulator termination semantics (`terminal`, `maxTurns`, `noLegalMoves`) are already covered by `test/unit/sim/simulator.test.ts`.
- Hash consistency checks for logged move hashes are already present in `test/unit/sim/simulator.test.ts`.
- Seed-order and repeated-run determinism for batch runs are already covered by `test/integration/sim/simulator.test.ts`.
- Kernel trace serde round-trip coverage already exists in `test/unit/serde.test.ts` and includes `stopReason`.
- Missing from this ticket today: dedicated simulator property tests and a simulator-specific golden trace fixture/assertion for stable hash timeline + byte-identical serialization.

## Goal
Lock Spec 10 guarantees with property and golden tests that protect termination, move-bound constraints, and deterministic hash-sequence stability.

## Scope
- Add property tests for simulator termination and trace invariants.
- Add golden test(s) for known `GameDef` + fixed agents + seed hash timeline.
- Add/update fixture(s) for golden trace/hash expectations.
- Extend serde coverage only if the new simulator-produced golden fixture exposes a gap.

## File List Expected To Touch
- `test/unit/property/simulator.property.test.ts` (new)
- `test/integration/sim/simulator-golden.test.ts` (new)
- `test/fixtures/trace/simulator-golden-*.json` (new)
- `test/unit/serde.test.ts` (optional small assertion extension only if needed)

## Out Of Scope
- New simulator runtime features (unless a test uncovers a correctness bug).
- Changing kernel hash algorithm or table construction.
- Performance benchmarking/memory profiling.
- Refactoring unrelated integration/unit suites.

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

## Outcome
- Completion date: 2026-02-10
- Actual changes:
  - Added `test/unit/property/simulator.property.test.ts` with deterministic property-style invariants for termination-bounded runs, `moves.length <= maxTurns`, `legalMoveCount >= 1`, and `turnsCount === finalState.turnCount`.
  - Added `test/integration/sim/simulator-golden.test.ts` for simulator-specific golden hash-sequence and serialized trace stability checks, including repeated-run byte identity.
  - Added fixture `test/fixtures/trace/simulator-golden-trace.json` as the canonical serialized simulator golden trace for a fixed `GameDef` + seed + agents.
  - Extended `test/unit/serde.test.ts` with a round-trip assertion for the simulator golden trace fixture.
- Deviations from original plan:
  - No simulator runtime code changes were required after reassessment; existing implementation and prior tests already covered core Spec 10 loop semantics.
  - `test/integration/sim/simulator.test.ts` and `test/unit/sim/simulator.test.ts` were left unchanged because their current coverage already satisfied the reassessed assumptions.
- Verification:
  - `npm run lint` passed.
  - `npm run build` passed.
  - `npm run test:unit -- --coverage=false` passed.
  - `npm run test:integration` passed.
