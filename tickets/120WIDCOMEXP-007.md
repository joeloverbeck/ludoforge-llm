# 120WIDCOMEXP-007: Compilation coverage diagnostic and benchmark gate

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/kernel/` (test utilities)
**Deps**: `archive/tickets/120WIDCOMEXP-001.md`, `archive/tickets/120WIDCOMEXP-002.md`, `archive/tickets/120WIDCOMEXP-003.md`, `archive/tickets/120WIDCOMEXP-004.md`, `tickets/120WIDCOMEXP-006.md`

## Problem

After widening compiler coverage (tickets 001-004) and application sites (ticket 006), there is no way to measure how much of a real GameDef's expression tree is now compiled vs. falling back to the interpreter. A coverage diagnostic is needed to track compilation progress and identify remaining gaps. Additionally, the performance campaign harness should be re-run to verify that the wider compilation produces measurable wall-time improvement.

## Assumption Reassessment (2026-04-09)

1. `tryCompileCondition` and `tryCompileValueExpr` are exported from `condition-compiler.ts` — confirmed. Can be called programmatically on any AST node.
2. `tryCompileTokenFilter` is exported from `token-filter-compiler.ts` — confirmed.
3. FITL GameDef can be loaded from test fixtures — existing test infrastructure supports this.
4. The `fitl-perf-optimization` campaign harness measures wall time for `evalCondition` + `resolveRef` + `matchesTokenFilterExpr` — this is referenced in the spec. Verify the harness exists and can be re-run.
5. GameDef contains `actions`, `triggers`, `terminalConditions` — these hold the condition AST nodes to walk.

## Architecture Check

1. The coverage diagnostic is a test utility, not production code. It walks a GameDef's AST tree and reports compilation success/failure counts. Diagnostic only — no pass/fail threshold.
2. The benchmark re-run uses existing campaign infrastructure — no new perf tooling needed.
3. No game-specific logic in the diagnostic — it walks generic `ActionDef.pre`, `TriggerDef.match`, `TerminalCondition.when`, etc.

## What to Change

### 1. Create compilation coverage diagnostic utility

Create a test utility function `reportCompilationCoverage(def: GameDef)` that:

- Walks all `ActionDef.pre` conditions, `ActionPipelineDef` legality/cost conditions, `TriggerDef.match`/`when` conditions, and `TerminalCondition.when` conditions
- For each, calls `tryCompileCondition` and records success/null
- Walks all `ValueExpr` nodes found within conditions and calls `tryCompileValueExpr`, recording success/null
- Walks all `TokenFilterExpr` in action parameter domains and calls `tryCompileTokenFilter`, recording success/null
- Returns a summary: `{ conditions: { compiled: number, total: number }, values: { compiled: number, total: number }, tokenFilters: { compiled: number, total: number } }`

### 2. Write coverage diagnostic test

Write a test that loads the FITL GameDef, runs the coverage diagnostic, and logs the results. This test always passes (diagnostic only) but prints compilation percentages so that developers can track progress.

### 3. Re-run performance benchmark

Re-run the `fitl-perf-optimization` campaign harness (or equivalent wall-time benchmark) with all compiler widening and application site changes in place. Record:

- Wall time for `evalCondition` + `resolveRef` + `matchesTokenFilterExpr` before and after
- Overall simulation wall time before and after

Report results in the ticket outcome. This is a gate — if no measurable improvement is observed, document the finding for future investigation.

## Files to Touch

- `packages/engine/test/kernel/compilation-coverage-diagnostic.test.ts` (new)
- `packages/engine/test/kernel/compilation-coverage-diagnostic.ts` (new — utility)

## Out of Scope

- Fixing compilation gaps found by the diagnostic — those become follow-up tickets
- Modifying the performance benchmark harness itself
- Setting pass/fail thresholds for compilation percentage

## Acceptance Criteria

### Tests That Must Pass

1. Coverage diagnostic runs without errors on FITL GameDef
2. Diagnostic reports non-zero compiled counts for conditions, values, and token filters (confirming tickets 001-004 had effect)
3. Diagnostic reports total counts matching actual AST node counts in FITL GameDef
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic is read-only — never modifies GameDef or state
2. Diagnostic test always passes — it logs metrics, not assertions on percentages
3. Benchmark results are documented in ticket outcome, not enforced as CI gates

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/compilation-coverage-diagnostic.test.ts` — diagnostic test that loads FITL GameDef and reports compilation coverage

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="compilation-coverage"`
2. `pnpm turbo test`
