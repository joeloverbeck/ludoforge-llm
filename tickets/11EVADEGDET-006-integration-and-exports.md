# 11EVADEGDET-006: Integration tests, golden tests, and engine barrel export

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — barrel export, integration tests, golden fixture
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/tickets/11EVADEGDET/11EVADEGDET-002-delta-reconstruction.md, tickets/11EVADEGDET-003-per-trace-metrics.md, tickets/11EVADEGDET-004-degeneracy-detection.md, tickets/11EVADEGDET-005-aggregation.md

## Problem

Spec 11 requires integration tests that run real simulations (via Spec 10's `runGame`) and feed traces through the full evaluation pipeline. It also requires golden tests with precomputed expected values, and property tests for metric invariants. Finally, the public API (`evaluateTrace`, `aggregateEvals`, `generateEvalReport`) must be accessible from the engine's top-level barrel export.

## Assumption Reassessment (2026-03-29)

1. `runGame` / `runGames` are exported from `packages/engine/src/sim/simulator.ts` and available via `sim/index.ts` — confirmed.
2. Engine barrel export is at `packages/engine/src/index.ts` (or similar) — need to verify exact path.
3. Integration test directory exists: `packages/engine/test/integration/sim/` — confirmed (contains `simulator.test.ts`, `simulator-golden.test.ts`).
4. Test fixtures live in `packages/engine/test/fixtures/` — confirmed per project structure.
5. Engine tests use `node --test`, not Vitest — confirmed.

## Architecture Check

1. Integration tests compile and run a minimal game spec, generate traces via `runGame`, then evaluate — proves the full pipeline works end-to-end (Foundation §11).
2. Golden test uses a fixture with hand-verified expected metric values — proves correctness is reproducible (Foundation §5).
3. Property tests verify metric invariants (finite, bounded) across random seeds — proves robustness (Foundation §11).
4. No game-specific evaluation logic in the evaluator — integration tests may use FITL or a synthetic game, but the evaluator code is agnostic (Foundation §1).

## What to Change

### 1. Update engine barrel export

Ensure `evaluateTrace`, `aggregateEvals`, `generateEvalReport`, `EvalConfig`, `DEFAULT_EVAL_CONFIG`, and `reconstructPerPlayerVarTrajectory` are re-exported from the engine's top-level `index.ts` (via `sim/index.ts`).

### 2. Create integration test

`packages/engine/test/integration/sim/eval-full.test.ts`:

- Compile a minimal synthetic game spec (or use an existing test fixture)
- Run 5 simulations with different seeds via `runGames`
- Feed all traces to `evaluateTrace` individually
- Feed TraceEvals to `aggregateEvals`
- Assert: `EvalReport` has correct `runCount`, all metrics are finite, bounded metrics in [0, 1]
- Run at least one deliberately degenerate game (e.g., game that terminates immediately → `NO_LEGAL_MOVES` or `TRIVIAL_WIN` in perSeed flags)

### 3. Create golden test fixture and test

- Hand-craft a `GameTrace` JSON fixture with known moves, deltas, stateHashes
- Precompute expected `TraceMetrics` values and expected `degeneracyFlags`
- Test: `evaluateTrace(fixture) → exact metric values match` (within floating-point epsilon)

### 4. Add property tests

In the integration test file (or a dedicated property test file):
- For any valid trace produced by `runGame`: all metrics finite, bounded metrics in [0, 1]
- `evaluateTrace` is deterministic: same trace + config → same result (run twice, assert equality)

## Files to Touch

- `packages/engine/src/index.ts` (modify — ensure evaluator APIs re-exported; verify actual barrel file path)
- `packages/engine/src/sim/index.ts` (modify — ensure all evaluator modules re-exported)
- `packages/engine/test/integration/sim/eval-full.test.ts` (new)
- `packages/engine/test/fixtures/eval-golden-trace.json` (new — golden test fixture)
- `packages/engine/test/unit/sim/trace-eval.test.ts` (modify — add property tests if not separate file)

## Out of Scope

- Modifying the simulator (`runGame` / `runGames`) behavior
- Modifying `GameTrace`, `MoveLog`, or `StateDelta` types
- Campaign harness modifications (consumer responsibility)
- CLI integration (Spec 12)
- Evolution pipeline integration (Spec 14)
- Performance benchmarks for evaluator
- Schema artifact changes (completed in 11EVADEGDET-001)

## Acceptance Criteria

### Tests That Must Pass

1. Integration: 5 simulated traces → valid `EvalReport` with `runCount: 5`, all metrics finite
2. Integration: degenerate game → expected degeneracy flags in `perSeed` entry
3. Golden: hand-crafted trace → exact metric values match (within ε = 1e-10)
4. Golden: hand-crafted trace → expected degeneracy flags
5. Property: for any `runGame`-produced trace, all metrics are finite
6. Property: `actionDiversity`, `interactionProxy`, `dominantActionFreq` always in [0, 1]
7. Property: `evaluateTrace` called twice with same input → identical result
8. Barrel export: `import { evaluateTrace, aggregateEvals, generateEvalReport } from '@ludoforge/engine'` compiles
9. `pnpm turbo typecheck`
10. `pnpm turbo test`
11. `pnpm turbo lint`

### Invariants

1. Integration tests do not depend on specific game content — use synthetic or minimal fixture games (Foundation §1)
2. Golden fixture is committed to `test/fixtures/` — not generated at test time
3. No modifications to existing simulator behavior
4. All evaluator APIs accessible from engine barrel export
5. Determinism proven by test: same trace → same eval (Foundation §5, §11)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/sim/eval-full.test.ts`:
   - End-to-end: compile → simulate → evaluate → aggregate
   - Degenerate game scenario
   - Property: metric bounds and finiteness

2. Golden fixture: `packages/engine/test/fixtures/eval-golden-trace.json`

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`
