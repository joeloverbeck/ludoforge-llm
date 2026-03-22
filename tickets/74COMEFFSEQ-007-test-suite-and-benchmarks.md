# 74COMEFFSEQ-007: Compiled Effects Test Suite and Performance Benchmarks

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test files and benchmark scripts
**Deps**: 74COMEFFSEQ-005, 74COMEFFSEQ-006

## Problem

The compiled effect sequences need comprehensive end-to-end testing across both game specs (Texas Hold'em and FITL) and performance benchmarks that quantify the speedup against the baseline. Without this, we cannot verify the spec's target of 50-70% reduction in `lifecycle:applyEffects` time or catch regressions.

## Assumption Reassessment (2026-03-21)

1. Texas Hold'em compiled spec can be loaded via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed per CLAUDE.md testing requirements.
2. FITL compiled spec uses the same helper. Confirmed.
3. The existing `run-profile.mjs` (or similar) benchmark script profiles simulation runs. Must verify location.
4. `PerfProfiler` with `perfStart`/`perfEnd`/`perfDynEnd` provides timing infrastructure. Confirmed.
5. Determinism tests use `computeFullHash` to compare states across runs. Confirmed.
6. A prior investigation suspected the engine default test lane was broken, but sequential verification showed `pnpm -F @ludoforge/engine test` passes after a normal build. The earlier failure came from a concurrent build/test race that cleaned `dist` mid-run, so this ticket does not own harness repair. Corrected.

## Architecture Check

1. End-to-end tests prove the system works with real game specs, not just hand-crafted ASTs (Foundation 11).
2. Benchmarks use the existing `PerfProfiler` infrastructure — no new profiling mechanisms needed.
3. Golden tests compare compiled-path outcomes against known-good interpreter results for specific seeds.
4. Both games must be tested to prove engine-agnosticism (Foundation 1).
5. This ticket assumes a stable sequential engine test harness. Any future build/test concurrency hardening should stay separate from compiled-effects benchmark/tests scope so ownership remains clear.
6. Runtime integration in `74COMEFFSEQ-005` now explicitly owns effect-budget parity. This ticket should verify that contract at the regression level, not redefine it.

## What to Change

### 1. End-to-end compiled effects tests

Create test files that:
- Compile a full game spec (Texas Hold'em, FITL).
- Create a `GameDefRuntime` with `compiledLifecycleEffects`.
- Run a deterministic simulation (fixed seed) with the compiled path.
- Run the same simulation with the interpreter path (compiled effects disabled or removed from runtime).
- Assert bit-identical final state hashes.
- Assert that the compiled path's profiler bucket `lifecycle:applyEffects:compiled` has non-zero count (proving the compiled path was actually used).

### 2. Coverage ratio tests

For each game:
- Assert that `compiledLifecycleEffects` map is non-empty.
- Log coverage ratios for each compiled phase.
- Assert minimum coverage thresholds (e.g., Texas Hold'em lifecycle effects should be >80% compilable based on spec analysis).

### 3. Performance benchmark script

Create a benchmark that:
- Runs a full Texas Hold'em tournament simulation (same parameters as the original profiling campaign: 100 hands or similar).
- Profiles with `PerfProfiler`.
- Reports `lifecycle:applyEffects` and `lifecycle:applyEffects:compiled` timings.
- Computes percentage improvement.
- Outputs comparison table.

This is a developer tool, not a CI-gated test — it runs manually to measure perf impact.

### 4. Regression guard test

A lightweight test that runs a short simulation (10 hands) with compiled effects and asserts:
- No verification errors (with `verifyCompiledEffects: true`).
- Final state hash matches a golden value for the fixed seed.
- A low-budget lifecycle execution scenario behaves identically between compiled and interpreter paths, so the compiled runtime path cannot silently bypass `maxEffectOps`.
- This runs in CI and catches compiler regressions.

## Files to Touch

- `packages/engine/test/e2e/compiled-effects-texas-holdem.test.ts` (new)
- `packages/engine/test/e2e/compiled-effects-fitl.test.ts` (new)
- `packages/engine/test/integration/compiled-effects-coverage.test.ts` (new)
- `packages/engine/scripts/benchmark-compiled-effects.mjs` (new) or extend existing benchmark script
- `packages/engine/test/unit/kernel/compiled-effects-regression.test.ts` (new)

## Out of Scope

- Improving the compiler itself (that's 74COMEFFSEQ-002/003/004)
- Phase 2 pattern support
- Action effect compilation (future spec)
- Modifying game specs or data files
- Runner/frontend changes
- CI pipeline configuration changes (just the test files)

## Acceptance Criteria

### Tests That Must Pass

1. Texas Hold'em E2E: compiled path produces identical final state hash to interpreter path for seeds [42, 123, 9999].
2. FITL E2E: compiled path produces identical final state hash to interpreter path for seed 42.
3. Coverage: Texas Hold'em lifecycle effects have a compiled coverage ratio ≥ 0.8.
4. Coverage: every game's `compiledLifecycleEffects` map has at least one entry per phase with onEnter/onExit effects.
5. Regression guard: 10-hand Texas Hold'em simulation with `verifyCompiledEffects: true` passes without verification errors.
6. Regression guard: compiled and interpreted lifecycle execution match under a constrained effect budget.
7. Regression guard: final state hash for seed 42 matches the golden value.
8. Benchmark script runs without errors and produces a readable timing comparison.
9. Existing suite: `pnpm -F @ludoforge/engine test`
10. Existing e2e suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. **Determinism across paths**: For any seed, compiled and interpreted paths produce identical state hashes (Foundation 5).
2. **Engine-agnosticism**: Both Texas Hold'em and FITL pass compiled effect tests — no game-specific logic leaked into the compiler (Foundation 1).
3. **No false positives**: The regression guard test uses `verifyCompiledEffects: true` — if it passes, correctness is proven for that seed.
4. **Benchmark does not gate CI**: The benchmark script is informational, not a pass/fail gate.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/compiled-effects-texas-holdem.test.ts` — full simulation comparison
2. `packages/engine/test/e2e/compiled-effects-fitl.test.ts` — full simulation comparison
3. `packages/engine/test/integration/compiled-effects-coverage.test.ts` — coverage ratio assertions
4. `packages/engine/test/unit/kernel/compiled-effects-regression.test.ts` — golden hash regression guard plus a focused budget-parity assertion for compiled lifecycle execution

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/compiled-effects-regression.test.ts`
3. `pnpm -F @ludoforge/engine build && node packages/engine/scripts/benchmark-compiled-effects.mjs`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck`
