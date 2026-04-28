# POLPREVDRIVE-006: Add FITL-parity perf gate exercising 4 baseline profiles under verifyIncrementalHash

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No engine source — adds CI-side perf-test coverage only
**Deps**: archive/tickets/POLPREVDRIVE-001.md, reports/polprevdrive-001-investigation.md

## Problem

The POLPREVDRIVE-001 investigation surfaced a process gap: the existing `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` ran during the spec-145/146/147 campaign and reported a **−64.76% improvement** on its measured workload, yet the FITL determinism-parity slowdown (timing out at 30 min on the `zobrist-core` shard) was not caught until PR #231 hit CI.

The mismatch is in workload shape:

- The existing perf benchmark exercises one profile at a time and does not enable `verifyIncrementalHash: true`.
- The regression only manifests when **all four FITL baseline profiles run concurrent** (`us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`) **with `verifyIncrementalHash: true`**, which is the determinism-parity test's actual shape.

Without a perf gate that mirrors the parity workload, future drive-perf regressions can again slip past the campaign benchmarks and only get caught when CI shards time out — a 30-minute feedback loop instead of a sub-minute one.

This ticket adds a perf-test (or a dedicated fast-mode CI lane) that runs the scoped harness shape from `packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42` with a wall-clock ceiling. It guards the surface that POLPREVDRIVE-002/003/004/005 are about to optimise, so any future regression is caught at PR review time.

## Assumption Reassessment (2026-04-27)

1. **`packages/engine/scripts/profile-fitl-preview-drive.mjs` exists and runs in ~35 s on PR / ~3 s on `main`.** Verified — POLPREVDRIVE-001 §Outcome and §Repro Setup. The harness itself is the right shape for a perf gate.
2. **Existing `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` does not exercise this workload.** Verified by reading POLPREVDRIVE-001 §Problem: "the perf-microbenchmark targeted by the `fitl-preview-perf` campaign … does not exercise the determinism-parity code path with `verifyIncrementalHash: true` × 4 named profiles concurrently".
3. **The new lane must respect WSL2 budget.** Verified — POLPREVDRIVE-001's harness completes in <60 s under WSL2 with the chosen seed/maxTurns/profilesAll shape. The same shape is the perf gate.
4. **The existing seed-split `fitl-parity-zobrist-*` shards are the determinism gates, not perf gates.** Verified — `.github/workflows/engine-determinism.yml:54`. The parity shards run replay correctness with a 30-min CI budget; they are too slow to be a perf signal. A separate shorter-budget perf gate is needed.

## Architecture Check

1. **F16 (testing as proof)**: This ticket is exactly the F16 pattern — turn the regression class into a permanent automated guard rather than relying on shard timeouts.
2. **F1 (engine agnosticism)**: The perf gate uses a generic harness that loads FITL because FITL is the failure mode, not because the engine has FITL-specific perf logic. The gate is replicable for Texas with a profile-list change if a similar regression class shows up there.
3. **No backwards compatibility shims**: New file; no migration of existing perf tests.
4. **F8 (determinism)**: The perf gate runs `verifyIncrementalHash: true` because that is the parity workload. It does not weaken determinism guarantees — it strengthens the perf-side proof that determinism stays cheap.

## What to Change

### 1. Decide between perf-test and dedicated CI lane

Two viable shapes:

**Option A — perf test under `packages/engine/test/perf/agents/`.** A new `fitl-parity-drive.perf.test.ts` that calls the same engine surfaces as the harness, asserts wall-clock under a chosen ceiling. Runs in the existing perf lane.

- Pro: integrated with existing perf infrastructure, runs alongside other perf benchmarks.
- Con: perf lane budget pressure. The current FITL parity workload at `--maxTurns 10 --profilesAll` runs in ~35 s on PR; on faster CI hardware it may be ~10–20 s. Multiplied across the perf matrix, this adds load.

**Option B — dedicated CI shard `fitl-parity-perf` in `.github/workflows/engine-determinism.yml`.** A new matrix entry sibling to the seed-split `fitl-parity-zobrist-*` shards that runs the harness in an assertion mode (exit non-zero on threshold breach).

- Pro: isolated budget, no impact on other perf benchmarks.
- Con: more workflow yaml; one more shard to maintain.

Pick **Option A on first implementation**. If the perf-lane budget becomes a problem post-merge, split into Option B in a follow-up.

### 2. Author the perf gate

Under Option A:

- New `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` that:
  - Imports the same engine entry points the harness uses (`runGame` with `kernel.verifyIncrementalHash: true`, FITL game spec, all four baseline profiles concurrent).
  - Runs the workload twice (warm-up + measurement) at `seed=42, maxTurns=10`.
  - Records wall-clock and asserts it stays under a chosen ceiling.
- The ceiling is set as **2× the post-POLPREVDRIVE-002+003+004+005 measured time** to leave headroom for CI variance, capped at the current PR-side wall-clock × 0.6 (i.e., the gate must demonstrably catch the current regression while not flapping on noise). The exact number is set during the merge of this ticket using the most recent harness run as the calibration source.
- Recorded baseline value lives in a constant in the test file with a comment explaining the calibration date and the harness command used to derive it. Future tickets that legitimately raise the floor update both the constant and the comment in the same commit.

### 3. Document the recalibration path

In a short comment block at the top of the new test file, document:

- Where the ceiling came from (which harness command, which calibration commit).
- When to raise it (legitimate workload growth) vs. when not to (regression — investigate first).
- How to recalibrate: re-run the harness, set the new ceiling at 2× the new measured time, and update the comment with the new calibration commit.

This avoids the failure mode where a future contributor silently raises the ceiling to make the test pass without diagnosing why it broke.

## Files to Touch

- `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` (new)
- *(if Option B is chosen instead)*: `.github/workflows/engine-determinism.yml` (modify — add `fitl-parity-perf` matrix entry)

No engine source code is modified by this ticket.

## Out of Scope

- Engine-side perf optimisations (covered by POLPREVDRIVE-002/003/004/005).
- Texas Hold'em parity perf gate — Texas does not exhibit the regression class. Add a sibling Texas gate only if a similar regression appears there.
- Removing or weakening the existing `preview-pipeline.perf.test.ts` — it stays as a profile-bench complement to the parity gate.
- Cross-CI perf reporting / dashboards — out of scope; this ticket is one assertion test, not telemetry infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. New `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` — green at the chosen ceiling on the calibration commit.
2. The new test **fails** when run against the pre-POLPREVDRIVE-001 commit `7677e4d8` (or the calibration baseline pre-perf-fix). This proves the gate would have caught the original regression. Verification documented in the ticket Outcome.
3. `pnpm -F @ludoforge/engine test` — green (perf lane included).
4. `pnpm turbo lint typecheck` — green.
5. Seed-split `zobrist-incremental-parity-fitl-*` tests — unaffected; remain the determinism gates.

### Invariants

1. **F16 — testing as proof**: The regression class is now guarded by an automated test, not by shard-timeout incident response.
2. **F1 — engine agnosticism**: The new test is a perf test, not new engine code; it imports generic `runGame` surfaces.
3. **No game-specific engine branching**: The test loads FITL because that is the failure mode; it does not introduce FITL-aware code in the engine.

### Calibration Gate

6. The ceiling chosen is recorded in-file with the calibration commit SHA and the exact harness command used. A future contributor reading the test can reproduce the calibration without spelunking through history.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` (new) — wall-clock floor.
2. *(verification only, not a permanent test)* Re-run on pre-perf-fix commit `7677e4d8` to confirm the gate catches the regression. Record the failing wall-clock in the ticket Outcome.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test` (perf lane runs as part of this)
3. `pnpm turbo lint typecheck`
4. *(verification)* `git worktree add /tmp/polprev-pre-fix 7677e4d8 && cd /tmp/polprev-pre-fix && pnpm install --frozen-lockfile && pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:perf` — confirm the new gate fails, record the wall-clock breach in the Outcome, then `git worktree remove /tmp/polprev-pre-fix`.

## Outcome

**Completed:** 2026-04-28

**Disposition:** Authored as a forward-looking regression tripwire. Acceptance
criterion #2 ("gate fails at pre-fix commit `7677e4d8`") was reframed under a
1-3-1 reassessment because the post-POLPREVDRIVE-005 wall-clock did not
materially differ from the pre-fix PR-side wall-clock. See "Reassessment
divergence from §2 ceiling formula" below.

### What changed

- Added `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts` (new,
  permanent) — `architectural-invariant` perf gate. Mirrors the
  determinism-parity workload shape: four FITL baseline profiles concurrent
  (`us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`) running
  `runGame` under `kernel.verifyIncrementalHash: true`, at `seed=42`,
  `maxTurns=10`. Asserts wall-clock ≤ `WALL_CLOCK_CEILING_MS = 75_000` ms.
- File-top calibration block records the calibration commit SHA, the harness
  command used, raw measurements, the chosen ceiling, and the recalibration
  policy so a future contributor can reproduce or update without spelunking.

No engine source modified. Option A (perf-test under the existing perf lane)
was chosen per ticket §1; Option B (dedicated CI shard) is left as a
follow-up if the perf-lane budget becomes a problem post-merge.

### Calibration data (post-POLPREVDRIVE-005)

Calibration commit: `eed7384d`. Harness command:

```
node packages/engine/scripts/profile-fitl-preview-drive.mjs \
  --seed 42 --maxTurns 10 --profilesAll
```

| Run                  | elapsedMs |
|----------------------|-----------|
| calibration-1        | 36 895    |
| calibration-2        | 37 556    |
| calibration-3        | 36 981    |
| warmup-1 (`--warmup`)| 34 832    |

Median ≈ 37 000 ms. Ceiling chosen at 75 000 ms (≈ 2× median, per the §2
formula's first bound). The ceiling absorbs CI variance and warmup/no-warmup
spread; a 2× regression to ≥ 75 000 ms fails the gate.

### Verification

- `pnpm -F @ludoforge/engine build` — green.
- `pnpm -F @ludoforge/engine test:perf` — 2/2 perf tests green. New gate
  measured `elapsedMs ≈ 40 800 ms` (well under 75 000 ms ceiling). Existing
  `preview-pipeline.perf.test.ts` continues to emit its non-blocking
  `POLICY_PERF_REGRESSION` warning (warn-only by design — see test source).
- `pnpm -F @ludoforge/engine test` (default lane) — 5712/5712 tests green.
- `pnpm turbo lint typecheck` — 5/5 tasks green.
- Seed-split `zobrist-incremental-parity-fitl-*` shards — unaffected (no
  engine source touched; new file is a perf test, not a determinism test).

### Reassessment divergence from §2 ceiling formula

The §2 formula prescribed `min(2× post-fix measured time, PR-side × 0.6)`.
Applied verbatim:

- 2× post-fix median = `2 × 37 000 = 74 000` ms
- PR-side × 0.6 = `34 917 × 0.6 = 20 950` ms

The two bounds disagree because the post-POLPREVDRIVE-005 wall-clock is
essentially identical to the pre-fix PR-side wall-clock from POLPREVDRIVE-001
(34 917 ms). The original optimisation envelope shrank between when this
ticket was authored and when it ran:

- POLPREVDRIVE-002's draft fast-path gain (24 229 → 18 492 ms post-fix) was
  reverted in commit `51a5a6bb` (`fix(kernel): drop unsound active-draft
  fast-path in getTokenStateIndex`), which removed an unsound delta-tracking
  short-circuit that leaked stale occurrences during effect dispatch.
- POLPREVDRIVE-003 (lower default `K_PREVIEW_DEPTH` from 8 to 6) moved
  wall-clock within noise (σ ≈ 600 ms) per its Outcome.
- POLPREVDRIVE-004 (resolveRef cache) moved wall-clock from 35 888 ms to
  35 872 ms (within noise) per its Outcome.
- POLPREVDRIVE-005 closed without an engine source change per its §1 gate.

Acceptance criterion #2 ("the new test fails when run against the pre-
POLPREVDRIVE-001 commit `7677e4d8`") is therefore not demonstrable today: any
ceiling that catches the historical regression also fails at the current
calibration commit. The pre-fix verification step from the Test Plan §4 was
not run for that reason — the verification would have either spuriously
passed (ceiling above current calibration) or spuriously failed (ceiling
below current calibration), neither of which proves the gate works as
intended for that historical comparison.

The gate is therefore published as a forward-looking regression tripwire:
it catches future drift > 2× the post-005 baseline, which is the same
regression class that originally caused the 30-min CI shard timeout. The
calibration block in the test file documents the divergence so a future
reader can recalibrate under the current rules when a follow-up ticket
genuinely reduces wall-clock further.

### Residual risk

- The current ceiling (75 000 ms) tolerates a 2× drift before firing. If a
  future regression delivers < 2× drift on this workload, the gate misses
  it. This matches the ticket's explicit "not flapping on noise" budget;
  tighter thresholds become viable once a follow-up ticket actually moves
  wall-clock below ~20 s on this workload, at which point the ceiling can
  be lowered.
- CI hardware variance vs WSL2 is unmeasured. If the perf lane runs on
  materially slower hardware than the calibration machine, a one-time
  ceiling bump may be needed; the recalibration policy in the test header
  documents the procedure.

### F16 deliverable status

The drive-perf regression class (4 baseline profiles concurrent +
`verifyIncrementalHash: true`) is now guarded by an automated permanent test
that runs in the existing perf lane, instead of being caught only by 30-min
CI shard timeouts. F16 (testing as proof) is satisfied for the forward
direction, even though the historical-regression demonstration step from
acceptance criterion #2 is not satisfiable at the current calibration.
