# 90COMCONPRE-005: Production predicate equivalence + benchmark harness

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Test-only unless the proof work exposes a real bug
**Deps**: 90COMCONPRE-004

## Problem

The compiler, cache, and policy-layer fast-paths already exist. What is still missing is production-proof:
1. **Equivalence**: the compiled closures used for FITL pipeline and stage predicates must be shown to match the interpreter on a realistic corpus of states and bindings.
2. **Performance validation**: we need a stable benchmark harness that compares compiled predicate execution against the interpreter without introducing benchmark-only production hooks or mutating private cache state.

Without this proof, the architecture is incomplete: the optimization exists, but its real production correctness and measurable benefit are still assumed rather than demonstrated.

## Assumption Reassessment (2026-03-28)

1. Ticket 004 already integrated compiled predicate lookup and boolean fast-paths into `packages/engine/src/kernel/pipeline-viability-policy.ts`. The original 005 framing implied this was still pending; that assumption was incorrect.
2. The compiled predicate cache is already `WeakMap<readonly ActionPipelineDef[], ReadonlyMap<ConditionAST, CompiledConditionPredicate>>`, keyed by `ConditionAST` object identity. There is no remaining work around synthetic keys, stage indexes, or runtime-table plumbing.
3. Focused unit coverage already exists for:
   - `packages/engine/test/unit/kernel/condition-compiler.test.ts`
   - `packages/engine/test/unit/kernel/compiled-condition-cache.test.ts`
   - `packages/engine/test/unit/kernel/pipeline-viability-policy.test.ts`
   This ticket should not duplicate those tests with synthetic fixtures. It should add production-level proof.
4. `compileProductionSpec()` and `initialState()` are the correct entry points for FITL production compilation and deterministic state creation, but seed-only initial states are not enough to represent real predicate diversity. The test corpus should include progressed gameplay states as well.
5. `createEvalContext(...)` is the correct interpreter/compiled shared entry point. Both paths can be driven from the same `ReadContext`.
6. There is no clean public switch that forces `legalMoves(...)` to use interpreter-only predicates while leaving the rest of the runtime unchanged. A benchmark that depends on mutating private cache internals or introducing a benchmark-only bypass in production code would be architecturally worse than the current design.
7. Engine tests use Node's test runner over built `dist/` files. The original targeted commands using `--test-name-pattern` were inaccurate for this repo.

## Architecture Check

1. **Production equivalence belongs at the predicate layer**: the clean proof is to evaluate the same production `ConditionAST` through both the compiled closure and `evalCondition(...)` using the same `ReadContext`. That directly validates the optimized abstraction boundary.
2. **State corpus should be realistic, not synthetic-only**: initial states plus deterministic progressed states from actual FITL move execution provide better architectural proof than a purely hand-built context matrix.
3. **Benchmark the abstraction we optimized**: comparing compiled closures directly against `evalCondition(...)` is cleaner than trying to shoehorn an interpreter-only mode into `legalMoves(...)`. The latter would add code paths that exist only for the benchmark and would age badly.
4. **Coverage reporting should stay descriptive**: report total predicate count, compiled count, boolean-literal count, and interpreter-fallback count so regressions are visible without freezing a brittle percentage threshold.
5. **No benchmark-only production hooks**: if proof work passes without exposing a bug, the ideal architecture is still the current one. We should not degrade it by adding toggles or alias paths just to make measurement easier.

## What to Change

### 1. Add a production equivalence integration test

Create a new integration test that:
- compiles the FITL production `GameDef`
- walks every pipeline-level and stage-level `legality` / `costValidation` predicate
- builds a deterministic corpus of real FITL states (initial states plus progressed states from actual move execution)
- evaluates each compiled predicate and `evalCondition(...)` against the same `ReadContext`
- asserts identical boolean results
- for missing-binding cases, asserts both paths fail compatibly and remain catchable by the existing missing-binding policy

### 2. Add descriptive predicate coverage reporting

The equivalence suite should log:
- total predicate count
- boolean-literal fast-path count
- compiled non-boolean predicate count
- interpreter-fallback count

This is visibility, not a threshold gate.

### 3. Add a predicate benchmark harness

Create a performance test that benchmarks the production predicate corpus directly:
- compiled closure evaluation over the corpus
- interpreter `evalCondition(...)` evaluation over the same corpus

The harness should:
- use the same state/binding corpus as the equivalence test or an equivalent deterministic corpus
- emit comparative timings and predicate/sample counts
- fail only if the harness itself is invalid (for example no compiled predicates found or parity unexpectedly breaks during benchmark setup), not on a noisy wall-clock target

## Files to Touch

- `packages/engine/test/integration/compiled-condition-equivalence.test.ts` (new)
- `packages/engine/test/performance/compiled-condition-benchmark.test.ts` (new)

## Out of Scope

- Modifying `condition-compiler.ts`, `compiled-condition-cache.ts`, or `pipeline-viability-policy.ts` unless the new proof tests expose a real defect
- Adding a benchmark-only interpreter toggle to `legalMoves(...)` or other kernel production code
- Reworking runtime cache storage or keying
- Texas Hold'em predicate equivalence coverage
- CI-gated wall-clock performance thresholds
- Micro-benchmarking individual helper functions in isolation from production predicate shapes

## Acceptance Criteria

### Tests That Must Pass

1. FITL production equivalence test covers every pipeline-level `legality` and `costValidation` predicate
2. FITL production equivalence test covers every stage-level `legality` and `costValidation` predicate
3. Every compiled non-boolean FITL predicate produces the same boolean result as `evalCondition(...)` across the deterministic test corpus
4. Missing-binding failures observed in compiled FITL predicates remain compatible with existing deferral/error policy
5. Coverage output reports compiled vs boolean vs fallback counts descriptively
6. Benchmark harness emits compiled-vs-interpreted timing data for the production predicate corpus without mutating private cache state or requiring benchmark-only kernel hooks
7. Existing relevant engine tests continue to pass

### Invariants

1. No benchmark-only production code paths or compatibility shims are introduced
2. The proof uses the production FITL `GameDef`, not synthetic stand-ins
3. Compiled predicate evaluation and interpreter evaluation share the same `ReadContext` inputs
4. All changes remain game-agnostic at the kernel boundary even though FITL is the proof corpus
5. If the tests expose a mismatch, the code must be fixed rather than weakening the proof

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compiled-condition-equivalence.test.ts` — production FITL predicate equivalence, missing-binding compatibility, and descriptive coverage reporting
2. `packages/engine/test/performance/compiled-condition-benchmark.test.ts` — deterministic predicate-corpus benchmark for compiled closures vs interpreter

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/compiled-condition-equivalence.test.js`
3. `node --test packages/engine/dist/test/performance/compiled-condition-benchmark.test.js`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Added `packages/engine/test/helpers/compiled-condition-production-helpers.ts` to centralize FITL production predicate collection, deterministic state-corpus generation, binding-variant generation, and compiled-sample construction.
  - Added `packages/engine/test/integration/compiled-condition-equivalence.test.ts` to prove compiled-vs-interpreted parity over the FITL production predicate corpus and to verify missing-binding compatibility.
  - Added `packages/engine/test/performance/compiled-condition-benchmark.test.ts` to benchmark compiled closures against `evalCondition(...)` over the same production predicate corpus.
- Deviation from the original ticket framing:
  - The ticket was corrected before implementation because cache and policy integration had already shipped in tickets 003-004.
  - The benchmark compares the predicate abstraction directly instead of forcing an interpreter-only `legalMoves(...)` path. This is architecturally cleaner because it avoids benchmark-only production hooks.
  - The production proof uses deterministic progressed FITL states, not seed-only initial states.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/compiled-condition-equivalence.test.js`
  - `node --test packages/engine/dist/test/performance/compiled-condition-benchmark.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
