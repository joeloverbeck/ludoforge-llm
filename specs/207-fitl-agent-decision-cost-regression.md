# Spec 207 — FITL Agent Decision / Preview Hot-Path Regression

**Status**: PROPOSED
**Priority**: High — a real agent decision/preview hot-path regression hidden for an unknown period because the `policy-profile-quality` lane ran non-blocking and only a curated 6-file subset (fixed in the same change that filed this spec). Making the lane blocking surfaced **four** failing witnesses sharing this one root cause.
**Complexity**: M–L (diagnosis-first; fix scope unknown until the accumulation source is found)
**Date**: 2026-05-29

> **Scope (broadened 2026-05-29):** the regression manifests two ways, both on the agent decision/preview hot path: (1) **within-game per-decision cost drift** (§1), and (2) **preview-cap exhaustion** — when preview is materially slower it hits its grant-flow / post-grant / free-operation budget caps, marking opponent-margin refs `unknown` instead of `ready`. Both are almost certainly the same growing structure on the decision path. All four affected witnesses (§5) are quarantined under this one spec with a single un-skip acceptance gate.

## 1. Problem

`packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` measures per-decision agent cost drift across a single FITL game (seed 1002, `maxTurns=3`, four `*-baseline` policy agents): the trimmed last-decile average decision time divided by the trimmed first-decile average, with a calibrated ceiling of **1.75×**.

It was calibrated on 2026-04-24 at **ratio ≈ 1.108×** (first-decile ≈ 13.2ms, last-decile ≈ 14.7ms). As of 2026-05-29 on branch `implemented-spec-206` it measures **ratio ≈ 19–21×** (first-decile ≈ 20ms, last-decile ≈ 400–446ms), consistently across repeated runs. The run still reaches `stopReason=terminal` (209 decisions), so this is **not** a correctness or termination failure — it is a within-game *cost accumulation*: later decisions in the same game are ~20× slower than early ones.

This is a genuine regression, not timing noise:
- The drift is a within-run ratio (last decile vs first decile of the *same* process), so machine load affects both deciles roughly equally and cannot explain a 20× ratio.
- It reproduces across runs (~19.6× then ~20.8×).
- It predates Spec 202 (it fails on the clean baseline before any Spec 202 change), though the additional `us-baseline` constructs bound by Spec 202 may amplify it.

## 2. Evidence

```
seed 1002: cost drift ratio 19.649 exceeded ceiling 1.75 |
  firstDecileAvg=20.160ms | lastDecileAvg=396.127ms |
  firstDecileSamples=18 | lastDecileSamples=21 |
  playerDecisions=206 | totalDecisions=209 | stopReason=terminal
```

## 3. Suspected area

A retained-state / monotonically-growing structure on the agent decision hot path — most likely something introduced or amplified by the proposer / preview / caching work in specs 196–206 (e.g. a cache, memo map, accumulated trace, or per-decision allocation that grows with `state.turnCount` / decision index rather than being bounded per decision). The witness was explicitly designed to catch "a retained-state regression that makes later decisions materially slower."

Diagnosis should:
1. Confirm the accumulation is in the agent decision path (`PolicyAgent.chooseDecision` → proposer/preview/policy-evaluation), not the kernel apply path.
2. Bisect across specs 196–206 (or profile the last-decile decisions) to localize the growing structure.
3. Fix so the per-decision cost is bounded (ratio back under the 1.75× ceiling), without changing decision outcomes (determinism + replay-identity must hold).

## 4. Non-Goals

- Relaxing the `1.75×` ceiling. The ceiling is the contract; it must not be softened to accommodate the regression (per `.claude/rules/testing.md`: never adapt tests to bugs).
- Re-calibrating the witness to the regressed numbers.

## 5. Current quarantine

Four `policy-profile-quality` witnesses are **skipped** (node `it(..., { skip })`) with a reference to this spec, so the lane can be made blocking for the other ~88 witnesses without masking this regression. **Un-skipping all four is the acceptance gate for this spec's fix.**

1. `fitl-spec-143-cost-stability.test.ts` — cost-drift ratio (seed 1002): ~20× vs the 1.75× ceiling.
2. `probes/probe-budget.test.ts` → probe `arvn-action-distribution-not-dominated` — exceeds the hard per-decision overhead budget (~123s).
3. `probes/probe-budget.test.ts` → probe `turn-shape-minimum-impact-observed` — exceeds the hard probe overhead budget (~100s).
4. `probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` — 0 ready opponent-preview candidates (expected ≥2): NVA/VC margin refs land `unknown` (preview-cap exhaustion) instead of `ready`.

## 6. Acceptance criteria

1. Root cause identified and documented (the growing structure + the spec that introduced it).
2. All four quarantined witnesses pass **unskipped**: `fitl-spec-143` drift ratio < 1.75×; both `probe-budget` probes within the hard overhead budget; `may-17` sees ≥2 ready opponent-preview candidates (opponent margin refs resolve `ready`, not `unknown`).
3. No behavioral change: FITL determinism lane + four-profile convergence canaries remain byte-identical; `pnpm turbo build` byte-identical.
4. Full engine `test:all` + `policy-profile-quality` lanes green with the four witnesses unskipped.

## 7. Foundation alignment

| Foundation | How |
|---|---|
| #8 | Determinism preserved — the fix must not change decision outcomes, only their cost |
| #16 | A real regression that the quality-witness lane is meant to catch; surfaced (not softened) by making the lane blocking and quarantining only this one test with a tracked reference |
