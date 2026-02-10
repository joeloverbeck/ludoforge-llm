# SIMTRALOG-004 - `runGames` Batch Order and Agent RNG Isolation

**Status**: Proposed  
**Spec**: `specs/10-simulator-trace-logger.md`  
**Depends on**: `SIMTRALOG-003`

## Goal
Implement `runGames(...)` and finalize deterministic per-player agent RNG threading/isolation guarantees across repeated runs.

## Scope
- Add `runGames(def, seeds, agents, maxTurns, playerCount?)` to `src/sim/simulator.ts`.
- Return traces in exactly the same order as input `seeds`.
- Return `[]` for empty seed input.
- Ensure each run is independent (no shared mutable simulation state between runs).
- Implement deterministic per-player agent RNG streams derived from `seed` and `playerId`.
- Ensure agent RNG progression is threaded only through `{ move, rng }` returned by `chooseMove`.
- Export `runGames` from `src/sim/index.ts`.
- Add integration coverage for determinism and batch ordering.

## File List Expected To Touch
- `src/sim/simulator.ts`
- `src/sim/index.ts`
- `test/integration/sim/simulator.test.ts` (new)
- `test/unit/sim/simulator.test.ts` (optional small additions for rng-threading edge cases)

## Out Of Scope
- Core delta algorithm changes.
- Kernel PRNG algorithm implementation changes.
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
  - Same seed + same agent implementations produce identical trace output.
  - Same seed + behaviorally different agents produces divergent traces without mutating game RNG contract.
- Baseline regression guards:
  - `npm run test:integration`
  - `npm run test:unit -- --coverage=false`

### Invariants That Must Remain True
- `runGames` never reorders results.
- Agent RNG streams are isolated from `GameState.rng`.
- Determinism is stable under repeated process-local execution.

## Diff Size Guardrail
Keep ticket to batch orchestration + determinism tests only. Target review size: ~250 lines or less.

