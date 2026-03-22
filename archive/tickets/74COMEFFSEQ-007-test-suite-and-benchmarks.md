# 74COMEFFSEQ-007: Compiled Effects Production Regression Coverage and Benchmarking

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — targeted tests plus benchmark tooling
**Deps**: 74COMEFFSEQ-005, 74COMEFFSEQ-006

## Problem

The compiled lifecycle path already exists and already has focused unit/integration coverage, but it still lacks a production-spec regression layer that proves the compiled path and interpreter path stay identical in real Texas Hold'em simulations. The benchmark tooling also exists, but it does not yet provide an apples-to-apples compiled-versus-interpreted comparison using the same harness.

Without that narrower production-path coverage, we risk regressions that only appear in real compiled specs, and we lack a stable developer benchmark for quantifying the architectural value of the current compiled-lifecycle design.

## Assumption Reassessment (2026-03-22)

1. The compiled lifecycle runtime is already implemented in `packages/engine/src/kernel/` via `createGameDefRuntime()` and `compiledLifecycleEffects`. Confirmed.
2. Existing tests already cover compiler orchestration, codegen, verification mismatch handling, runtime dispatch, profiler bucket routing, and `maxEffectOps` parity:
   - `packages/engine/test/unit/kernel/effect-compiler*.test.ts`
   - `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts`
   - `packages/engine/test/integration/compiled-effects-verification.test.ts`
3. Texas production spec loading uses `compileTexasProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed.
4. FITL production spec loading uses `compileProductionSpec()` from the same helper. Confirmed.
5. FITL currently compiles zero lifecycle entries in production. `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` explicitly asserts `fitlRuntime.compiledLifecycleEffects.size === 0`. The original ticket assumption that FITL should have compiled-path E2E coverage was incorrect for the current architecture.
6. Benchmark infrastructure already exists in `campaigns/texas-perf-optimization/run-profile.mjs` and `campaigns/texas-perf-optimization/run-benchmark.mjs`. The missing piece is a compiled-vs-interpreted comparison mode, not a new profiling stack.
7. `PerfProfiler` and its dynamic lifecycle buckets already exist and should remain the single profiling mechanism for this work. Confirmed.
8. Sequential engine test execution is currently the expected operating mode. This ticket does not own build/test concurrency hardening.

## Architecture Reassessment

1. The existing architecture is directionally correct: compiled lifecycle functions are a clean runtime optimization layer over the interpreter, with verification and fallback preserving correctness.
2. Extending the existing benchmark harness is more robust than adding a parallel benchmark script. A second harness would duplicate compilation/loading logic and drift over time.
3. Adding Texas production parity coverage is beneficial because it proves the optimization against a real compiled spec rather than synthetic fixtures alone.
4. Adding FITL “compiled-path parity” tests is not beneficial right now because FITL currently has no compiled lifecycle entries. The correct engine-agnostic assertion today is that FITL still runs correctly with an empty compiled cache and that the runtime truth is explicit in tests.
5. Hard-coded coverage thresholds are not robust architecture. The compiler is pattern-driven and coverage is expected to evolve. Tests should assert deterministic parity and explicit runtime facts, not speculative percentages that will create churn without proving correctness.
6. The benchmark should compare current truth:
   - cached runtime with compiled lifecycle enabled
   - identical runtime with compiled lifecycle cache removed/disabled
   This is the real architectural question: does the compiled path materially outperform the interpreter without changing behavior?

## What to Change

### 1. Texas production regression coverage

Add a production-spec regression test that:
- compiles the Texas Hold'em production spec,
- runs the same deterministic short simulation through:
  - the normal compiled lifecycle runtime path,
  - an equivalent interpreter-only runtime path,
- asserts identical final state hashes,
- asserts the compiled path records non-zero `lifecycle:applyEffects:compiled` profiler usage,
- asserts the interpreter-only path records lifecycle interpreter usage instead.

This should be lightweight enough for CI while still using the real production spec.

### 2. Production runtime truth coverage

Keep runtime truth explicit rather than aspirational:
- Texas production runtime should continue to expose compiled lifecycle entries.
- FITL production runtime should continue to expose zero compiled lifecycle entries until compiler support actually lands.
- If that truth changes later, the tests should be updated alongside the implementation, not in advance of it.

This may extend existing integration coverage rather than introducing a redundant new file.

### 3. Benchmark comparison mode

Extend the existing Texas benchmark tooling so a developer can run one command that:
- executes the same simulation corpus with compiled lifecycle enabled,
- executes the same corpus with compiled lifecycle disabled,
- reports timing for each mode,
- reports `lifecycle:applyEffects` and `lifecycle:applyEffects:compiled` buckets where applicable,
- reports the percentage delta,
- verifies the deterministic fingerprint matches between modes.

This remains a manual developer tool, not a CI gate.

### 4. Regression guard strengthening

Strengthen the regression layer only where it is currently missing:
- a real-production Texas parity test for compiled vs interpreted lifecycle execution,
- a stable seed-based regression assertion for that path,
- no duplicate re-testing of already-covered synthetic `maxEffectOps` boundary behavior unless a new production-path gap is discovered.

## Files to Touch

- `tickets/74COMEFFSEQ-007-test-suite-and-benchmarks.md` (this ticket)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` and/or `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` (extend existing coverage if appropriate)
- `packages/engine/test/e2e/compiled-effects-texas-holdem.test.ts` (new) only if the production-path regression reads cleaner as a dedicated file
- `campaigns/texas-perf-optimization/run-profile.mjs` and/or `campaigns/texas-perf-optimization/run-benchmark.mjs` (extend existing benchmark tooling)

## Out of Scope

- Improving compiler pattern coverage itself
- Adding FITL compiler support where none currently exists
- Action-effect compilation
- Game-spec/data changes
- Runner/frontend changes
- CI pipeline changes beyond adding or strengthening tests
- Introducing a second benchmark framework alongside the existing Texas performance campaign

## Acceptance Criteria

### Tests That Must Pass

1. Texas production regression coverage proves compiled lifecycle and interpreter-only lifecycle execution end in the same final state for fixed seeds.
2. The same Texas regression proves the compiled path actually exercised `lifecycle:applyEffects:compiled`.
3. The corresponding interpreter-only run proves it exercised interpreter lifecycle timing instead of the compiled bucket.
4. Existing runtime-truth coverage remains explicit: Texas has compiled lifecycle entries; FITL currently has none.
5. Existing engine suite passes: `pnpm -F @ludoforge/engine test`
6. Existing e2e suite passes: `pnpm -F @ludoforge/engine test:e2e`
7. Type checking passes: `pnpm turbo typecheck`
8. Benchmark comparison command runs without errors and reports deterministic parity plus a readable timing delta.

### Invariants

1. **Determinism across paths**: For the same seed corpus, compiled-lifecycle and interpreter-only lifecycle execution produce identical final state hashes.
2. **Architecture truth over aspiration**: Tests assert what the production runtimes actually compile today, not what we hope they may compile later.
3. **Single profiling system**: Benchmarking continues to use `PerfProfiler`; no parallel profiling architecture is introduced.
4. **Benchmark does not gate CI**: Performance measurement is informational and manual.

## Test Plan

### New/Modified Tests

1. Extend existing compiled-effects production coverage with real Texas compiled-vs-interpreter parity assertions.
2. Preserve or tighten the explicit Texas/FITL runtime compilation-truth assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo typecheck`
5. `node campaigns/texas-perf-optimization/run-benchmark.mjs`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - corrected the ticket scope to match the existing codebase reality: compiled lifecycle execution, verification, and benchmark infrastructure already existed;
  - fixed cached runtime propagation so compiled lifecycle handlers stay active across Texas production phase transitions and related trigger/advance paths;
  - added a real Texas production regression test that compares compiled-lifecycle and interpreter-only runtime execution on the same deterministic simulation and profiler buckets;
  - extended the existing Texas benchmark harness to compare compiled and interpreter-only lifecycle execution, verify deterministic parity, and report the timing delta.
- Deviations from original plan:
  - no FITL compiled-path parity work was added because FITL still compiles zero lifecycle entries in production and existing tests already make that runtime truth explicit;
  - no new profiling framework or duplicate benchmark harness was introduced;
  - the most important implementation change was not new compiler coverage but fixing runtime architecture so the existing compiled cache is preserved through production execution.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm turbo typecheck`
  - `node campaigns/texas-perf-optimization/run-benchmark.mjs --seeds 5 --players 2 --max-turns 50`
