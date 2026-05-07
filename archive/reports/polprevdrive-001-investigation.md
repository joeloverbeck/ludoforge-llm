# POLPREVDRIVE-001 Investigation Findings

**Date:** 2026-04-27
**Branch:** `implemented-147` (commit `7677e4d8`) vs merge-base `1e64d085`
**Owner:** ticket POLPREVDRIVE-001

## TL;DR

The FITL determinism-parity slowdown on PR #231 is dominated by `driveSyntheticCompletion`,
which accounts for **51.26% of total sampled time** on the scoped repro vs **0%** on `main`
(the function did not exist there). Inside the drive subtree, **64.4% of self-time is
concentrated in 12 named functions** spanning two themes:

- **Zobrist/hashing path (36.54% of drive time)**: `fnv1a64`, `canonicalizeHashValue`,
  `zobristKey`, the anonymous arrow at `zobrist.js:151`, `digestDecisionStackFrame`.
- **Eval/query path (27.87% of drive time)**: `resolveRef`, `evalCondition`,
  `buildTokenStateIndex`, `evaluateVia`, `evalValue`, the anonymous arrow at
  `eval-query.js:337`, `queryConnectedZones`.

`verifyIncrementalHash` is **not** the dominant amplifier — `computeFullHash` and
`digestDecisionStackFrame` scale roughly linearly with decision count (~9× on PR vs
main, in line with the 6×–11× total-cost ratio), not super-linearly with drive depth.
This contradicts hypothesis (d) from the ticket.

## Repro Setup

Harness: `packages/engine/scripts/profile-fitl-preview-drive.mjs`

Configuration used for both runs:

```text
seed:                42
maxTurns:            10
playerCount:         4
profileId:           ['us-baseline','arvn-baseline','nva-baseline','vc-baseline']
verifyIncrementalHash: true
```

Run command (PR side, identical for `main` worktree at `1e64d085`):

```bash
mkdir -p /tmp/cpu-profile && \
node --cpu-prof --cpu-prof-dir=/tmp/cpu-profile \
  packages/engine/scripts/profile-fitl-preview-drive.mjs \
  --seed 42 --maxTurns 10 --profilesAll --retainDecisions --label pr-cpuprof
```

Both runs completed in well under 60 s on the dev machine without hanging WSL2 and
emitted `.cpuprofile` artifacts (~13 MB on PR, ~1.5 MB on `main`). Acceptance
criterion 1 satisfied.

## Wall-Clock Comparison

| Branch                  | elapsedMs | turnsCount | decisions | ms/decision | sampled |
|-------------------------|-----------|------------|-----------|-------------|---------|
| `main` (1e64d085)       | 3 069     | 0          | 79        | 38.85       | 4.76 s  |
| `implemented-147` (PR)  | 34 917    | 1          | 479       | 72.90       | 37.12 s |
| Ratio (PR / main)       | **11.4×** | —          | **6.1×**  | **1.88×**   | 7.8×    |

Two compounding factors produce the 11.4× total slowdown:

1. **Game-length amplification (6.1×).** Identical seed and identical agent profiles,
   yet PR runs the FITL game to terminal in 479 microturn decisions vs 79 on `main`.
   The agents make different choices because preview now reflects post-microturn
   state (the spec-146 motivation). This is design-intentional but non-trivially
   more expensive.
2. **Per-decision cost regression (1.88×).** Even normalised for decision count,
   each microturn decision is ~2× more expensive on PR.

## Call-Tree Attribution

Top-level total-time attribution (`self + descendants`):

| Function (PR)                                      | self_ms | total_ms | total_% |
|----------------------------------------------------|---------|----------|---------|
| `driveSyntheticCompletion` (policy-preview.ts:690) | 9.6     | 19 027.5 | **51.26%** |
| `evaluatePolicyMoveCore` (policy-eval.ts)          | 14.3    | 19 935.5 | 53.70%  |
| `computeFullHash` (zobrist.js:317)                 | 208.7   | 9 396.0  | 25.31%  |
| `applyPreviewDriveGreedyChooseOne` (drive.ts:656)  | 0.0     | 689.6    | 1.86%   |
| `applyPublishedDecisionInternalNoFinalHash`        | 2.1     | 113.8    | 0.31%   |
| `publishMicroturnGreedyChooseOne`                  | 1.1     | 197.8    | 0.53%   |
| `pickTopKByMoveOnlyScore` (policy-eval.ts:961)     | 0.0     | 2.0      | 0.01%   |

Key observations:

- `driveSyntheticCompletion` (the ticket's primary suspect) is **the dominant root
  of the regression**: 51% of total sampled time vs 0% on `main`.
- `applyPreviewDriveGreedyChooseOne` only accounts for **1.86%** of total time. The
  greedy chooseOne fast-path is rarely taken — most of the drive cost goes through
  the slower `publishMicroturnFromCanonicalState` + `applyPublishedDecisionFromCanonicalState`
  fallback at `policy-preview.ts:777-782`. Tightening the chooseOne fast path will
  not move the needle.
- `pickTopKByMoveOnlyScore` itself is essentially free (0.01%). The cost amplification
  from top-K=4 is downstream, in the four `driveSyntheticCompletion` calls each
  candidate triggers, not in the picker.

## Hot Functions Inside the Drive Subtree

`driveSyntheticCompletion`'s 19.03 s total breaks down as follows (top 12 self-time
contributors are sufficient to clear the ≥60% threshold from acceptance criterion 2):

| Rank | self_ms | % of drive | % of total | Function | Source |
|------|---------|------------|------------|----------|--------|
| 1    | 5 136.7 | **27.00%** | 13.84%     | `fnv1a64`              | `packages/engine/src/kernel/zobrist.ts:12` |
| 2    | 1 299.6 | 6.83%      | 3.50%      | `resolveRef`           | `packages/engine/src/kernel/resolve-ref.ts:89` |
| 3    |   992.5 | 5.22%      | 2.67%      | `evalCondition`        | `packages/engine/src/kernel/eval-condition.ts:21` |
| 4    |   941.7 | 4.95%      | 2.54%      | `buildTokenStateIndex` | `packages/engine/src/kernel/token-state-index.ts:2` |
| 5    |   736.4 | 3.87%      | 1.98%      | `canonicalizeHashValue`| `packages/engine/src/kernel/zobrist.ts:149` |
| 6    |   688.1 | 3.62%      | 1.85%      | `evaluateVia`          | `packages/engine/src/kernel/spatial.ts:166` |
| 7    |   587.5 | 3.09%      | 1.58%      | `evalValue`            | `packages/engine/src/kernel/eval-value.ts:211` |
| 8    |   469.5 | 2.47%      | 1.26%      | (arrow)                | `packages/engine/src/kernel/eval-query.ts:337` |
| 9    |   437.7 | 2.30%      | 1.18%      | `zobristKey`           | `packages/engine/src/kernel/zobrist.ts:248` |
| 10   |   334.7 | 1.76%      | 0.90%      | (arrow inside `canonicalizeHashValue`) | `packages/engine/src/kernel/zobrist.ts:151` |
| 11   |   322.2 | 1.69%      | 0.87%      | `queryConnectedZones`  | `packages/engine/src/kernel/spatial.ts:190` |
| 12   |   306.9 | 1.61%      | 0.83%      | `digestDecisionStackFrame` | `packages/engine/src/kernel/zobrist.ts:175` |
|      |         | **64.41%** |            | **subtotal** |          |

Grouping by theme:

| Theme | functions | % of drive |
|-------|-----------|------------|
| Zobrist / hashing            | `fnv1a64`, `canonicalizeHashValue`, `zobristKey`, `zobrist.ts:151`, `digestDecisionStackFrame` | **36.54%** |
| Eval / query / spatial       | `resolveRef`, `evalCondition`, `buildTokenStateIndex`, `evaluateVia`, `evalValue`, `eval-query.ts:337`, `queryConnectedZones` | **27.87%** |

These two themes together account for 64.41% of `driveSyntheticCompletion` self-time
and 33.06% of total sampled time.

## Cross-Branch Per-Function Deltas (top zobrist + eval)

Self-time absolute and relative change PR vs main:

| Function                    | main (ms) | PR (ms) | PR/main |
|-----------------------------|-----------|---------|---------|
| `fnv1a64`                   | 753.6     | 6 645.8 | 8.8×    |
| `(garbage collector)`       | 475.0     | 4 267.7 | 9.0×    |
| `resolveRef`                | 287.6     | 2 220.0 | 7.7×    |
| `buildTokenStateIndex`      |  84.2     | 1 807.6 | **21.5×** |
| `evalCondition`             | 100.4     | 1 609.3 | **16.0×** |
| `evalValue`                 |  62.2     | 1 029.7 | **16.6×** |
| `evaluateVia`               |  61.6     | 1 051.2 | **17.1×** |
| `canonicalizeHashValue`     | 113.6     |   918.7 | 8.1×    |
| `zobristKey`                |  75.0     |   638.5 | 8.5×    |
| `computeFullHash`           |  24.6     |   208.7 | 8.5×    |
| `digestDecisionStackFrame`  |  40.7     |   379.9 | 9.3×    |

Two distinct scaling patterns visible:

- **~6×–9× scaling group** — `fnv1a64`, GC, `resolveRef`, `canonicalizeHashValue`,
  `zobristKey`, `computeFullHash`, `digestDecisionStackFrame`. These scale roughly
  with decision count (6.1×) and per-decision cost (1.88×). They are *not* uniquely
  amplified by the drive — they are amplified by drive-driven game length and per-iteration
  evaluation cost.
- **~16×–21× scaling group** — `buildTokenStateIndex`, `evalCondition`, `evalValue`,
  `evaluateVia`. These are amplified far beyond decision-count alone, indicating
  the drive's per-iteration evaluation work touches them more aggressively than
  simulator-driven decisions do. The 16×–21× factor is roughly `topK × per-iteration
  consideration evaluations`.

## Regression Classification

Mapping back to Section 3 of the ticket:

| Class | Verdict |
|-------|---------|
| (a) Per-iteration cost regression | **CONFIRMED — primary.** `evalCondition`/`evalValue`/`buildTokenStateIndex`/`evaluateVia` scale 16–21×, far above the 6× decision-count ratio. Per inner microturn, the drive re-derives token state index, re-resolves refs, and re-evaluates conditions and queries against a freshly mutated state — without inter-iteration caching. |
| (b) Iteration-count regression | **CONFIRMED — secondary.** `K_PREVIEW_DEPTH = 8` (`policy-preview.ts:42`) is the per-candidate inner-microturn budget. `topK = 4` (`policy-eval.ts:554`) admits 4 candidates per outer move. Combined with FITL's card-driven flow (chooseN/chooseOne sequences inside event resolution), the drive hits its cap or a stochastic exit on most candidates, so the practical per-outer-move budget is ~`4 × 1..8 = 4..32` inner kernel calls. |
| (c) Per-candidate amplification | **CONFIRMED — secondary.** `pickTopKByMoveOnlyScore` itself is free (0.01%), but the four candidates each schedule a `driveSyntheticCompletion` whose work is largely non-shared. Structurally-equivalent candidates (e.g., the same eventCard, same side) repeat the inner drive in full. |
| (d) `verifyIncrementalHash` interaction | **REJECTED.** `computeFullHash` (25.31% total) and `digestDecisionStackFrame` (1.02% / 1.61%-of-drive) scale ~9× — linearly with total decision count. They are not uniquely amplified by drive depth, and their share of drive-subtree time (1.61% for `digestDecisionStackFrame`, 0.39% for `computeFullHash`) is small. The hypothesis from the ticket that the post-`0e3f9bab` uncached digest path becomes dominant under drive workloads is **not supported by the data**. |
| (e) Combination | **CONFIRMED.** The dominant regression is (a) + (b) + (c). (d) is real but not the lever. |

## Recommended Follow-Up Tickets

These are illustrative starting points; each should be its own ticket with its own
determinism-replay verification (FOUNDATION 8).

1. **Cache `buildTokenStateIndex` across drive iterations within a single
   `driveSyntheticCompletion`.** The 21.5× amplification is the single largest
   non-zobrist regression. The token state index keys by `state.stateHash`, which
   forces a rebuild every inner microturn because each step canonicalizes the
   state. Inside the drive, hold a draft index that incrementally updates in step
   with `applyPublishedDecisionFromCanonicalState`, finalised at canonicalisation
   time. (Class (a). Largest expected win.)
2. **Lower the default `K_PREVIEW_DEPTH` from 8 to 4 (or smaller), with explicit
   profile override.** Class (b). Most FITL drives terminate by reaching
   `actionSelection`/`outcomeGrantResolve`/`turnRetirement` inside the first 2–3
   inner steps; the upper end of the depth range is paying for tail cases.
   Profile the depth distribution before picking the new default.
3. **Memoise `resolveRef` results inside a single drive.** The 7.7× amplification
   suggests the same identifier is being resolved repeatedly per inner step. A
   per-drive `Map<refKey, resolved>` cache would amortise.
4. **Reuse drive results across structurally-equal candidates within the same
   evaluation pass.** Class (c). Several FITL event card actions resolve to the
   same post-effect state when the agent picks identical follow-on decisions —
   a dedupe by `(cardId, side, sideEffectFingerprint)` could collapse 2–3
   candidates per outer move into one drive.

A reduction of `buildTokenStateIndex` alone to ≤3× (matching its decision-count
ratio) would recover ~1.3 s on the scoped repro (~3.5% of total) and translates
linearly into the determinism-parity workload at full scale.

## Artifacts

- Harness: `packages/engine/scripts/profile-fitl-preview-drive.mjs` (committed)
- PR cpuprofile: `/tmp/cpu-profile/CPU.20260427.045214.16385.0.001.cpuprofile` (13 MB, ephemeral)
- Main cpuprofile: `/tmp/cpu-profile-main/CPU.20260427.045450.20112.0.001.cpuprofile` (1.5 MB, ephemeral)
- Worktree: `/tmp/polprev-main` at `1e64d085`

## Replicating the Investigation

```bash
# PR side (current branch)
pnpm -F @ludoforge/engine build
mkdir -p /tmp/cpu-profile
node --cpu-prof --cpu-prof-dir=/tmp/cpu-profile \
  packages/engine/scripts/profile-fitl-preview-drive.mjs \
  --seed 42 --maxTurns 10 --profilesAll --retainDecisions --label pr

# Main side
git worktree add /tmp/polprev-main 1e64d085
cd /tmp/polprev-main && pnpm install --frozen-lockfile && pnpm -F @ludoforge/engine build
cp packages/engine/scripts/profile-fitl-preview-drive.mjs \
   /tmp/polprev-main/packages/engine/scripts/
mkdir -p /tmp/cpu-profile-main
node --cpu-prof --cpu-prof-dir=/tmp/cpu-profile-main \
  /tmp/polprev-main/packages/engine/scripts/profile-fitl-preview-drive.mjs \
  --seed 42 --maxTurns 10 --profilesAll --retainDecisions --label main
```
