# Spec 136: Policy-Profile Quality Corpus Separated From Determinism Corpus

**Status**: DRAFT
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 133 [regression-test-classification-discipline] (archived), Spec 137 [convergence-witness-invariant-promotion] (archived, scope-narrowing)
**Source**: Post-ticket analysis from the Spec 17 §4 completion session (2026-04-17/18). `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` served two architecturally distinct roles simultaneously — determinism proof (FOUNDATIONS #8) and convergence witness (specific seeds reach `terminal` within 300 moves) — and failures in the convergence half were indistinguishable from failures in the determinism half without reading assertion-by-assertion. The per-seed stop-reason pin was removed in commit `820072e3` (2026-04-18, "Align canary + Gulf of Tonkin tests to architectural invariants, not RNG pins"), triggered by Spec 17 §4's admissibility tightening shifting seed 2046's trajectory. That commit resolved the immediate pin; this spec formalizes the structural separation so future profile-specific witnesses have a defined destination and the dual-duty anti-pattern cannot recur.

## Overview

Split the current FITL PolicyAgent canary regime into two independent corpora:

1. **Determinism corpus** — proves FOUNDATIONS #8 (same inputs → identical trace) and FOUNDATIONS #10 (games are bounded). Every seed here passes iff the engine is deterministic and bounded. Failures block CI.
2. **Policy-profile quality corpus** — tracks whether a given policy-profile variant (e.g., the all-baselines quartet, the `arvn-evolved` variant) converges to `terminal` within a target move budget on a tracked seed set. Regressions are quality signals for the profile maintainer, not engine bugs. Failures surface as a non-blocking report.

The two corpora have different update protocols, different failure semantics, and different owners.

## Problem Statement

Prior to commit `820072e3` (2026-04-18), `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` asserted, per seed:

1. `trace.stopReason === 'terminal'` — a convergence property of the specific `(kernel-version, profile, seed)` triple.
2. "replay produces identical outcome" — an architectural determinism property.

Both were valid assertions, but they guarded different things. When (1) failed, the engineer had no way to know — without line-by-line inspection — whether the failure meant the engine had violated determinism (a real bug), the policy-agent heuristics had regressed (a quality concern), or the kernel had legitimately evolved such that the specific seed converged differently (neither, but still needed triage).

During the Spec 17 session this directly caused friction: seed 2046 failed (1) under the new kernel while (2) continued to pass. The correct response was "soften (1) to bounded-execution" because determinism was preserved. Commit `820072e3` did exactly that, replacing the `=== 'terminal'` pin with set-membership against `{terminal, maxTurns, noLegalMoves}` and keeping replay identity as a separate subtest. The per-seed pin is gone; the determinism half of the canary is now single-purpose.

What the commit did not do is formalize *where* profile-specific convergence witnesses should live going forward. FITL policy-profile evolution campaigns (`campaigns/fitl-arvn-agent-evolution`, etc.) produce profile regressions routinely, and they go undetected except when someone runs the campaign harness manually. Without a formal quality corpus, the next profile-specific convergence claim is at risk of being authored back into `determinism/` and reintroducing the dual-duty anti-pattern. This spec defines the destination and the failure semantics so that cannot happen.

## Goals

- `determinism/` tests prove only determinism + boundedness invariants. Failures always mean an engine bug.
- A new `policy-profile-quality/` corpus tracks profile-variant convergence on named seed sets. Failures are quality signals, surfaced as non-blocking CI annotations.
- Clear ownership: engine team owns determinism; agent/policy team owns profile quality.
- The canary test itself is the only genuinely dual-duty artifact in scope. Existing FITL property-form witnesses (`fitl-seed-1000-regression.test.ts`, `fitl-seed-2057-regression.test.ts`, `fitl-seed-stability.test.ts`, `fitl-seed-1000-draw-space.test.ts`) remain in `integration/` as `convergence-witness` per Spec 137's framing — their assertions are property-form (bounded stop-reason, replay identity, population-0 neutrality) and are candidates for a future Spec-137-style distillation pass, not relocation here.

## Non-Goals

- No runner or visual-layer policy evaluation — engine-scope only.
- No new statistical harness (sample-size-based win-rate claims) — that is a campaign-runner concern. This spec is about CI-visible regression witnesses.
- No removal of any existing determinism assertion.
- No distillation of property-form convergence-witnesses into architectural-invariants. That work (the Spec 137 pattern) is out of scope for this spec.

## Definitions

### Determinism invariant

A property of `(def, state, seed, actions)` that holds independently of which policy profile drives the agent. Example: "replay produces identical stateHash." Owned by the engine.

### Profile quality witness

A property of `(def, profile_variant_id, seed)` that holds for the current version of the variant. Example: "variant `arvn-evolved` on seed 2046 reaches `terminal` within 300 moves." Owned by the profile maintainer. A failure here means "the variant no longer wins this seed under the current kernel" — informational, not a CI block.

### Profile variant

A four-seat quartet of `PolicyAgent` profiles covering the US / ARVN / NVA / VC seats. The canonical "all-baselines" variant is `[us-baseline, arvn-baseline, nva-baseline, vc-baseline]`. Non-baseline variants deviate in exactly one seat, named after the deviating profile (e.g., the `arvn-evolved` variant is `[us-baseline, arvn-evolved, nva-baseline, vc-baseline]`). This shape mirrors `POLICY_PROFILE_VARIANTS` in `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts`.

### Blocking / non-blocking

Blocking = CI red = branch cannot land. Non-blocking = CI annotates the PR with a quality delta (e.g., "variant `arvn-evolved` convergence rate on canary seeds: 4/5 → 3/5") but the check passes.

## Contract

### 1. Corpus separation

- `packages/engine/test/determinism/` contains tests classified per Spec 133 as `architectural-invariant`. They assert determinism and bounded execution only.
- `packages/engine/test/policy-profile-quality/` (new directory) contains tests classified per Spec 133 as `convergence-witness` with a `@profile-variant <variant-id>` marker. They assert convergence properties on named seed sets.

### 2. Failure semantics

- A test under `determinism/` that fails blocks CI.
- A test under `policy-profile-quality/` that fails emits a `POLICY_PROFILE_QUALITY_REGRESSION` annotation but does not block CI. The annotation names the variant, the seed, and the trajectory delta.

### 3. Seed sets are first-class

Each policy-profile-quality test references a named seed set (e.g., `FITL_1964_CANARY_SEEDS = [1020, 1040, 1049, 1054, 2046]`). The seed set is versioned with the variant, not with the kernel.

### 4. Re-blessing protocol

When a kernel change legitimately shifts variant convergence (e.g., Spec 17 §4's admissibility tightening legitimately prunes moves a variant used to rely on):

- A determinism-corpus failure is a bug — fix the kernel.
- A policy-profile-quality regression is acknowledged: either (a) the variant maintainer updates the underlying profile(s) to regain convergence on the seed set, or (b) the seed set is updated with a new terminal witness, or (c) the regression is accepted and annotated for campaign re-evaluation.

### 5. No convergence assertion in determinism corpus

`determinism/` tests MUST NOT assert `stopReason === 'terminal'` for specific seeds. Allowed stop-reason assertions are limited to set membership in `{ terminal, maxTurns, noLegalMoves }` (boundedness) and, separately, replay-identity across repeated runs (determinism). This is a lint rule, not a convention.

## Required Invariants

1. No file under `packages/engine/test/determinism/` asserts `trace.stopReason === 'terminal'` or equivalent single-outcome pins. Boundedness is a set-membership assertion.
2. Every file under `packages/engine/test/policy-profile-quality/` declares a `@profile-variant` marker and a named seed set.
3. The combined passing-count of the two corpora on `main` is at least equal to the passing-count of the canary suite post-commit `820072e3` — no coverage loss during migration.

## Foundations Alignment

- **#8 Determinism Is Sacred**: dedicated corpus asserts *only* that. Determinism failures are unambiguous.
- **#10 Bounded Computation**: the bounded-execution half of the old canary is preserved in the determinism corpus as set-membership.
- **#14 No Backwards Compatibility**: when an evolved profile is promoted to its baseline counterpart, the corresponding policy-profile-quality variant file is renamed in the same change. No alias files, no `-evolved` leftovers after promotion.
- **#15 Architectural Completeness**: the "dual-duty" test anti-pattern is resolved by corpus separation, not by annotation.
- **#16 Testing as Proof**: each test's specific proof obligation is single-purpose and named.

## Required Proof

### Determinism corpus

Already implemented post-commit `820072e3`. The existing `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts` asserts exactly the shape this spec prescribes:

1. Per seed, `trace.stopReason ∈ { terminal, maxTurns, noLegalMoves }`.
2. Per seed, `trace.moves.length <= MAX_TURNS`.
3. Per seed, replay across two independent runs produces identical `stateHash`.
4. No profile-specific or convergence-specific assertion.

The determinism half is now carried by `fitl-policy-agent-canary-determinism.test.ts` for disambiguation against the new policy-profile-quality files. The file's content requires no assertion changes.

### Policy-profile quality corpus (net-new)

One file per profile variant, each iterating the variant's named seed set and emitting non-blocking annotations. Files per the current FITL profile set:

1. `fitl-variant-all-baselines-convergence.test.ts` — quartet `[us-baseline, arvn-baseline, nva-baseline, vc-baseline]` — per seed in the variant's seed set, report whether the quartet reaches `terminal` within 300 moves.
2. `fitl-variant-arvn-evolved-convergence.test.ts` — quartet `[us-baseline, arvn-evolved, nva-baseline, vc-baseline]` — same shape, tracking the sole current evolved profile.

Failure attribution: each non-all-baselines variant differs from the all-baselines variant in exactly one seat, so a convergence regression in `variant-arvn-evolved` that does not also appear in `variant-all-baselines` is attributable to the `arvn-evolved` profile. The comparison is mechanical, not statistical.

### CI integration

`pnpm turbo test` runs both corpora. The test runner tags policy-profile-quality failures as non-blocking in the CI report. A separate blocking-gate job runs only `determinism/` (extending the existing `engine-determinism.yml` lane).

## Implementation Direction

### Migration

Post-commit `820072e3`, no split of the existing canary is required — its determinism half is already single-purpose. The migration reduces to:

- Rename `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` to `fitl-policy-agent-canary-determinism.test.ts` to disambiguate against the new policy-profile-quality files. No assertion changes.
- Author net-new `policy-profile-quality/` variant files from scratch per the Required Proof list above.
- Leave surviving `integration/` convergence-witnesses (`fitl-seed-1000-regression.test.ts`, `fitl-seed-2057-regression.test.ts`, `fitl-seed-stability.test.ts`, `fitl-seed-1000-draw-space.test.ts`) in place. Their assertions are property-form (bounded stop-reason, replay identity, population-0 neutrality) and match Spec 137's architectural-invariant distillation pattern rather than Spec 136's profile-specific convergence pattern. They are candidates for a future Spec-137-style distillation round, not for relocation here.
- The two originally-cited regression files `fitl-seed-1002-regression.test.ts` and `fitl-seed-1005-1010-1013-regression.test.ts` were already consolidated by Spec 137 into `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` (architectural-invariant); no further action is needed for them.

### Profile lifecycle

FITL's current profile set is `{us-baseline, arvn-baseline, arvn-evolved, nva-baseline, vc-baseline}` (defined in `data/games/fire-in-the-lake/92-agents.md`). The `-evolved` suffix marks profiles that are mid-evolution campaign and expected to be temporary: once an evolved profile converges to a "competent" state under its campaign harness, it replaces its baseline counterpart and the evolved profile itself is retired.

Under this spec, that lifecycle event is a rename, not a shim:

- When `arvn-evolved` replaces `arvn-baseline`, `fitl-variant-arvn-evolved-convergence.test.ts` is renamed in the same change. Its content (now representing the new baseline quartet) merges into / supersedes `fitl-variant-all-baselines-convergence.test.ts` (per FOUNDATIONS #14 — no alias files).
- The named seed set carries forward with the rename; re-blessing is a separate decision per §4.

This keeps the number of variant files equal to `(baselines) + (active evolved profiles) - 1` (the all-baselines variant counts once regardless of how many baselines exist).

### Tooling

- Extend the Spec 133 marker infrastructure (`packages/engine/test/unit/infrastructure/test-class-markers.test.ts`, `packages/engine/scripts/test-class-reporter.mjs`) with a `@profile-variant <variant-id>` marker. Enforcement: every file under `policy-profile-quality/` MUST declare both `@test-class: convergence-witness` and `@profile-variant <variant-id>` within the first three lines.
- Add a CI annotation job that reads policy-profile-quality results and posts a PR comment summarizing variant deltas.

### Ownership

- `docs/FOUNDATIONS.md` gets a note distinguishing engine-level determinism proofs from profile-level quality witnesses.
- `campaigns/` README notes where policy-profile regressions are tracked.

## Out of Scope

- Statistical confidence intervals on convergence rates — campaign-runner scope.
- Runner-visible profile evaluation — runner scope.
- Cross-game profile corpora — Texas Hold'em and FITL have separate profile sets; each game's profiles live under `policy-profile-quality/<game-id>/`.
- Distillation of property-form convergence-witnesses (1000, 2057, stability, draw-space) into architectural-invariants — a future Spec-137-style pass.

## Tickets

Decomposed into `136POLPROQUA-*` on 2026-04-18. Implementation order follows the dependency waves below; see each ticket for detail.

- `tickets/136POLPROQUA-001.md` — Extend marker infrastructure: `@profile-variant` marker + determinism lint rule
- `tickets/136POLPROQUA-002.md` — Author policy-profile-quality variant corpus + lane wiring
- `tickets/136POLPROQUA-003.md` — Rename canary to `fitl-policy-agent-canary-determinism.test.ts` (optional)
- `tickets/136POLPROQUA-004.md` — CI: non-blocking `policy-profile-quality` job in `engine-determinism.yml`
- `tickets/136POLPROQUA-005.md` — CI: `POLICY_PROFILE_QUALITY_REGRESSION` annotation + PR comment
- `tickets/136POLPROQUA-006.md` — Docs: FOUNDATIONS note + `campaigns/README.md`

Dependency graph: `001 → 002 → 004 → 005`; `003` and `006` are independent. Wave 1 (parallel): `001`, `003`, `006`. Wave 2: `002`. Wave 3: `004`. Wave 4: `005`.

## Outcome

TBD.
