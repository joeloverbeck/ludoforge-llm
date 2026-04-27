# POLPREVDRIVE-001: Investigate policy-preview drive perf regression vs main on FITL determinism parity

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts`, `packages/engine/src/kernel/microturn/drive.ts`, possibly `policy-eval.ts` and `policy-runtime.ts`
**Deps**: archive/tickets/146DRIVE-004.md, archive/tickets/147AOTCON-001.md, archive/tickets/147AOTCON-002.md, archive/tickets/147AOTCON-003.md

## Problem

The `engine-determinism` `zobrist-core` shard (`zobrist-incremental-parity.test.ts` + `zobrist-incremental-property-texas.test.js`) was timing out at 30 minutes on PR #231 (`implemented-147`) vs ~5 minutes on `main`. Three prior PR-side fixes (`0e3f9bab` revert of `digestDecisionStackFrame` WeakMap, `d06ec797` `compile-agents` preview-default fix, `aea2f97a` sharding the FITL property tests into `fitl-medium-zobrist`/`fitl-short-zobrist`) did not resolve the timeout. Local timing isolated the slow section: the `Zobrist incremental parity — FITL` describe (2 seeds × 200 turns × 4 named baseline profiles, with `verifyIncrementalHash: true`) was running for many minutes, while the Texas portions remained fast (~6 s combined).

The CI fix in `a2e59e80` (peeling the FITL describe into its own shard `fitl-parity-zobrist`) unblocks CI but does not address the underlying perf regression. The regression is broad enough to matter for any caller that combines:

- 4 named FITL baseline profiles (`us-baseline` / `arvn-baseline` / `nva-baseline` / `vc-baseline`) running concurrently,
- preview-using considerations (e.g., `preferProjectedSelfMargin`),
- and `runGame` invocations under `verifyIncrementalHash: true` (or any other code path that drives a long sequence of move evaluations on FITL profiles).

Reading-only diagnosis points at the synthetic-completion drive introduced for FITL preview by spec 146 / commit `7b0bcdfe`:

- `packages/engine/src/agents/policy-preview.ts:690` `driveSyntheticCompletion` now drives up to depth `K_PREVIEW_DEPTH = 8` per top-K candidate, calling either `applyPreviewDriveGreedyChooseOne` or `publishMicroturnFromCanonicalState` + `applyPublishedDecisionFromCanonicalState` per inner microturn.
- `packages/engine/src/kernel/microturn/drive.ts:656` `applyPreviewDriveGreedyChooseOne` loops up to `depthCap` (default 8) iterations of `publishMicroturnGreedyChooseOne` + `applyPublishedDecisionInternalNoFinalHash`, then canonicalizes once.
- `packages/engine/src/agents/policy-eval.ts:~558` introduces `pickTopKByMoveOnlyScore` and `markPreviewGated` (top-K = 4 by default), so up to 4 candidates per move evaluation actually reach `driveSyntheticCompletion`.

For FITL: ~4 candidates × up to 8 inner microturns × ~200 outer moves × 4 players × 2 seeds ≈ 51 200 inner kernel calls per parity test (approximate upper bound) — vs ~6 400 inner kernel calls on `main` (which used `applyTrustedMove(advanceToDecisionPoint: false)` once per candidate, no drive). Combined with `verifyIncrementalHash: true` adding a `computeFullHash` per outer move, the FITL parity describe is many-x slower on the PR than on `main`.

The perf-microbenchmark targeted by the `fitl-preview-perf` campaign (`packages/engine/test/perf/agents/preview-pipeline.perf.test.ts`) showed −64.76% on its measured workload, but it does not exercise the determinism-parity code path with `verifyIncrementalHash: true` × 4 named profiles concurrently — so the regression on that combined path slipped past the campaign's gate.

A prior local profiling attempt with `node --cpu-prof` hung WSL2 before the profile could be flushed; this ticket therefore plans for a CI-side or scoped-down repro instead of a single big local profile run.

## Assumption Reassessment (2026-04-27)

1. **`packages/engine/src/agents/policy-preview.ts:690 driveSyntheticCompletion` exists in current code.** Verified: `git show HEAD:packages/engine/src/agents/policy-preview.ts | grep -n 'function driveSyntheticCompletion'`. Same for `K_PREVIEW_DEPTH = 8` at `policy-preview.ts:42`.
2. **`packages/engine/src/kernel/microturn/drive.ts:656 applyPreviewDriveGreedyChooseOne` exists.** Verified.
3. **`packages/engine/src/agents/policy-eval.ts pickTopKByMoveOnlyScore` exists.** Verified — added in commit `7b0bcdfe` plus follow-on tickets in the `145PREVCOMP-*` / `146DRIVE-*` / `147AOTCON-*` series.
4. **The four FITL baseline profiles (`us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`) declare preview-using considerations.** Verified by reading `data/games/fire-in-the-lake/92-agents.md:399–490`. None set explicit `preview.completion`, `preview.completionDepthCap`, or `preview.topK`, so they all run with the runtime defaults (`completion = 'greedy'`, `completionDepthCap = 8`, `topK = 4`).
5. **`zobrist-incremental-parity-fitl.test.ts` is now a separate shard.** Verified — `.github/workflows/engine-determinism.yml:54` adds `fitl-parity-zobrist` matrix entry, and `packages/engine/test/determinism/zobrist-incremental-parity-fitl.test.ts` exists.
6. **The simulator uses the canonical-state fast variants.** Verified — `packages/engine/src/sim/simulator.ts` calls `publishMicroturnFromCanonicalState` and `applyPublishedDecisionFromCanonicalState`.
7. **The `0e3f9bab` revert removed `decisionStackFrameDigestCache` from `packages/engine/src/kernel/zobrist.ts`.** Verified by reading current `zobrist.ts:170+`. Re-introducing that cache is **not** part of this ticket — that direction was already tried and rolled back; this ticket targets the *new* drive path, not the digest cache.

## Architecture Check

1. The investigation deliberately does not revert commit `7b0bcdfe` or roll back the synthetic-completion drive. The drive exists for sound reasons (preview now reflects end-of-microturn state instead of mid-turn, which improves preview-feature accuracy and was the motivation for spec 146). The fix space is constrained to: reducing per-iteration cost, narrowing when the drive runs, sharing work across candidates, or tuning `K_PREVIEW_DEPTH` / `topK` defaults — not removing the drive.
2. No game-specific branching. Any tuning lives behind the `CompiledAgentProfile.preview.*` fields, which are already authored per profile in spec YAML. FITL profiles can opt into smaller `completionDepthCap` or `topK` without engine code knowing about FITL.
3. No backwards-compatibility shims. If a default value changes (for example `K_PREVIEW_DEPTH` 8 → smaller), update the constant and any callers' default-resolved sites in one PR; no parallel old/new code paths.
4. Determinism (FOUNDATIONS F8) is preserved by construction — every fix candidate is a perf change, not a semantic one. Replay-identity tests (`zobrist-incremental-parity-fitl.test.ts`, `zobrist-incremental-property-fitl-medium-diverse.test.js`, `spec-140-replay-identity.test.js`) gate this.

## What to Change

This ticket is investigation-first. Implementation work is gated on findings and may produce a follow-up ticket per concrete fix.

### 1. Build a smaller-scoped local repro that fits WSL2

Author a one-off harness file (excluded from the default test lane) that runs a single FITL game at a small turn count with a single named profile under `verifyIncrementalHash: true`, suitable for local `node --cpu-prof` runs that complete in under a minute and a few hundred MB of RAM.

Suggested shape: 1 seed × 50 turns × 1 profile (e.g., `us-baseline`), driven by `runGame` with `kernel.verifyIncrementalHash: true` and `kernel.profilerCapture: true` (or whatever the existing perf-trace surface exposes).

The harness should not be a test (it should not assert anything), so it can be invoked via `node --cpu-prof` without `node --test`'s test-runner overhead. Place it under `packages/engine/test/perf/agents/` next to existing perf tests, or under a sibling `packages/engine/scripts/` script.

### 2. Profile the scoped repro

Run with `node --cpu-prof --cpu-prof-dir=...` and inspect via Chrome DevTools' perf panel or a self-time aggregator. Identify the top hot functions in:

- `packages/engine/src/agents/policy-preview.ts` — especially `driveSyntheticCompletion`, `pickInnerDecision`, `getPreviewOutcome`.
- `packages/engine/src/kernel/microturn/drive.ts` — especially `applyPreviewDriveGreedyChooseOne`, `applyPublishedDecisionInternalNoFinalHash`, `publishMicroturnGreedyChooseOne`.
- `packages/engine/src/agents/policy-eval.ts` — `pickTopKByMoveOnlyScore`, `evaluatePolicyMoveCore`, `evaluateConsideration`.
- `packages/engine/src/kernel/zobrist.ts` — `computeFullHash`, `digestDecisionStackFrame`, `canonicalizeHashValue`, `fnv1a64`.
- `packages/engine/src/kernel/apply-move.ts` — `reconcileRunningHash` and the `shouldVerifyHash` exit branch.

Compare against an `origin/main` baseline of the same scoped harness (use a worktree at the merge-base SHA `1e64d085`).

### 3. Classify the regression

Output of the profile should let us classify into one of:

a. **Per-iteration cost regression** — drive's inner loop is doing too much work per microturn (e.g., redundant hash work, redundant seat-resolution, redundant continuation classification).
b. **Iteration-count regression** — drives are running deeper than necessary on FITL because exit conditions in `driveSyntheticCompletion` / `applyPreviewDriveGreedyChooseOne` rarely trigger early on FITL's card-driven turn flow.
c. **Per-candidate amplification** — `pickTopKByMoveOnlyScore` is admitting more candidates to drive than expected, or the move-only score path itself is expensive.
d. **`verifyIncrementalHash` interaction** — `digestDecisionStackFrame` (now uncached after `0e3f9bab`) becomes the dominant cost only when `verifyIncrementalHash` is on, and the deep decision stacks produced by drives amplify it.
e. **Some combination of the above.**

### 4. Propose a concrete fix in a follow-up ticket

Based on classification, the fix may be (this list is illustrative, the investigation picks one or two):

- Tighten the `driveSyntheticCompletion` exit condition for chooseN / chooseOne sequences that cannot meaningfully change the preview state. (a)
- Lower the default `K_PREVIEW_DEPTH` from 8 to a smaller value, possibly with a profile override for cases that need the full depth. (b)
- Hoist `digestDecisionStackFrame` cost out of the per-iteration drive loop, e.g., by deriving the relevant zobrist contributions from `_runningHash` updates instead of recomputing `canonicalizeHashValue` per frame. (d)
- Reuse drive results across structurally-equal candidates within the same evaluation pass. (c)

Each candidate fix lands as its own ticket with its own determinism-replay verification.

## Files to Touch

This ticket itself:

- `tickets/POLPREVDRIVE-001.md` (new — this file)

Investigation may add (under follow-up tickets):

- `packages/engine/test/perf/agents/<scoped-fitl-preview-drive>.perf.test.ts` (new) or `packages/engine/scripts/profile-fitl-preview-drive.mjs` (new) — the scoped repro harness.
- `packages/engine/src/agents/policy-preview.ts` (modify) — possible exit-condition tightening or default tuning.
- `packages/engine/src/kernel/microturn/drive.ts` (modify) — possible per-iteration cost reductions.
- `packages/engine/src/kernel/zobrist.ts` (modify) — possible cost-shifting of `digestDecisionStackFrame` out of the verify path.

## Out of Scope

- Reverting commit `7b0bcdfe` or any of the `145PREVCOMP-*` / `146DRIVE-*` / `147AOTCON-*` ticket series.
- Reinstating the `decisionStackFrameDigestCache` WeakMap reverted in `0e3f9bab` (already tried and rolled back).
- Restoring the FITL parity describe to `zobrist-incremental-parity.test.ts`. The shard split in `a2e59e80` stays.
- Any change to `runGame` itself or the `verifyIncrementalHash` contract — both are correct as written.
- Cross-game perf changes for Texas Hold'em — Texas does not exhibit this regression and is out of scope.

## Acceptance Criteria

### Tests That Must Pass

1. The scoped-repro harness completes locally in under 60 s on the dev machine without hanging WSL2 and produces a usable `.cpuprofile` artifact.
2. The investigation produces a written analysis (in this ticket file or a referenced `reports/` doc) classifying the regression per Section 3 above and naming concrete files / functions / line numbers responsible for ≥ 60 % of self-time on the FITL drive path.
3. `zobrist-incremental-parity-fitl.test.ts` continues to pass on CI in the new `fitl-parity-zobrist` shard within the 30-min budget. (Already a CI gate; confirm no regression.)
4. `pnpm turbo lint typecheck` pass.
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules` and `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` pass — these exercise the same policy-preview drive path under non-determinism-test workloads.

### Invariants

1. **F8 — determinism is sacred.** Any profiling instrumentation must not alter kernel behavior. Replay-identity (`spec-140-replay-identity.test.js`, `zobrist-incremental-parity-fitl.test.ts`) must stay green throughout and after the investigation.
2. **F10 — bounded computation.** The drive remains bounded (`completionDepthCap` ≤ 8 by default; any tuning must keep an explicit upper bound).
3. **F11 — immutability.** No new in-place state mutation outside scoped internal-mutation regions.
4. **No game-specific branching.** Every parameter that varies between games stays in `CompiledAgentProfile.preview.*`, never in engine code.

## Test Plan

### New/Modified Tests

1. (Investigation phase) Scoped local-repro harness — profiling tool, not an assertion test. Excluded from default lanes. Used to gather evidence; not a unit/integration test.
2. (Implementation phase, in follow-up ticket(s)) — perf regression tests under `packages/engine/test/perf/agents/` that gate the chosen fix; must reproduce the FITL parity workload at a scale where the perf delta is measurable in under 30 s but representative.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --cpu-prof --cpu-prof-dir=/tmp/cpu-profile <scoped-repro>` (investigation)
3. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
4. `pnpm turbo lint typecheck`
5. `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl.test.js` (CI parity for the shard, may exceed local WSL2 budget — defer to CI)

## Investigation Findings (2026-04-27)

Full report: [`reports/polprevdrive-001-investigation.md`](../reports/polprevdrive-001-investigation.md).

**Repro:** `packages/engine/scripts/profile-fitl-preview-drive.mjs` (seed 42, maxTurns 10, 4 baseline profiles, `verifyIncrementalHash: true`). Runs in ~35 s on PR (~3 s on `main`); both produce `.cpuprofile` artifacts under WSL2 budget. Acceptance criterion 1 satisfied.

**Wall-clock delta:** 11.4× total slowdown (3 069 ms → 34 917 ms), decomposed into:
- 6.1× game-length amplification (79 → 479 microturn decisions to terminal at the same seed) caused by post-microturn preview information changing agent move selection. Design-intentional (spec 146 motivation) but not free.
- 1.88× per-decision cost regression.

**Call-tree dominance:** `driveSyntheticCompletion` accounts for **51.26%** of total sampled time on PR vs **0%** on `main` (function did not exist). The greedy-chooseOne fast path `applyPreviewDriveGreedyChooseOne` is only 1.86% of total — most drive work goes through the `publishMicroturnFromCanonicalState` + `applyPublishedDecisionFromCanonicalState` fallback at `policy-preview.ts:777-782`. `pickTopKByMoveOnlyScore` is free (0.01%); cost amplification from top-K=4 lives in the four downstream `driveSyntheticCompletion` calls.

**Hot functions inside the drive subtree (≥60% of drive self-time, 12 functions):**

| % drive | Function | Source |
|---------|----------|--------|
| 27.00%  | `fnv1a64` | `packages/engine/src/kernel/zobrist.ts:12` |
| 6.83%   | `resolveRef` | `packages/engine/src/kernel/resolve-ref.ts:89` |
| 5.22%   | `evalCondition` | `packages/engine/src/kernel/eval-condition.ts:21` |
| 4.95%   | `buildTokenStateIndex` | `packages/engine/src/kernel/token-state-index.ts:2` |
| 3.87%   | `canonicalizeHashValue` | `packages/engine/src/kernel/zobrist.ts:149` |
| 3.62%   | `evaluateVia` | `packages/engine/src/kernel/spatial.ts:166` |
| 3.09%   | `evalValue` | `packages/engine/src/kernel/eval-value.ts:211` |
| 2.47%   | (arrow) | `packages/engine/src/kernel/eval-query.ts:337` |
| 2.30%   | `zobristKey` | `packages/engine/src/kernel/zobrist.ts:248` |
| 1.76%   | (arrow inside `canonicalizeHashValue`) | `packages/engine/src/kernel/zobrist.ts:151` |
| 1.69%   | `queryConnectedZones` | `packages/engine/src/kernel/spatial.ts:190` |
| 1.61%   | `digestDecisionStackFrame` | `packages/engine/src/kernel/zobrist.ts:175` |
| **64.41%** | **subtotal** | |

**Classification:** primary (a) per-iteration cost regression + secondary (b) iteration-count regression + secondary (c) per-candidate amplification. Hypothesis (d) `verifyIncrementalHash` interaction is **rejected** — `computeFullHash` (25.31% total) and `digestDecisionStackFrame` (1.61% of drive) scale ~9× linearly with decision count, not super-linearly with drive depth.

**Recommended follow-up tickets** (illustrative; each lands separately with its own determinism-replay verification):

1. Cache `buildTokenStateIndex` across drive iterations within a single `driveSyntheticCompletion` — the 21.5× amplification (vs main) is the largest non-zobrist gap; class (a).
2. Lower default `K_PREVIEW_DEPTH` from 8 to 4 with explicit profile override — class (b); profile depth distribution first.
3. Memoise `resolveRef` results inside a single drive — class (a); the 7.7× amplification implies repeated identifier resolution.
4. Reuse drive results across structurally-equal candidates within the same evaluation pass — class (c).

Acceptance criterion 2 (written analysis classifying the regression and naming files/functions/line numbers responsible for ≥60% of drive self-time) satisfied.

## Outcome

**Completed:** 2026-04-27

**What changed:**
- Added `packages/engine/scripts/profile-fitl-preview-drive.mjs` — scoped local-repro profiling harness for the FITL preview-drive perf regression. Not a test (no assertions); excluded from default test lanes. Runs in ~35 s on PR / ~3 s on `main` worktree under WSL2 budget; produces a usable `.cpuprofile` artifact under `node --cpu-prof`.
- Added `reports/polprevdrive-001-investigation.md` — full investigation report with PR-vs-`main` wall-clock comparison, call-tree attribution, hot-function breakdown, regression classification, and four recommended follow-up tickets.
- Appended `## Investigation Findings (2026-04-27)` to this ticket file with the condensed findings.

**No engine source modified.** This was an investigation-first ticket per its own §4 ("This ticket is investigation-first. Implementation work is gated on findings and may produce a follow-up ticket per concrete fix."). Concrete fixes land as their own follow-up tickets.

**Key findings:**
- 11.4× total slowdown on the scoped repro vs `1e64d085` merge-base (3 069 ms → 34 917 ms), decomposed into 6.1× game-length amplification × 1.88× per-decision cost regression.
- `driveSyntheticCompletion` (`packages/engine/src/agents/policy-preview.ts:690`) accounts for 51.26% of total sampled time on PR vs 0% on `main` (function did not exist there).
- Inside the drive subtree, 12 named functions account for 64.41% of drive self-time, satisfying the ≥60% acceptance threshold. Top contributors: `fnv1a64` (27.00%), `resolveRef` (6.83%), `evalCondition` (5.22%), `buildTokenStateIndex` (4.95%).
- `applyPreviewDriveGreedyChooseOne` (the chooseOne fast path) is only 1.86% of total — most drive work flows through the `publishMicroturnFromCanonicalState` + `applyPublishedDecisionFromCanonicalState` fallback at `policy-preview.ts:777-782`. Tightening the chooseOne fast path will not move the needle.
- `pickTopKByMoveOnlyScore` is essentially free (0.01%); cost amplification from top-K=4 lives in the four downstream `driveSyntheticCompletion` calls per outer move.
- Hypothesis (d) from the original ticket — that `verifyIncrementalHash` × deep decision stacks make `digestDecisionStackFrame` dominant — was **rejected**: `computeFullHash` (25.31% total) and `digestDecisionStackFrame` (1.61% of drive) scale ~9× linearly with decision count, not super-linearly with drive depth.

**Classification:** primary (a) per-iteration cost regression + secondary (b) iteration-count regression + secondary (c) per-candidate amplification. (d) rejected. (e) confirmed in (a) + (b) + (c) form.

**Deviations from original plan:**
- The ticket suggested a single-profile harness shape (1 seed × 50 turns × 1 profile). The harness as authored supports both that shape (default) and `--profilesAll` (4 baseline profiles), and was actually run in the 4-profile mode at `--maxTurns 10` because the FITL parity workload only manifests the regression with all four named profiles concurrent. The reduced turn count (10 vs 50) keeps total time well under the 60 s WSL2 budget.
- The investigation produced the analysis in `reports/polprevdrive-001-investigation.md` rather than only inline in this ticket — both surfaces are populated, with the ticket carrying the condensed findings and the report carrying the full attribution tables and replication script.

**Verification:**
- `pnpm turbo lint typecheck` — 5/5 tasks passed.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — 79/79 files passed.
- `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` — 38/38 files passed.
- `zobrist-incremental-parity-fitl.test.ts` is untouched and remains shielded by the `a2e59e80` shard split (`fitl-parity-zobrist` matrix entry in `.github/workflows/engine-determinism.yml:54`); no behavioural change to the test or its lane.
- Harness lives in `packages/engine/scripts/` and is excluded from `node --test` lanes by virtue of its `.mjs` extension and location outside `dist/test/`.

**Residual risk:**
- Acceptance criterion 3 (the determinism shard continues to pass on CI within 30-min budget) is left to CI to verify on the next push, since running the full FITL parity shard locally exceeds WSL2 budget. The split itself is unchanged from `a2e59e80`, so no new risk introduced by this ticket.
