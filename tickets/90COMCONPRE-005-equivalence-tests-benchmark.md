# 90COMCONPRE-005: Equivalence tests + benchmark validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test files
**Deps**: 90COMCONPRE-004

## Problem

The compiled condition predicates must be proven correct and performant:
1. **Equivalence**: For every pipeline and stage predicate in the FITL game definition, the compiled predicate must return the same boolean as the interpreter across a range of game states.
2. **Performance**: The benchmark must show measurable improvement in pipeline predicate evaluation time (spec estimates 5-15% total benchmark reduction).

Without equivalence tests, a subtle difference between compiled and interpreted behavior could cause divergent game outcomes. Without benchmark validation, the optimization cannot be proven effective.

## Assumption Reassessment (2026-03-28)

1. `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` compiles the full FITL game spec — confirmed. This provides the GameDef with real pipeline conditions.
2. `initialState(def, seed)` creates a deterministic initial state — confirmed. Multiple seeds can generate diverse states for equivalence testing.
3. `evalCondition(cond, ctx)` is the interpreter entry point — confirmed. Compiled predicates must match its output.
4. `createEvalContext` builds a `ReadContext` from state + def + player + bindings — confirmed. Same inputs can be provided to both compiled and interpreted paths.
5. The existing performance test infrastructure is under `packages/engine/test/performance/` — confirmed.

## Architecture Check

1. **Equivalence test design**: Compile FITL GameDef, extract all pipeline/stage conditions, run both compiled and interpreted evaluation against N random states (different seeds), assert identical results. This is a property test covering all compilable patterns in production.
2. **Benchmark design**: Follows existing performance test patterns. Measures total `legalMoves` time with and without compiled predicates (or before/after comparison using the existing FITL benchmark).
3. **Agnosticism validated**: The equivalence test uses the generic condition compiler — if Texas Hold'em had pipeline conditions, they would also be tested. The test structure is game-agnostic even though FITL is the primary test case.

## What to Change

### 1. Create equivalence test

For each pipeline and stage condition in the FITL GameDef:
- If `tryCompileCondition` returns a closure, evaluate it against N game states (generated from different PRNG seeds or state mutations)
- For each state, also evaluate via `evalCondition` on the same `ConditionAST` with the same `ReadContext`
- Assert: `compiled(state, player, bindings) === evalCondition(cond, ctx)` for all cases
- Handle deferred/missing-binding cases: both paths should throw the same error

### 2. Create coverage report

Log which pipeline/stage conditions were compiled vs fell through. Verify that >=80% of FITL pipeline conditions are compilable (spec claims ~85%).

### 3. Create benchmark test

Measure `legalMoves` call time with the full FITL GameDef. Compare against historical baseline or run with compiled predicates disabled (by clearing the cache). Target: measurable improvement in predicate evaluation portion.

## Files to Touch

- `packages/engine/test/integration/compiled-condition-equivalence.test.ts` (new)
- `packages/engine/test/performance/compiled-condition-benchmark.test.ts` (new)

## Out of Scope

- Modifying the condition compiler or cache (those are tickets 001-003)
- Modifying pipeline-viability-policy.ts (that is ticket 004)
- Texas Hold'em equivalence testing (it has no pipeline conditions currently)
- Profiling individual closure performance (micro-benchmarking)
- Modifying any kernel source files

## Acceptance Criteria

### Tests That Must Pass

1. Equivalence test: for every compilable pipeline-level `legality` condition in FITL GameDef, compiled predicate matches interpreter result across >=10 random states
2. Equivalence test: for every compilable pipeline-level `costValidation` condition in FITL GameDef, compiled predicate matches interpreter result
3. Equivalence test: for every compilable stage-level condition in FITL GameDef, compiled predicate matches interpreter result
4. Equivalence test: compiled predicates that reference missing bindings throw errors catchable by `shouldDeferMissingBinding`
5. Coverage report: >=80% of FITL pipeline conditions (legality + costValidation) are compilable
6. Benchmark test: `legalMoves` total time shows measurable improvement (>=2% reduction, ideally 5-15%)
7. Existing suite: `pnpm turbo test`

### Invariants

1. Compiled and interpreted paths produce bit-identical boolean results for all tested states
2. The equivalence test uses production FITL GameDef (not synthetic fixtures) — proving real-world correctness
3. No kernel source files are modified by this ticket
4. All existing tests pass without weakening assertions

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compiled-condition-equivalence.test.ts` — equivalence property test across FITL pipeline/stage conditions with multiple random states; coverage percentage assertion
2. `packages/engine/test/performance/compiled-condition-benchmark.test.ts` — benchmark measuring legalMoves performance with compiled predicates

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "compiled-condition-equivalence"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "compiled-condition-benchmark"`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
