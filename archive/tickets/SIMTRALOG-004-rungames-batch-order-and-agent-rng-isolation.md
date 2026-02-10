# SIMTRALOG-004 - `runGames` Batch Order and Agent RNG Isolation

**Status**: ✅ COMPLETED  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-003`

## Assumptions Reassessment
- `runGame(...)` already exists in `src/sim/simulator.ts`, including deterministic per-player agent RNG derivation and RNG threading through `{ move, rng }`.
- `SimulationStopReason` and `GameTrace.stopReason` are already present in `src/kernel/types.ts` and wired through serde.
- `runGames(...)` is not implemented yet.
- `src/sim/index.ts` currently exports `runGame` only.
- `test/integration/sim/simulator.test.ts` does not exist yet.

## Goal
Implement `runGames(...)` and validate batch determinism/order using the existing `runGame(...)` RNG isolation behavior.

## Scope
- Add `runGames(def, seeds, agents, maxTurns, playerCount?)` to `src/sim/simulator.ts`.
- Return traces in exactly the same order as input `seeds`.
- Return `[]` for empty seed input.
- Ensure each run is independent at simulator state level (no shared mutable simulation state between runs).
- Export `runGames` from `src/sim/index.ts`.
- Add integration coverage for determinism, batch ordering, and run independence.

## File List Expected To Touch
- `src/sim/simulator.ts`
- `src/sim/index.ts`
- `test/integration/sim/simulator.test.ts` (new)

## Out Of Scope
- Core delta algorithm changes.
- Kernel PRNG algorithm implementation changes.
- Changes to existing `runGame(...)` behavior unless needed to support `runGames(...)`.
- CLI wiring or trace file export.
- Property/golden harness additions.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/integration/sim/simulator.test.ts`
  - `runGames` preserves input seed ordering in returned traces.
  - Same `def` + same seed list + same agents run twice yields byte-identical serialized traces.
  - Empty seed list returns empty trace list.
  - Two distinct seeds produce independent traces (no cross-run leakage).
- `test/unit/sim/simulator.test.ts` (if expanded)
  - No changes required unless `runGames(...)` introduces a unit-level regression.
- Baseline regression guards:
  - `npm run test:integration`
  - `npm run test:unit -- --coverage=false`

### Invariants That Must Remain True
- `runGames` never reorders results.
- Agent RNG streams are isolated from `GameState.rng`.
- Determinism is stable under repeated process-local execution.

## Diff Size Guardrail
Keep ticket to batch orchestration + determinism tests only. Target review size: ~250 lines or less.

## Outcome
- Completion date: February 10, 2026.
- Actual changes:
  - Added `runGames(...)` in `src/sim/simulator.ts` as deterministic seed-ordered orchestration over existing `runGame(...)`.
  - Exported `runGames` from `src/sim/index.ts`.
  - Added `test/integration/sim/simulator.test.ts` covering seed-order preservation, repeated-run byte-identical serialized traces, empty seed behavior, and cross-run seed independence.
- Deviations from original plan:
  - No `test/unit/sim/simulator.test.ts` changes were needed; integration coverage was sufficient for this scope.
  - Existing `runGame(...)` agent RNG isolation logic was retained as-is after assumption reassessment.
- Verification:
  - `npm run build` passed.
  - `npm run test:integration` passed.
  - `npm run test:unit -- --coverage=false` passed.
