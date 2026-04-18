# Spec 136: Policy-Profile Quality Corpus Separated From Determinism Corpus

**Status**: DRAFT
**Priority**: P2
**Complexity**: S
**Dependencies**: none (informed by Spec 133)
**Source**: Post-ticket analysis from the Spec 17 §4 completion session (2026-04-17/18). The `fitl-policy-agent-canary` test served two architecturally distinct roles simultaneously — determinism proof (FOUNDATIONS #8) and convergence witness (specific seeds reach `terminal` within 300 moves) — and failures in the convergence half were indistinguishable from failures in the determinism half without reading assertion-by-assertion.

## Overview

Split the current FITL PolicyAgent canary suite into two independent corpora:

1. **Determinism corpus** — proves FOUNDATIONS #8 (same inputs → identical trace) and FOUNDATIONS #10 (games are bounded). Every seed here passes iff the engine is deterministic and bounded. Failures block CI.
2. **Policy-profile quality corpus** — tracks whether a given policy profile (e.g., `us-baseline`, `arvn-evolved`) converges to `terminal` within a target move budget on a tracked seed set. Regressions are quality signals for the policy-profile maintainer, not engine bugs. Failures surface as a non-blocking report.

The two corpora have different update protocols, different failure semantics, and different owners.

## Problem Statement

`packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` currently asserts, per seed:

1. "`trace.stopReason === 'terminal'`" — a convergence property of the specific `(kernel-version, profile, seed)` triple.
2. "replay produces identical outcome" — an architectural determinism property.

These are both valid assertions, but they guard different things. When (1) fails, the engineer has no way to know — without line-by-line inspection — whether the failure means the engine has violated determinism (a real bug), the policy-agent heuristics have regressed (a quality concern), or the kernel has legitimately evolved such that the specific seed converges differently (neither, but still needs triage).

During the Spec 17 session this directly caused friction: seed 2046 failed (1) under the new kernel while (2) continued to pass. The correct response was "soften (1) to bounded-execution" because determinism was preserved. But the test as authored made that correspondence invisible until diagnosed manually.

Relatedly, FITL policy-profile evolution campaigns (`campaigns/fitl-arvn-agent-evolution`, etc.) produce profile regressions all the time. These go undetected except when someone runs the campaign harness manually. A formal quality corpus would catch them in CI without blocking kernel work.

## Goals

- `determinism/` tests prove only determinism + boundedness invariants. Failures always mean an engine bug.
- A new `policy-profile-quality/` corpus tracks profile convergence on named seed sets. Failures are quality signals, surfaced as non-blocking CI annotations.
- Clear ownership: engine team owns determinism; agent/policy team owns profile quality.
- Existing FITL policy-profile seed regression witnesses (e.g., `fitl-seed-1000-regression.test.ts`, `fitl-seed-1002-regression.test.ts`) are reclassified where appropriate.

## Non-Goals

- No runner or visual-layer policy evaluation — engine-scope only.
- No new statistical harness (sample-size-based win-rate claims) — that is a campaign-runner concern. This spec is about CI-visible regression witnesses.
- No removal of any existing determinism assertion.

## Definitions

### Determinism invariant

A property of `(def, state, seed, actions)` that holds independently of which policy profile drives the agent. Example: "replay produces identical stateHash." Owned by the engine.

### Profile quality witness

A property of `(def, profile_id, seed)` that holds for the current version of the profile. Example: "profile `us-baseline` on seed 2046 reaches `terminal` within 300 moves." Owned by the profile maintainer. A failure here means "the profile no longer wins this seed under the current kernel" — informational, not a CI block.

### Blocking / non-blocking

Blocking = CI red = branch cannot land. Non-blocking = CI annotates the PR with a quality delta (e.g., "profile `us-baseline` convergence rate on canary seeds: 4/5 → 3/5") but the check passes.

## Contract

### 1. Corpus separation

- `packages/engine/test/determinism/` contains tests classified per Spec 133 as `architectural-invariant`. They assert determinism and bounded execution only.
- `packages/engine/test/policy-profile-quality/` (new directory) contains tests classified per Spec 133 as `convergence-witness` with a `@profile <profile-id>` marker. They assert convergence properties on named seed sets.

### 2. Failure semantics

- A test under `determinism/` that fails blocks CI.
- A test under `policy-profile-quality/` that fails emits a `POLICY_PROFILE_QUALITY_REGRESSION` annotation but does not block CI. The annotation names the profile, the seed, and the trajectory delta.

### 3. Seed sets are first-class

Each policy-profile-quality test references a named seed set (e.g., `FITL_1964_CANARY_SEEDS = [1020, 1040, 1049, 1054, 2046]`). The seed set is versioned with the profile, not with the kernel.

### 4. Re-blessing protocol

When a kernel change legitimately shifts profile convergence (e.g., Spec 17 §4's admissibility tightening legitimately prunes moves the profile used to rely on):

- A determinism-corpus failure is a bug — fix the kernel.
- A policy-profile-quality regression is acknowledged: either (a) the profile maintainer updates the profile to regain convergence on the seed set, or (b) the seed set is updated with a new terminal witness, or (c) the regression is accepted and annotated for campaign re-evaluation.

### 5. No convergence assertion in determinism corpus

`determinism/` tests MUST NOT assert `stopReason === 'terminal'` for specific seeds. Allowed stop-reason assertions are limited to set membership in `{ terminal, maxTurns, noLegalMoves }` (boundedness) and, separately, replay-identity across repeated runs (determinism). This is a lint rule, not a convention.

## Required Invariants

1. No file under `packages/engine/test/determinism/` asserts `trace.stopReason === 'terminal'` or equivalent single-outcome pins. Boundedness is a set-membership assertion.
2. Every file under `packages/engine/test/policy-profile-quality/` declares a `@profile` marker and a named seed set.
3. The combined passing-count of the two corpora on `main` is at least equal to the passing-count of the current `fitl-policy-agent-canary` suite — no coverage loss during migration.

## Foundations Alignment

- **#8 Determinism Is Sacred**: now has a dedicated corpus that asserts *only* that. Determinism failures are unambiguous.
- **#10 Bounded Computation**: the bounded-execution half of the old canary is preserved in the determinism corpus as set-membership.
- **#15 Architectural Completeness**: the "dual-duty" test anti-pattern is resolved by separation, not by annotation.
- **#16 Testing as Proof**: each test's specific proof obligation is single-purpose and named.

## Required Proof

### Determinism corpus (after migration)

1. `fitl-policy-agent-canary-determinism.test.ts` — per seed:
   - `trace.stopReason ∈ { terminal, maxTurns, noLegalMoves }`.
   - `trace.moves.length <= MAX_TURNS`.
   - replay across two independent runs produces identical `stateHash`.
2. No profile-specific or convergence-specific assertion.

### Policy-profile quality corpus (after migration)

1. `fitl-us-baseline-convergence.test.ts` — per seed in `FITL_1964_CANARY_SEEDS`, report whether `us-baseline` reaches `terminal` within 300 moves. Non-blocking. Emits `POLICY_PROFILE_QUALITY_REGRESSION` annotations.
2. Similar files per tracked profile (`arvn-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`).

### CI integration

`pnpm turbo test` runs both corpora. The test runner tags policy-profile-quality failures as non-blocking in the CI report. A separate blocking-gate job runs only `determinism/`.

## Implementation Direction

### Migration

- Split `fitl-policy-agent-canary.test.ts` into determinism (stays in `determinism/`) and profile-quality (moves to `policy-profile-quality/fitl-profiles-convergence.test.ts`).
- The Spec 17 §4 softening of 2026-04-18 (accept `terminal | maxTurns | noLegalMoves`) is already aligned with the determinism half; no further change required there.
- Identify existing convergence-pinned tests and reclassify:
  - `fitl-seed-1000-regression.test.ts`, `fitl-seed-1002-regression.test.ts`, `fitl-seed-1005-1010-1013-regression.test.ts`, `fitl-seed-2057-regression.test.ts` → candidates for `policy-profile-quality/`, depending on whether their assertions are profile-specific.

### Tooling

- Extend the Spec 133 marker infrastructure with `@profile <id>` for the new corpus.
- Add a CI annotation job that reads policy-profile-quality results and posts a PR comment summarizing profile deltas.

### Ownership

- `docs/FOUNDATIONS.md` gets a note distinguishing engine-level determinism proofs from profile-level quality witnesses.
- `campaigns/` README notes where policy-profile regressions are tracked.

## Out of Scope

- Statistical confidence intervals on convergence rates — campaign-runner scope.
- Runner-visible profile evaluation — runner scope.
- Cross-game profile corpora — Texas Hold'em and FITL have separate profile sets; each game's profiles live under `policy-profile-quality/<game-id>/`.

## Outcome

TBD.
