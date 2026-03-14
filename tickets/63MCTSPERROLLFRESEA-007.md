# 63MCTSPERROLLFRESEA-007: Validation campaign bench + CI gating

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `test/e2e/mcts/*.ts`, CI workflow files
**Deps**: 63MCTSPERROLLFRESEA-001 through 63MCTSPERROLLFRESEA-006 (all optimizations must be in place)

## Problem

After implementing all the MCTS performance optimizations (hybrid mode, MAST, state cache, forced-sequence compression, confidence stopping), we need to prove that `hybrid` is both faster and not catastrophically weaker than `legacy`. Without a systematic benchmark comparing all three modes, we cannot confidently promote `hybrid` as the new default.

The spec also requires all three CI MCTS E2E lanes to complete under 15 minutes.

## Assumption Reassessment (2026-03-14)

1. E2E test files exist: `texas-holdem-mcts-fast.test.ts`, `texas-holdem-mcts-default.test.ts`, `texas-holdem-mcts-strong.test.ts`, `texas-holdem-mcts-campaign-bench.test.ts` — confirmed.
2. `mcts-test-helpers.ts` provides shared E2E test utilities — confirmed.
3. CI workflows exist: `engine-mcts-e2e-fast.yml`, `engine-mcts-e2e-default.yml`, `engine-mcts-e2e-strong.yml` — need to verify.
4. Texas Hold'em is the primary benchmark game; FITL could serve as a second game if its spec compiles cleanly.

## Architecture Check

1. Mode comparison tests are a new E2E test file, not modifications to existing per-preset tests.
2. Campaign bench already exists — this ticket extends it to record per-mode metrics.
3. CI workflow changes are read-only or minor wiring (timeout adjustments if needed).

## What to Change

### 1. Create mode-comparison E2E test

New file `texas-holdem-mcts-mode-compare.test.ts` that:
- Runs a fixed-seed Texas Hold'em position through all three modes (`legacy`, `hybrid`, `direct`).
- Records per-mode: wall-clock time, iterations completed, kernel-call counts, cache hit rates, root stop reason.
- Compares `hybrid` vs `legacy` speed (hybrid must be faster).
- Compares `hybrid` vs `legacy` move agreement (logs disagreements for manual review).

### 2. Extend campaign bench

Modify `texas-holdem-mcts-campaign-bench.test.ts` to:
- Run campaigns in both `legacy` and `hybrid` modes.
- Record head-to-head results (win rate, score differential).
- Assert `hybrid` is not more than 5% weaker than `legacy` on the fixed-seed corpus.
- Report diagnostics summary (mean/median times, cache hit rates, stop reason distribution).

### 3. Update existing E2E preset tests

Update `texas-holdem-mcts-fast.test.ts`, `texas-holdem-mcts-default.test.ts`, `texas-holdem-mcts-strong.test.ts` to:
- Use the new preset defaults (which now use `hybrid` mode and `mast` policy).
- Verify determinism within `hybrid` mode.
- Ensure tests complete within reasonable time bounds.

### 4. Parameterize determinism tests

Existing determinism assertions should be parameterized by rollout mode:
- Same seed + same mode + same config = same move.
- Different modes may produce different moves (expected).

### 5. Verify CI lane timing

Run all three E2E lanes and verify each completes under 15 minutes. If any lane exceeds the target:
- Investigate with diagnostics.
- Adjust iteration counts or time limits if the optimization savings are sufficient but test harness overhead is the bottleneck.
- Do NOT weaken assertions to hit the target.

## Files to Touch

- `packages/engine/test/e2e/mcts/texas-holdem-mcts-mode-compare.test.ts` (new)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-campaign-bench.test.ts` (modify)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-fast.test.ts` (modify)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-default.test.ts` (modify)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-strong.test.ts` (modify)
- `packages/engine/test/e2e/mcts/mcts-test-helpers.ts` (modify — add mode-comparison helpers)
- `.github/workflows/engine-mcts-e2e-fast.yml` (read-only or minor timeout adjustment)
- `.github/workflows/engine-mcts-e2e-default.yml` (read-only or minor timeout adjustment)
- `.github/workflows/engine-mcts-e2e-strong.yml` (read-only or minor timeout adjustment)

## Out of Scope

- Implementing any of the optimizations (tickets 001-006 must be complete first).
- Re-tuning `explorationConstant`, `progressiveWideningK`, `progressiveWideningAlpha`, or `heuristicTemperature`.
- Promoting `direct` mode to a named preset.
- Implementing ticket 008 (heuristic backups).
- Modifying FITL-specific tests.
- Changing the MCTS algorithm or search loop.

## Acceptance Criteria

### Tests That Must Pass

1. **mode-compare**: `hybrid` mode is faster than `legacy` mode for `fast` preset (wall-clock time).
2. **mode-compare**: `hybrid` mode is faster than `legacy` mode for `default` preset.
3. **mode-compare**: `hybrid` mode is faster than `legacy` mode for `strong` preset.
4. **mode-compare**: All three modes produce deterministic results (same seed = same move within a mode).
5. **campaign-bench**: `hybrid` is not more than 5% weaker than `legacy` on the fixed-seed campaign bench (win rate or score metric).
6. **campaign-bench**: Diagnostics summary is logged (times, cache hits, stop reasons).
7. **fast/default/strong E2E**: All three preset tests pass with `hybrid` as the default mode.
8. **CI timing**: Each E2E lane completes under 15 minutes (verified by CI run, not unit test).

### Invariants

1. `direct` mode remains experimental — no named preset uses it.
2. `legacy` mode is available and produces correct results (regression baseline).
3. Determinism within each mode: same seed + same config + same mode = same move.
4. No game-specific logic in benchmark tests — tests use the compiled Texas Hold'em GameDef.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts/texas-holdem-mcts-mode-compare.test.ts` — new: cross-mode speed and quality comparison.
2. `packages/engine/test/e2e/mcts/texas-holdem-mcts-campaign-bench.test.ts` — modified: dual-mode campaign with quality regression check.
3. `packages/engine/test/e2e/mcts/texas-holdem-mcts-fast.test.ts` — modified: updated for hybrid defaults.
4. `packages/engine/test/e2e/mcts/texas-holdem-mcts-default.test.ts` — modified: updated for hybrid defaults.
5. `packages/engine/test/e2e/mcts/texas-holdem-mcts-strong.test.ts` — modified: updated for hybrid defaults.

### Commands

1. `pnpm turbo build && pnpm -F @ludoforge/engine test:e2e`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test:all`
3. `pnpm turbo typecheck && pnpm turbo lint`
