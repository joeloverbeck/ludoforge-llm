# 120WIDCOMEXP-007: Compilation coverage diagnostic and benchmark gate

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/unit/kernel/` (test utilities)
**Deps**: `archive/tickets/120WIDCOMEXP-001.md`, `archive/tickets/120WIDCOMEXP-002.md`, `archive/tickets/120WIDCOMEXP-003.md`, `archive/tickets/120WIDCOMEXP-004.md`, `archive/tickets/120WIDCOMEXP-006.md`

## Problem

After widening compiler coverage (tickets 001-004) and application sites (ticket 006), there is no way to measure how much of a real GameDef's expression tree is now compiled vs. falling back to the interpreter. A coverage diagnostic is needed to track compilation progress and identify remaining gaps. Additionally, the performance campaign harness should be re-run to verify that the wider compilation produces measurable wall-time improvement.

## Assumption Reassessment (2026-04-09)

1. `tryCompileCondition` and `tryCompileValueExpr` are exported from `condition-compiler.ts` — confirmed. Can be called programmatically on any AST node.
2. `tryCompileTokenFilter` is exported from `token-filter-compiler.ts` — confirmed.
3. FITL GameDef can be loaded from test fixtures — existing test infrastructure supports this.
4. The `fitl-perf-optimization` campaign harness exists and can be re-run on the live branch, but its current output records current-run wall time and top-level profiler buckets rather than preserved before/after baselines for `evalCondition` + `resolveRef` + `matchesTokenFilterExpr`.
5. GameDef contains `actions`, `triggers`, `terminalConditions` — these hold the condition AST nodes to walk.

## Architecture Check

1. The coverage diagnostic is a test utility, not production code. It walks a GameDef's AST tree and reports compilation success/failure counts. Diagnostic only — no pass/fail threshold.
2. The benchmark evidence should use the existing campaign infrastructure as-is. This ticket may record current benchmark results, but it does not own new before/after baseline tooling.
3. No game-specific logic in the diagnostic — it walks generic `ActionDef.pre`, `TriggerDef.match`, `TerminalCondition.when`, etc.

## What to Change

### 1. Create compilation coverage diagnostic utility

Create a test utility function `reportCompilationCoverage(def: GameDef)` that:

- Walks all `ActionDef.pre` conditions, `ActionPipelineDef` applicability/legality/cost conditions, targeting filters, `TriggerDef.match`/`when` conditions, `PhaseDef.actionDefaults.pre`, `TerminalCondition.when`, checkpoints, and terminal scoring/margin value expressions
- For each, calls `tryCompileCondition` and records success/null
- Walks all `ValueExpr` nodes found within conditions and calls `tryCompileValueExpr`, recording success/null
- Walks all `TokenFilterExpr` in action parameter domains and calls `tryCompileTokenFilter`, recording success/null
- Returns a summary: `{ conditions: { compiled: number, total: number }, values: { compiled: number, total: number }, tokenFilters: { compiled: number, total: number } }`

### 2. Write coverage diagnostic test

Write a test that loads the FITL GameDef, runs the coverage diagnostic, and logs the results. This test always passes (diagnostic only) but prints compilation percentages so that developers can track progress. If FITL does not currently author action-parameter token filters, add a second focused engine fixture in the same test file to prove token-filter coverage on a small deterministic surface.

### 3. Re-run performance benchmark

Re-run the `fitl-perf-optimization` campaign harness (or equivalent wall-time benchmark) with all compiler widening and application site changes in place. Record:

- Current combined wall time and profiler buckets emitted by the live harness
- Any evidence the current harness output provides about remaining hot spots

Report results in the ticket outcome. If the live harness does not expose a trustworthy historical baseline, document that explicitly rather than inventing before/after numbers.

## Files to Touch

- `packages/engine/test/unit/kernel/compilation-coverage-diagnostic.test.ts` (new)
- `packages/engine/test/unit/kernel/compilation-coverage-diagnostic.ts` (new — utility)

## Out of Scope

- Fixing compilation gaps found by the diagnostic — those become follow-up tickets
- Modifying the performance benchmark harness itself
- Setting pass/fail thresholds for compilation percentage

## Acceptance Criteria

### Tests That Must Pass

1. Coverage diagnostic runs without errors on FITL GameDef
2. Diagnostic reports non-zero compiled counts for conditions and values on FITL, and non-zero token-filter counts on either FITL or a focused deterministic fixture when FITL does not currently author action-parameter token filters
3. Diagnostic reports total counts matching actual AST node counts in FITL GameDef
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic is read-only — never modifies GameDef or state
2. Diagnostic test always passes — it logs metrics, not assertions on percentages
3. Benchmark results are documented in ticket outcome, not enforced as CI gates, and may be current-run-only if no preserved baseline exists

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/compilation-coverage-diagnostic.test.ts` — diagnostic test that loads FITL GameDef, reports compilation coverage, and may include a focused fixture for token-filter coverage proof

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compilation-coverage-diagnostic.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `bash campaigns/fitl-perf-optimization/harness.sh`

## Outcome

Completed: 2026-04-09

- Added [compilation-coverage-diagnostic.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/compilation-coverage-diagnostic.ts) to walk production `GameDef` condition/value surfaces and action-domain token-filter query surfaces, then summarize `tryCompileCondition`, `tryCompileValueExpr`, and `tryCompileTokenFilter` coverage without mutating state.
- Added [compilation-coverage-diagnostic.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/compilation-coverage-diagnostic.test.ts) to log FITL production coverage and prove token-filter coverage on a focused deterministic fixture.
- Recorded live FITL diagnostic output: `conditions=109/448 (24.3%)`, `values=396/711 (55.7%)`, `tokenFilters=0/0 (0.0%)`.
- Recorded focused token-filter fixture output: `tokenFilters=2/2 (100.0%)`.
- Re-ran the existing FITL performance harness and recorded the current median branch result: `combined_duration_ms=95777.24`, `compilation_ms=1784.37`, `legalMoves_ms=64333.25`, `agentChooseMove_ms=28022.18`, `applyMove_ms=1028.63`, `terminalResult_ms=519.79`, `computeDeltas_ms=0.42`.

Deviations from original plan:

- The ticket originally assumed FITL would expose non-zero action-parameter token-filter counts. Live production FITL does not, so the test was widened with a focused deterministic fixture instead of fabricating a production assertion.
- The ticket originally called for before/after benchmark claims on `evalCondition`, `resolveRef`, and `matchesTokenFilterExpr`. The live harness does not expose a trustworthy preserved baseline or those per-function timings, so the outcome records current-run branch metrics only.

Verification:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/compilation-coverage-diagnostic.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo test`
- `bash campaigns/fitl-perf-optimization/harness.sh`
