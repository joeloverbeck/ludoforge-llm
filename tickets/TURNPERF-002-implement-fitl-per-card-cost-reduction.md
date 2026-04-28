# TURNPERF-002: Implement FITL per-card cost reduction after Phase 1 profiling

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/kernel/token-state-index.ts`, `packages/engine/src/kernel/effects-token.ts`, `packages/engine/src/agents/policy-preview*`, `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/microturn/*`, and perf tests as evidence requires.
**Deps**: archive/tickets/TURNPERF-001-audit-and-budget-fitl-per-turn-cost.md, reports/turnperf-001-investigation-2026-04-28.md, archive/tickets/POLPREVDRIVE-006.md, archive/tickets/POLPREVDRIVE-007.md, archive/tickets/LIFECYCFIX-001-card-discard-zone-honored-by-turn-flow-lifecycle.md, reports/ci-failures-pr-231-2026-04-28.md

## Problem

`TURNPERF-001` landed the Phase 1 harness/report and proved that the first post-`LIFECYCFIX-001` FITL card remains far too expensive under all four baseline profiles with `verifyIncrementalHash=true`: one card took `8710.05 ms`, with `driveExitTotal=211`, `tokenStateIndexBuildCount=2381`, and the largest profiler buckets in `simAgentChooseMove` / `agent:evaluatePolicyExpression`.

The original steady-state target remains unsatisfied. Full 5-card and full-game measurement commands were too expensive for the initial feedback loop, so this ticket owns the Phase 2 implementation loop and the eventual recalibrated perf gate.

## Assumption Reassessment (2026-04-28)

1. **The Phase 1 evidence is sufficient to justify implementation work.** Verified in `reports/turnperf-001-investigation-2026-04-28.md`: the one-card result is already about 35x above the draft `<= 250 ms` target.
2. **The first implementation candidate should be token-index ownership, not a workflow or cap reduction.** Phase 1 still observed `tokenStateIndexBuildCount=2381` for one card. `reports/ci-failures-pr-231-2026-04-28.md` already identified persisting `MutableTokenStateIndex` in the WeakMap as Option B, which should reduce refresh/rebuild churn without weakening coverage.
3. **Policy evaluation may remain the dominant residual after token-index work.** Phase 1's `--profileBuckets` run showed `simAgentChooseMove=5381.26 ms` and `agent:evaluatePolicyExpression=5378.06 ms`. Treat that as a follow-on measurement target after the token-index candidate lands, not as a reason to stack speculative changes first.
4. **The hard per-card gate is not ready to add yet.** The existing one-card cost is too high and the five-card prefix did not return within the bounded probe window. Add or recalibrate `fitl-per-card-cost.perf.test.ts` only after the smallest representative probe reaches a plausible budget range.

## Architecture Check

1. **F8 determinism**: Every optimization must preserve replay identity and exact hashes for committed canonical states. Do not make hash verification probabilistic to meet this ticket.
2. **F10 bounded computation**: Do not lower turn caps, preview-depth caps, parity workload, or CI shard coverage as the primary answer. Reduce root-cause work per card.
3. **F11 scoped mutation**: Caching mutable token-index internals is allowed only if the cache is isolated from caller-visible state and fork/run boundaries remain deterministic.
4. **F15 root cause**: The implementation must address measured hot paths rather than raising the POLPREVDRIVE tripwire or treating the slow shard as advisory.

## What to Change

### 1. Implement the first measured candidate

Start with `MutableTokenStateIndex` as the WeakMap value in `token-state-index.ts`, or an equivalent measured design that preserves the same bounded-occurrence-map benefit. The implementation must avoid the unsound active-draft shortcut that `51a5a6bb` removed.

### 2. Measure before stacking additional candidates

After each candidate, rerun the smallest representative probes:

- one-card target probe without `--profileBuckets`
- one-card attribution probe with `--profileBuckets`
- focused correctness checks for the touched cache/runtime behavior

Only continue to `PolicyAgent` / policy-preview evaluation if token-index work no longer dominates or the one-card cost remains materially red.

### 3. Add or recalibrate the durable perf gate once plausible

When bounded probes reach a plausible budget range, add `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` or update the existing perf gates with documented calibration data. Do not use a hard gate that cannot pass in normal local/CI feedback.

### 4. Preserve original parity coverage

The final proof must show that seed-42 and seed-123 determinism/parity coverage remains meaningful and fits the intended CI budget. Do not mark this ticket complete by weakening those shards.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (likely modify)
- `packages/engine/src/kernel/effects-token.ts` (likely modify)
- `packages/engine/src/agents/policy-preview.ts` (possibly modify after measurement)
- `packages/engine/src/agents/policy-runtime.ts` (possibly modify after measurement)
- `packages/engine/src/kernel/eval-query.ts` (possibly modify after measurement)
- `packages/engine/src/kernel/microturn/publish.ts` (possibly modify after measurement)
- `packages/engine/src/kernel/microturn/drive.ts` (possibly modify after measurement)
- `packages/engine/test/kernel/token-state-index-incremental.test.ts` (modify/add coverage)
- `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` (possibly recalibrate)
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (new when budget is plausible)
- `reports/turnperf-002-implementation-2026-04-XX.md` (new measured implementation report)

## Out of Scope

- Re-fixing lifecycle card deletion (`LIFECYCFIX-001`).
- Reopening `AUTORESCASC-001`; its cascade premise was closed as already-satisfied.
- Weakening determinism/parity coverage, turn caps, or `verifyIncrementalHash` as the primary solution.
- Stacking multiple speculative optimizations without measuring each candidate.

## Acceptance Criteria

### Tests That Must Pass

1. Token-index correctness coverage proves multi-occurrence tokens, moved tokens, removed tokens, and unchanged zones remain indexed correctly after the new cache strategy.
2. One-card FITL probe shows materially reduced cost versus `TURNPERF-001` baseline and records `elapsedMs`, `driveExitTotal`, `tokenStateIndexBuildCount`, `draftTokenStateIndexDeltaCount`, and `draftTokenStateIndexAttachCount`.
3. Attribution probe with `--profileBuckets` records whether residual ownership is token-index/runtime, `simAgentChooseMove`, or another stack.
4. Existing perf gate: `pnpm -F @ludoforge/engine test:perf`.
5. Determinism/parity proof for `zobrist-incremental-parity-fitl-seed-{42,123}` completes inside the intended CI budget, or the ticket remains open with exact red metrics and a follow-up owner.
6. Existing suites appropriate to touched files, at minimum `pnpm -F @ludoforge/engine build` and focused engine tests for the modified modules.

### Invariants

1. No game-specific FITL branches in kernel, simulator, or agent runtime code.
2. No compatibility aliases or legacy cache paths remain after migration.
3. Cache state cannot leak across independent `runGame` forks in a way that changes semantics.
4. `verifyIncrementalHash=true` still verifies committed canonical states.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/token-state-index-incremental.test.ts` — extend for the chosen cache strategy, especially multi-occurrence and moved-token cases.
2. `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` — add only after measured data supports a meaningful passing budget.
3. `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` — recalibrate only with documented three-run data after implementation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused token-index test command after build.
3. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-smoke`
4. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-attribution`
5. `pnpm -F @ludoforge/engine test:perf`
6. `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js`
7. Broader package/root lanes as required by touched runtime surfaces.
