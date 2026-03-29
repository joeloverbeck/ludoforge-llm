# 11EVADEGDET-006: Evaluator integration tests, golden coverage, and sim-surface verification

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — evaluator integration tests, golden fixture, sim-surface verification
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/tickets/11EVADEGDET/11EVADEGDET-002-delta-reconstruction.md, archive/tickets/11EVADEGDET/11EVADEGDET-003-per-trace-metrics.md, archive/tickets/11EVADEGDET/11EVADEGDET-004-degeneracy-detection.md, archive/tickets/11EVADEGDET/11EVADEGDET-005-aggregation.md

## Problem

Spec 11 requires integration tests that run real simulations (via Spec 10's `runGame` / `runGames`) and feed traces through the full evaluation pipeline. It also requires golden tests with precomputed expected values, and property tests for metric invariants. The missing work is not evaluator implementation itself; it is proving the existing evaluator surface end-to-end and verifying that the public simulation surface exposes the evaluator APIs at the correct package boundary.

## Assumption Reassessment (2026-03-29)

1. `runGame` / `runGames` are exported from `packages/engine/src/sim/simulator.ts` and re-exported from `packages/engine/src/sim/index.ts` — confirmed.
2. There is no `packages/engine/src/index.ts` root barrel. `@ludoforge/engine` resolves to `dist/src/kernel/index.js` via `packages/engine/package.json`, while simulation APIs are intentionally exposed from the `./sim` subpath — confirmed.
3. Evaluator unit coverage already exists:
   - `packages/engine/test/unit/sim/trace-eval.test.ts`
   - `packages/engine/test/unit/sim/aggregate-evals.test.ts`
   - `packages/engine/test/unit/sim/eval-report.test.ts`
   - `packages/engine/test/unit/sim/delta.test.ts`
4. Integration test directory exists: `packages/engine/test/integration/sim/` — confirmed (currently simulator-focused only).
5. Test fixtures live under `packages/engine/test/fixtures/`, with trace fixtures already grouped under `packages/engine/test/fixtures/trace/` — confirmed.
6. Engine tests use Node's test runner (`node --test`), with package lanes driven by `scripts/run-tests.mjs` — confirmed.

## Architecture Check

1. Integration tests should exercise the real compile/sim/evaluate/aggregate pipeline with synthetic fixtures. That proves the evaluator works against actual traces without coupling it to FITL-specific content (Foundations §§1, 11).
2. Golden coverage should use a committed serialized trace fixture plus hand-verified expectations. That keeps correctness reproducible while reusing the repo's existing trace-fixture conventions (Foundations §§5, 11).
3. Property-style checks should stay focused on evaluator invariants that unit tests do not yet prove against simulator-produced traces: determinism, finiteness, and bounded ranges.
4. The package boundary should remain explicit: evaluator APIs belong on `@ludoforge/engine/sim`, not the root `@ludoforge/engine` kernel surface. Flattening that boundary would weaken the package architecture instead of improving it.

## What to Change

### 1. Verify the sim package surface

Keep `evaluateTrace`, `aggregateEvals`, `generateEvalReport`, `EvalConfig`, `DEFAULT_EVAL_CONFIG`, and `reconstructPerPlayerVarTrajectory` on `packages/engine/src/sim/index.ts`. Do not add a root-package alias from `@ludoforge/engine`; the repo already uses explicit subpath exports (`./runtime`, `./cnl`, `./agents`, `./sim`, `./trace`), and this ticket should verify that evaluator APIs remain exposed from `./sim`.

### 2. Create integration test

`packages/engine/test/integration/sim/eval-full.test.ts`:

- Build a minimal synthetic game definition that produces real traces with non-trivial action choice
- Run multiple simulations with different seeds via `runGames`
- Feed traces through `evaluateTrace` and `aggregateEvals` / `generateEvalReport`
- Assert: `EvalReport` has correct `runCount`, all metrics are finite, bounded metrics stay in [0, 1], and repeated evaluation is deterministic
- Run at least one deliberately degenerate simulation fixture that terminates with `noLegalMoves`, proving end-to-end degeneracy detection on simulator-produced traces

### 3. Create golden test fixture and test

- Add a committed serialized trace fixture under `packages/engine/test/fixtures/trace/`
- Precompute expected `TraceMetrics` values and expected `degeneracyFlags`
- Test: deserialize fixture, evaluate trace, and assert exact metric/flag output (within floating-point epsilon)

### 4. Add property tests

Strengthen evaluator tests where simulator-produced traces add coverage value:
- For valid traces produced by `runGame` / `runGames`: all metrics finite, bounded metrics in [0, 1]
- `evaluateTrace` is deterministic for the same trace + config
- Prefer colocating these checks in the new integration suite unless a dedicated property file becomes materially clearer

## Files to Touch

- `packages/engine/src/sim/index.ts` (verify only; modify only if an evaluator API is actually missing)
- `packages/engine/test/integration/sim/eval-full.test.ts` (new)
- `packages/engine/test/fixtures/trace/eval-golden-trace.json` (new — serialized golden trace fixture)
- `packages/engine/test/unit/sim/trace-eval.test.ts` (modify — golden fixture assertions and any missing invariants)

## Out of Scope

- Modifying the simulator (`runGame` / `runGames`) behavior
- Modifying `GameTrace`, `MoveLog`, or `StateDelta` types
- Campaign harness modifications (consumer responsibility)
- CLI integration (Spec 12)
- Evolution pipeline integration (Spec 14)
- Performance benchmarks for evaluator
- Adding a new root export alias from `@ludoforge/engine`
- Schema artifact changes (completed in 11EVADEGDET-001)

## Acceptance Criteria

### Tests That Must Pass

1. Integration: multiple simulated traces produce a valid `EvalReport` with correct `runCount`, finite metrics, and bounded metrics in range
2. Integration: degenerate simulator fixture produces the expected degeneracy flags in its `TraceEval`
3. Golden: committed serialized trace fixture evaluates to exact expected metric values (within ε = 1e-10)
4. Golden: committed serialized trace fixture evaluates to the expected degeneracy flags
5. Determinism: `evaluateTrace` called twice with the same input returns identical output
6. Public surface: evaluator APIs remain available from `packages/engine/src/sim/index.ts` and the package `./sim` export; no root alias is added
7. `pnpm turbo typecheck`
8. `pnpm turbo test`
9. `pnpm turbo lint`

### Invariants

1. Integration tests do not depend on specific game content — use synthetic or minimal fixture games (Foundation §1)
2. Golden fixture is committed to `test/fixtures/` — not generated at test time
3. No modifications to existing simulator behavior
4. All evaluator APIs accessible from the sim surface without widening the root package boundary
5. Determinism proven by test: same trace → same eval (Foundation §5, §11)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/sim/eval-full.test.ts`:
   - End-to-end: simulate → evaluate → aggregate
   - Degenerate `noLegalMoves` scenario
   - Determinism, metric bounds, and finiteness on simulator-produced traces

2. Golden fixture: `packages/engine/test/fixtures/trace/eval-golden-trace.json`

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- Outcome amended: 2026-03-29
- What actually changed:
  - Corrected the ticket assumptions to match the existing engine package architecture and evaluator coverage.
  - Added `packages/engine/test/integration/sim/eval-full.test.ts` for real simulator-to-evaluator coverage, deterministic re-evaluation checks, `noLegalMoves` degeneracy coverage, and explicit `./sim` package-surface verification.
  - Added the committed golden fixture `packages/engine/test/fixtures/trace/eval-golden-trace.json`.
  - Extended `packages/engine/test/unit/sim/trace-eval.test.ts` to evaluate the golden fixture exactly.
- Deviations from original plan:
  - Did not add a root `@ludoforge/engine` export alias for evaluator APIs. The existing subpath boundary (`@ludoforge/engine/sim`) is the cleaner architecture and was preserved intentionally.
  - No production source files needed changes at the time; the missing work was proof coverage, not evaluator implementation. Ticket 11EVADEGDET-007 later narrowed `generateEvalReport` from `(def, traces, config?)` to `(gameDefId, traces, config?)`, so current consumers use the explicit identifier contract.
- Verification results:
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
  - Focused evaluator coverage passed after rebuild: `node --test packages/engine/dist/test/unit/sim/trace-eval.test.js packages/engine/dist/test/unit/sim/aggregate-evals.test.js packages/engine/dist/test/unit/sim/eval-report.test.js packages/engine/dist/test/unit/sim/delta.test.js packages/engine/dist/test/integration/sim/eval-full.test.js`.
