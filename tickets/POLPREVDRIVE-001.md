# POLPREVDRIVE-001: Investigate policy-preview drive perf regression vs main on FITL determinism parity

**Status**: PENDING
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
