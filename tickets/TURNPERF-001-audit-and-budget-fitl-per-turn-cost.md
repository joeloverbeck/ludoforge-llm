# TURNPERF-001: Audit and budget the FITL per-turn cost (~35-40 s/turn for 4 baselines under verifyIncrementalHash)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium-Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview*`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/effects-token.ts`, `packages/engine/src/kernel/token-state-index.ts`, `packages/engine/src/kernel/microturn/*`, plus tests/profiling.
**Deps**: archive/tickets/POLPREVDRIVE-006.md, archive/tickets/POLPREVDRIVE-007.md, archive/tickets/LIFECYCFIX-001-card-discard-zone-honored-by-turn-flow-lifecycle.md, archive/tickets/AUTORESCASC-001-investigate-and-bound-auto-resolve-cascade.md, reports/ci-failures-pr-231-2026-04-28.md

## Problem

The pre-`LIFECYCFIX-001` baseline measurements below were captured during the degenerate single-turn run where the lifecycle silently deleted played cards before terminal fired. Earlier framing of this ticket also referenced a separate "auto-resolve cascade" tracked by `AUTORESCASC-001`; that ticket's Phase 1 reassessment (`reports/auto-resolve-cascade-investigation-2026-04-28.md`) determined the cascade does not exist as described in current code, and AUTORESCASC-001 was closed as already-satisfied with no engine code changes. The lifecycle deletion was the actual mechanism, fixed by `LIFECYCFIX-001` alone.

Pre-`LIFECYCFIX-001` baseline (single-turn degenerate game), `seed=42, profilesAll, maxTurns=5, verifyIncrementalHash: true`:

| Workload | Local wall-clock | Drive previews | Token-index builds |
|---|---|---|---|
| `seed=42 maxTurns=5 profilesAll` | 35 660 ms | 617 | 7 090 |
| `seed=42 maxTurns=10 profilesAll` | 35 510 ms | 617 | 7 090 |
| `seed=42 maxTurns=20 profilesAll` | 36 630 ms | 617 | 7 090 |
| `seed=123 maxTurns=1 profileId us-baseline` | 5 952 ms | 177 | 2 157 |
| `seed=123 maxTurns=2 profileId us-baseline` | 29 312 ms | 652 | 12 268 |

That degenerate run spent **~35 s of CPU time** on a single card-played's worth of preview drives (with ~600 drives, ~7 000 token-index builds) — far above any reasonable per-card budget for a deterministic kernel-driven game. Now that `LIFECYCFIX-001` has landed and the engine plays full FITL games (~78 cards), this per-card cost multiplies directly: 78 × 35 s ≈ 45 minutes per game per shard. The 30-min CI budget cannot accommodate this; more importantly, this is too slow for any practical evolution / quality-of-design pipeline that runs millions of seeds.

The POLPREVDRIVE campaign (001 → 007) has materially reduced specific hot stacks (e.g., the active-draft soundness fix in `51a5a6bb` and the recently-merged `b362038a` scoped refresh). But the residual baseline is still dominated by token-index work and preview drive work that is not yet attributed to a single owner. Per `archive/tickets/POLPREVDRIVE-006.md`, the campaign's perf gate was published as a "forward-looking regression tripwire" rather than a baseline target — i.e., the team explicitly accepted that the calibrated 75 s ceiling is not a healthy steady-state.

This ticket targets the steady-state per-turn cost. The goal is to drive the post-`LIFECYCFIX-001` per-card cost to a budget that lets a full FITL game complete inside the 30-min CI shard at all 4 baselines.

## Assumption Reassessment (2026-04-28)

1. **The recent fix `b362038a` ("scope refreshCachedTokenStateIndexEntries to affected zones") improves but does not solve the residual cost.** Verified: post-fix, `seed=42 maxTurns=5 profilesAll` is 35-37 s vs the POLPREVDRIVE-006 calibrated 37 000 ms median. Improvement is small because the workload is dominated by other hot paths.
2. **`tokenStateIndexBuildCount = 7 090` for a single 4-baseline turn** indicates that despite the WeakMap cache and the scoped refresh, the kernel rebuilds the token-state index thousands of times per turn. Each rebuild is `O(zones × tokens)` ≈ `O(40 × 130)` ≈ 5 200 ops. Total: ~37M ops just for index rebuilds. That alone is not catastrophic, but it is a strong signal of cache-miss patterns the `b362038a` fix did not eliminate.
3. **Drive previews dominate wall-clock.** `driveExitTotal = 617` for one card. At 35 s, that is ~57 ms / drive — high for a deterministic kernel step. Each drive runs `applyMove` + chained microturn drive iterations.
4. **`verifyIncrementalHash: true` adds a Zobrist consistency check on every state transition.** This is intentional — it is the parity test's whole point — but the implementation may be re-hashing more state than necessary (full vs incremental).
5. **`POLPREVDRIVE-006` itself is documented as a tripwire, not a target.** Its calibration block explicitly states that POLPREVDRIVE-002's gain was reverted and POLPREVDRIVE-003/004/005 were within noise. So the tripwire baseline is not a healthy steady-state.

## Architecture Check

1. **F8 (determinism)**: Every optimization MUST preserve byte-exact replay identity. No probabilistic shortcuts.
2. **F11 (immutability + scoped mutation)**: Optimizations may introduce additional scoped internal mutation but must remain isolated from caller-visible state.
3. **F1 (engine agnosticism)**: No FITL-specific perf shortcuts in the kernel/agents. All optimizations must apply equally to Texas Hold'em and any future cardDriven game.
4. **F10 (bounded computation)**: Preview drives and token-index work must remain bounded; budget reductions cannot rely on lowering caps to game-incorrect values.
5. **F15 (root-cause)**: Don't lower the CI shard ceiling; investigate where the ~57 ms / drive goes and remove non-essential work.

## Investigation Plan (Phase 1 — diagnostic, no code changes)

1. **Re-baseline post-`LIFECYCFIX-001`.** This ticket cannot use the original pre-`LIFECYCFIX-001` degenerate-game baseline because it is not a real game. `LIFECYCFIX-001` has landed; `AUTORESCASC-001` closed as already-satisfied (no code changes), so the post-fix baseline is the current `8ca1df07` build. Capture:
   - per-card wall-clock (median, p95, p99) on `seed=42` and `seed=123` with all 4 baselines, full game (no maxTurns cap).
   - `driveExitTotal`, `tokenStateIndexBuildCount`, `draftTokenStateIndexAttachCount`, `draftTokenStateIndexDeltaCount` per card.
   - CPU-profile attribution: `node --cpu-prof --cpu-prof-dir=/tmp/turnperf-baseline packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 50 --profilesAll`.
2. **Categorize the residual hot stacks.** Group sampled self-time into:
   - Preview drive infrastructure (`createPolicyPreviewRuntime`, `applyPreviewDriveGreedyChooseOne`, `publishMicroturnFromCanonicalState`).
   - Effect dispatch + token-index work (`applyEffectsWithBudgetState`, `getTokenStateIndex`, `refreshCachedTokenStateIndexEntries`, `buildTokenStateIndex`).
   - Query / filter primitives (`evalQuery`, `applyTokenFilter`, `evalCondition`, `evalValue`).
   - Zobrist hash work (`computeFullHash`, `verifyIncrementalHash` paths).
   - Agent decision logic (`PolicyAgent.choose`, scorer evaluators).
3. **Profile per category** to determine whether the residual is in preview previews (mostly stable agent shape), in eval-query (largely stateless filters), or in incremental-hash verification (which may be unintentionally doing full-state work each step).
4. **Identify a credible per-card budget.** For evolution pipelines and CI, a target like "≤ 250 ms median per card under 4 baselines + verifyIncrementalHash" is plausible but must be justified by the profiling data, not asserted.

## Possible Fix Surfaces (per Phase 1 outcome)

The following fix surfaces are candidates; the right combination is decided after Phase 1.

### A. Memoize `publishMicroturnFromCanonicalState` per `(state.stateHash, seatId, turnId)`

The drive-preview's hot path republishes the microturn at every iteration even when the inputs are unchanged. A drive-scoped memo would cut redundant work.

### B. Promote `MutableTokenStateIndex` to a WeakMap value (subsumes `b362038a`)

Persist the inverse-occurrence map alongside the index so refresh updates are `O(K + zone_size)` even on first cache miss. This is "Option B" from `reports/ci-failures-pr-231-2026-04-28.md` that we deferred.

### C. Lower `verifyIncrementalHash`'s sampling rate during preview

`verifyIncrementalHash: true` is mandated for the parity test, but inside preview drives the verification is redundant (the drive's outputs are not committed to the canonical state until `attachAsCanonical`). Detect and skip verify-incremental-hash inside drive scope.

### D. Compile predicate evaluators

`applyTokenFilter` re-evaluates filter expressions per token per query. Compiling these once per `(filter-expr, def)` and reusing the closure should reduce per-token overhead.

### E. Reduce drive-iteration churn via better depth-cap heuristics

`POLPREVDRIVE-003` lowered `K_PREVIEW_DEPTH` 8 → 6. The depth-quantile data shows p95 = 5 across all profiles; further targeted reductions (per-profile or per-action-class caps) may be safe.

### F. Inline / specialize `getTokenStateIndex` for hot callers

Two callers (`eval-query.ts:375 applyTokenFilter`, `eval-query.ts:795 evalTokensZonesQuery`) are responsible for most of the index reads. A specialized hot-path may avoid the WeakMap lookup overhead per call.

## Implementation Plan (Phase 2 — gated on Phase 1)

Implement the smallest combination of A-F that achieves the budget. Each change must be measured independently and recorded in `reports/turnperf-001-investigation-2026-04-XX.md` with before/after numbers.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (likely modify)
- `packages/engine/src/agents/policy-runtime.ts` (likely modify)
- `packages/engine/src/kernel/eval-query.ts` (likely modify)
- `packages/engine/src/kernel/effects-token.ts` (likely modify)
- `packages/engine/src/kernel/token-state-index.ts` (likely modify)
- `packages/engine/src/kernel/microturn/publish.ts` (likely modify)
- `packages/engine/src/kernel/microturn/drive.ts` (likely modify)
- `packages/engine/src/kernel/zobrist-incremental.ts` (likely modify — verify-incremental-hash scoping)
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify — add per-card breakdown mode)
- `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` (modify — recalibrate ceiling after baseline)
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (new — per-card budget gate)
- `reports/turnperf-001-investigation-2026-04-XX.md` (new — Phase 1 deliverable)

## Out of Scope

- Card-deletion in lifecycle (owned by `LIFECYCFIX-001`, landed).
- Auto-resolve cascade investigation (owned by `AUTORESCASC-001`, closed as already-satisfied — no code changes).
- Re-architecting MAP-Elites or evolution pipeline for parallel runs.
- Re-blessing golden traces unrelated to perf changes (each re-bless that DOES become necessary must be itemized in the commit body per `.claude/rules/testing.md`).

## Acceptance Criteria

### Tests That Must Pass

1. **Per-card budget gate**: New `fitl-per-card-cost.perf.test.ts` measures median wall-clock per played card across at least 5 cards (warmup + 4 measured) under all 4 baselines + `verifyIncrementalHash`. Median must satisfy a documented budget (target: ≤ 250 ms; final budget set by Phase 1's data, justified in the test docblock).
2. **`fitl-parity-drive.perf.test.ts` recalibrated**: Its ceiling is reduced to a number that reflects the post-fix steady-state, NOT the pre-fix degenerate ~37 s baseline. Recalibration follows the test's existing protocol (3-run median × 2× safety margin, calibration block updated).
3. **Determinism shard fits in budget**: With `LIFECYCFIX-001` already merged (and `AUTORESCASC-001` closed as already-satisfied), both `zobrist-incremental-parity-fitl-seed-{42,123}` shards complete inside the 30-min `Engine Determinism Parity` job budget.
4. **Replay identity preserved**: Every full-game seed in the existing parity corpus produces the same final-state hash before and after this ticket's changes (subject to legitimate re-blessing for distinct, non-perf-related reasons).
5. **Texas perf neutral**: Existing Texas Hold'em performance gates remain green; no Texas regression > 10 %.
6. **Existing suites**: `pnpm turbo test`, `pnpm -F @ludoforge/engine test:integration`, `pnpm -F @ludoforge/engine test:e2e:all`, full determinism shards.

### Invariants

1. **Per-card budget documented**: The new perf gate's budget number includes a docblock explaining the calibration data and the rationale (prevents future "raise to silence" regressions).
2. **Profile reproducibility**: The diagnostic harness is deterministic and produces stable measurements (within the noise budget documented in `archive/tickets/POLPREVDRIVE-003.md`).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` — new perf gate, per-card median budget.
2. `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` — modify; recalibrate ceiling. Update calibration block per the test's existing protocol.
3. `packages/engine/scripts/profile-fitl-preview-drive.mjs` — modify; add `--perCard` mode that emits per-card timing and counters.
4. `packages/engine/test/integration/texas-cross-game.test.ts` — review; ensure Texas perf gates remain green.
5. `reports/turnperf-001-investigation-2026-04-XX.md` — new diagnostic report; required Phase 1 deliverable.

### Commands

1. `pnpm -F @ludoforge/engine test:perf` (run the perf gates locally; should respect the new budget).
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
3. `pnpm -F @ludoforge/engine test:integration:texas-cross-game`
4. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-{a,b,c}`
5. `pnpm -F @ludoforge/engine test:e2e:all`
6. `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-{42,123}.test.js` (must complete inside 30 min on CI).
7. `pnpm turbo lint typecheck`

## Phase Gates

This ticket is split into two gated phases:

- **Phase 1 — Profile** (deliverable: `reports/turnperf-001-investigation-2026-04-XX.md`). Identifies the dominant residual cost categories and proposes a fix surface combination (A-F or other). NO production code change in Phase 1; the harness/profiler can be extended.
- **Phase 2 — Implement** (gated on Phase 1 review). Lands the chosen fix combination and recalibrates the perf gates.

The user must approve Phase 1's report and proposed fix surface before Phase 2 begins.

## Risks

- **Determinism fragility**: any change touching the kernel hot path can shift state hashes. Re-blessing must be itemized.
- **`verifyIncrementalHash` scope**: lowering its scope inside drives is correct but subtle; the parity test must still verify hash identity at every committed canonical state.
- **CI cost**: even with this ticket's improvements, the determinism shards may need continued attention. `LIFECYCFIX-001` has landed; `AUTORESCASC-001` closed as already-satisfied. Coordinate any remaining workflow-budget changes around this ticket alone.
- **Polishing vs structural fixes**: easy wins (e.g., redundant memoization) may mask deeper issues (e.g., preview-drive design assumes too-deep exploration). Phase 1 must distinguish these.
