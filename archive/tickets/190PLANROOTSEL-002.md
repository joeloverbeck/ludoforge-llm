# 190PLANROOTSEL-002: ARVN root-override witness + profile-quality re-validation sweep

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — warning-class profile-quality test additions and witness re-runs only
**Deps**: `archive/tickets/190PLANROOTSEL-001.md`

## Problem

Spec 190 §8 P2 calls for the behavioural witness that Spec 186's acceptance tests omitted: a constructed scenario where the plan's chosen root differs from the scalar evaluator's pick, asserting the **plan's** root is returned (per §3 — "Spec 186's acceptance tests (Phase 2(e) v2-equivalence; Phase 3 distinct Train/Govern spaces) did not include a root-override witness, so the gap was not caught"). This ticket authors that witness for ARVN and re-validates the existing plan-having profile-quality corpus (ARVN Train+Govern separation + fallback witnesses; FITL four-faction plan-having witnesses authored by Spec 188) to confirm the new seam from `archive/tickets/190PLANROOTSEL-001.md` does not regress committed convergence claims. Witnesses live in `packages/engine/test/policy-profile-quality/` per FOUNDATIONS Appendix — failures emit `POLICY_PROFILE_QUALITY_REGRESSION` warnings, not blocking CI failures.

## Assumption Reassessment (2026-05-23)

1. `packages/engine/test/policy-profile-quality/` exists with 18+ files including ARVN Train+Govern separation (`arvn-train-govern-separation.test.ts`) + fallback (`arvn-train-govern-fallback.test.ts`) witnesses from Spec 186 Phase 3. Verified against current `main`.
2. ARVN witness helpers live at `packages/engine/test/policy-profile-quality/arvn-plan-witness-helpers.ts` (shared fixtures + plan-template-aware harness). Reuse rather than hand-roll.
3. Spec 188 (FITL four-faction plan migration) is archived COMPLETED 2026-05-22; per the spec, the four competence-report personalities are authored as plan structures. Existing plan-having witnesses for ARVN / VC / NVA / US patterns live in `policy-profile-quality/` with `<faction>-*.test.ts` naming.
4. Per FOUNDATIONS Appendix, `policy-profile-quality/` failures are warning-class (`POLICY_PROFILE_QUALITY_REGRESSION`, non-blocking summary), not determinism failures. This ticket's deliverable is consistent with that classification.
5. The "constructed scenario" needs ARVN state where the scalar evaluator's preferred move and the plan template's bound root diverge. Two viable approaches: (a) find a real seed/turn from the existing ARVN witness corpus where this happens naturally, (b) hand-construct a minimal state where a non-default-scalar move is the plan template's chosen root. Approach (a) is preferred (uses existing fixtures); fall back to (b) if no natural divergence surfaces.
6. During `190PLANROOTSEL-001` verification, `pnpm -F @ludoforge/engine run test:policy-profile-quality` passed every visible `arvn-*` witness, then failed in `candidate-params-fitl-witness/fitl-candidate-param-witness.test.js`, subtest `scores seed 1000 ARVN shaded event candidates through candidate.params.side`, with `expected seed 1000 baseline to reach an ARVN event frontier`. This remains in this ticket's profile-quality revalidation scope rather than blocking `001`, because this ticket already owns the full profile-quality sweep, triage, and any distillation/re-bless decisions.

## Architecture Check

1. **Foundation 16 (testing as proof)** — the root-authority property asserted by `190PLANROOTSEL-001`'s architectural-invariant is a *necessary* condition; this ticket adds the *behavioural* witness that proves the property is non-trivially exercised (the plan's root actually wins over a divergent scalar pick). Without it, `001`'s test could pass even if no profile ever actually disagreed with scalar in the witness corpus.
2. **FOUNDATIONS Appendix (warning-class)** — placed in `policy-profile-quality/`, the witness emits `POLICY_PROFILE_QUALITY_REGRESSION` warnings rather than blocking CI on profile-tuning shifts. This matches the spec's framing that Phase 2 requires "profile-quality re-validation" not a determinism gate.
3. **No engine code changes** — the witness exercises the production agent path through the existing `policy-profile-quality/` harness; no game-specific identifiers added to engine code (Foundation 1).
4. **No profile rewrites** — uses ARVN's authored plan templates and demoted leaf scorers as-is (Spec 190 Non-Goal #1). The witness validates the seam relocation, not new authoring.

## What to Change

### 1. Author the ARVN root-override witness

New test file: `packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts`. Test class header: `// @test-class: convergence-witness` with `// @witness: spec-190-arvn-root-override`.

The witness constructs (or selects) an ARVN state at an `actionSelection` microturn where:

- The scalar `evaluatePolicyMove` path would return move X.
- A plan template's matched root binds move Y (Y ≠ X, both ∈ frontier).

Assertions:

1. `PolicyAgent.chooseActionSelectionDecision` returns Y (the plan's root), not X.
2. The returned `agentDecision` trace carries the plan provenance (`agentDecision.plan.selectedRootStableMoveKey === toMoveIdentityKey(def, Y)`).
3. Negative control: run the same state through a plan-less ARVN profile variant (or stub the plan templates) — the agent returns X (scalar pick), proving the divergence exists and is observable.

Reuse `arvn-plan-witness-helpers.ts` for state/profile construction.

### 2. Re-validate existing plan-having profile-quality witnesses

Re-run the existing ARVN Train+Govern + FITL four-faction witness corpus after `190PLANROOTSEL-001` lands; confirm all still pass. Specifically (representative — exact list at run time, run the full `policy-profile-quality/` directory):

- `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-train-govern-fallback.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-govern-active-support-priority.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-patrol-govern-over-train-when-threatened.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-precoup-posture-avoids-redeploy-undone.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-sweep-raid-expose-before-removal.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.ts`
- `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts`
- `packages/engine/test/policy-profile-quality/nva-*.test.ts`
- `packages/engine/test/policy-profile-quality/us-*.test.ts`
- `packages/engine/test/policy-profile-quality/vc-*.test.ts`
- `packages/engine/test/policy-profile-quality/fitl-variant-*.test.ts`

If any witness regresses, triage per `.claude/rules/testing.md` "Update Protocol": if the regression is a legitimate trajectory shift caused by the seam (e.g., the plan's chosen root is now correctly selected where the scalar previously diverged), either distill the witness into an architectural-invariant or re-bless with the new trajectory and a `Re-bless …` commit-body note. Do not adapt the witness to a bug.

### 3. Document any re-bless / distillation decisions

If any witness is re-blessed or distilled in §2 above, record the rationale in this ticket's `Outcome` section at completion time, citing the specific witness file and the trajectory shift.

## Files to Touch

- `packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts` (new)
- (Possibly modify) any existing `policy-profile-quality/` witness whose trajectory legitimately shifts after `190PLANROOTSEL-001` — only if re-bless or distillation is warranted; default expectation is zero modifications.

## Out of Scope

- **Seam implementation** — owned by `archive/tickets/190PLANROOTSEL-001.md`. This ticket assumes the seam is live.
- **Architectural-invariant property tests for the seam** — also owned by `001`. This ticket adds the *behavioural* witness, not the structural property test.
- **Profile rewrites** — Spec 190 Non-Goal #1.
- **Cookbook rewrite** — deferred per Spec 190 §12.
- **Engine code changes** — none expected; the witness exercises production paths through existing helpers.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts` (new): scalar would pick X, plan binds Y, agent returns Y; negative control with plan-less profile returns X.
2. All existing `packages/engine/test/policy-profile-quality/arvn-*.test.ts`, `nva-*.test.ts`, `us-*.test.ts`, `vc-*.test.ts`, and `fitl-variant-*.test.ts` plan-having witnesses continue to pass (or are documented re-bless / distillation per §3).
3. Existing suite: `pnpm turbo test`.

### Invariants

1. The root-override property is non-trivially exercised by at least one ARVN state — proving the architectural seam from `190PLANROOTSEL-001` has measurable behavioural impact on a real profile.
2. No plan-having profile-quality witness regresses without an explicit re-bless / distillation decision documented in this ticket's `Outcome`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts` (new) — convergence-witness for the root-override behavioural property.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
3. `pnpm turbo test`
4. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-05-23.

What changed:

- Added `packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts`, a production FITL ARVN witness where `arvn.trainGovern` selects the `train` root while scalar `evaluatePolicyMove` would choose `govern`; `PolicyAgent.chooseDecision` returns the plan root and a plan-less ARVN control returns the scalar root.
- Used the user-approved marker correction: the drafted `// @witness: spec-190-arvn-root-override` header is represented as `// @profile-variant: spec-190-arvn-root-override`, because `policy-profile-quality/` convergence witnesses reject `@witness` markers and require `@profile-variant`.
- Distilled the pre-existing red `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts` away from a brittle seed-1000 full-game trajectory. The witness now constructs a deterministic ARVN event frontier with shaded and unshaded event candidates and still proves `candidate.params.side` contributes `-800` for shaded candidates, `0` for unshaded candidates, and no `unknownCandidateParamRefs` are emitted.

Deviations and classifications:

- The literal command `node --test packages/engine/dist/test/policy-profile-quality/` is invalid in this checkout; Node treats the directory as a module and fails with `MODULE_NOT_FOUND`. The repo-valid substitute is `pnpm -F @ludoforge/engine run test:policy-profile-quality`.
- `pnpm -F @ludoforge/engine run test:policy-profile-quality` now passes through the new Spec 190 witness's relevant ARVN/candidate-param coverage but still stops later on the known `fitl-march-dead-end-recovery.test.js` GameDef-hash fixture drift. That witness is profile-quality fixture drift outside this ticket's root-authority scope; the same class of failure was previously handled in `archive/tickets/145PREVCOMP-007.md`, but the current red is not a 190 deliverable and is not classified as an active 190 blocker.
- The abandoned broad seed scan for the candidate-param witness produced `seed=1000`, `1001`, and `1002` as no ARVN event frontier before it was stopped under the approved hang-triage replacement path. No source or fixture changes came from that probe.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.js` — passed, 1 test.
- `node --test packages/engine/dist/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.js` — passed, 2 tests.
- `pnpm -F @ludoforge/engine run test:policy-profile-quality` — partial red after the owned repairs: ARVN witnesses through `arvn-us-rival-risk-flip` passed, the repaired candidate-param witness passed, then the runner stopped on the known unrelated `fitl-march-dead-end-recovery.test.js` fixture hash drift.
- `node --test packages/engine/dist/test/policy-profile-quality/arvn-*.test.js packages/engine/dist/test/policy-profile-quality/nva-*.test.js packages/engine/dist/test/policy-profile-quality/us-*.test.js packages/engine/dist/test/policy-profile-quality/vc-*.test.js packages/engine/dist/test/policy-profile-quality/fitl-variant-*.test.js packages/engine/dist/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.js` — passed, 22 suites / 29 tests.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2496 archived tickets.
- `git diff --check -- packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts tickets/190PLANROOTSEL-002.md` — passed.
- `pnpm turbo test` — passed, 5/5 tasks.
- `pnpm turbo lint` — passed, 2/2 tasks.
- `pnpm turbo typecheck` — passed, 3/3 tasks.

Source-size ledger:

- `packages/engine/test/policy-profile-quality/spec-190-arvn-root-override-witness.test.ts`: new 146-line test, under guidance.
- `packages/engine/test/policy-profile-quality/candidate-params-fitl-witness/fitl-candidate-param-witness.test.ts`: 227 lines after distillation, under guidance.
