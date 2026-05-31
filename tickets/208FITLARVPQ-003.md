# 208FITLARVPQ-003: Resolve per diagnosis — fix regression or distill assertion

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: TBD — refined against the verdicts in `archive/tickets/208FITLARVPQ-001.md` and `archive/tickets/208FITLARVPQ-002.md`. Likely surface: engine source under `packages/engine/src/agents/` (plan-controller / grant-flow preview) OR YAML doctrine in `data/games/fire-in-the-lake/92-agents.md` OR test-file distillation rewrites. None of the three is committed in advance.
**Deps**: `archive/tickets/208FITLARVPQ-001.md`, `archive/tickets/208FITLARVPQ-002.md`

## Problem

Per Spec 208 §6 Acceptance Criteria #1–#2, each of the three quarantined `policy-profile-quality` witnesses (`arvn-action-distribution-not-dominated`, `turn-shape-minimum-impact-observed`, `fitl-arvn-may17-equivalent-opponent-preview`) must be resolved by either:

- **Fixing the underlying regression** in engine source or YAML doctrine, with the witness passing un-skipped at its original bound, OR
- **Distilling the seed-pinned assertion** to a property-form architectural invariant per `.claude/rules/testing.md` "Distillation over re-bless" (preferred when the trajectory drift is legitimate), OR
- **Re-blessing** the witness to the new trajectory (last resort — only if distillation is attempted and loses defect-class coverage, with the reason recorded per the testing.md rule).

The resolution path for each witness is determined by its diagnosis verdict (R or L) from tickets 001 and 002. **Gate condition**: this ticket cannot start until both 001 and 002 close — its execution path, file set, and effort are determined by the verdicts. If a verdict is R (regression), the work is an engine or YAML fix; if L (legitimate), the work is a distillation rewrite of the witness assertion.

This is a **deferred-execution ticket**: the spec mandates the deliverable as a phase artifact, but the implementation work is gated on the diagnoses landing. The ticket is not "close-without-work optional" — it is unconditionally executed once 001 and 002 close.

## Assumption Reassessment (2026-05-31)

1. At authoring time, the verdicts from 001 and 002 are not yet known. The reassessment phase for THIS ticket (per the standard `/implement-ticket` Phase 2 reassessment) must re-read the two upstream reports and refine this ticket's scope, files-to-touch, and effort rating accordingly.
2. Foundation #20 forbids coercing `unknown` opponent-margin refs to `ready` to satisfy Witness 3 — this constraint is reaffirmed in Spec 208 §4 Non-Goals. Any distillation path must respect this; any "fix" path must restore reachability through legitimate engine/data changes, not through resolution-status recoding.
3. `.claude/rules/testing.md` "Distillation over re-bless" is the canonical guidance — re-blessing is permitted only if distillation is attempted, loses defect-class coverage, and the rejection rationale is recorded in the commit body.
4. The three witnesses may resolve via three different paths (e.g., Witness 1 fix, Witness 2 distill, Witness 3 fix) — do not assume uniform resolution.

## Architecture Check

1. **Foundation 15 (Architectural Completeness)**: regression fixes must address the root behavioral cause (the plan-controller / doctrine / evaluator / grant-flow preview surface named by the diagnosis), not the witness threshold. Distillations must restate the underlying defect-class property in seed-independent form, not relax the assertion.
2. **Foundation 16 (Testing as Proof)** + Appendix: the `policy-profile-quality` lane is now blocking (since 2026-05-29). Resolution must leave the witnesses *passing un-skipped* — not quarantined under a new tracking spec.
3. **Foundation 20 (Preview Signal Integrity)**: for Witness 3 specifically, the resolution must preserve the `ready` / `unknown` / `depth-capped` / `failed` status semantics. Fixes restore reachability; distillations assert on the resolution-status *distribution*, not on coerced `ready` counts.
4. **No backwards-compatibility shims (Foundation 14)**: if the resolution involves changing a public engine signature or a YAML schema, migrate every owned artifact in this same change. If the resolution involves distilling a witness, replace its assertion entirely — no "old assertion as fallback" alias paths.
5. **Atomicity within this ticket**: per-witness resolutions are independent and can land in separate commits within this ticket's branch. The acceptance is the conjunction — all three resolved.

## What to Change

### 1. Re-read the diagnosis reports

Read `reports/spec-208-witnesses-1-2-diagnosis.md` and `reports/spec-208-witness-3-diagnosis.md`. For each witness, record the verdict (R or L) and the proposed resolution path in this ticket's Phase 2 reassessment (per the `/implement-ticket` flow).

### 2. Resolve Witness 1 (`arvn-action-distribution-not-dominated`)

- **If R (regression)**: implement the fix at the named code path (likely under `packages/engine/src/agents/` — `policy-agent-plan-root.ts`, `plan-controller.ts`, or `plan-proposal.ts`) or in `data/games/fire-in-the-lake/92-agents.md` (the `arvn.patrolGovern` template / guarding doctrines). Verify the witness passes un-skipped at its original 0.60 family-share threshold and that determinism + four-profile convergence canaries remain byte-identical.
- **If L (legitimate)**: distill `actionFamilyDistributionBelow{family:'any', threshold:0.60, windowMinDecisions:100}` to a seed-independent architectural invariant per the diagnosis report's proposal. The distilled assertion must guard the same defect class (extreme action-family domination indicates plan-selection collapse). Mark the distilled test as `architectural-invariant` per `.claude/rules/testing.md`. Verify it passes on the current `main` baseline and on the pre-Spec-191 baseline (the latter as a sanity check — the property should hold both before and after the legitimate evolution; if it doesn't, the distillation is wrong).

### 3. Resolve Witness 2 (`turn-shape-minimum-impact-observed`)

- **If R (regression)**: implement the fix at the named code path or in the `currentTurnImpact` evaluator authoring in `92-agents.md`. Verify the witness passes un-skipped and determinism is preserved.
- **If L (legitimate)**: distill `turnShapeMinimumImpactObservedBoth{evaluatorId:'currentTurnImpact'}` per the diagnosis report's proposal. The distilled assertion must guard the underlying defect class (a turn-shape evaluator that NEVER readies indicates a wiring break). One viable form: assert readiness *or* an explicit non-`ready` status with a documented cause (e.g., `unknown` due to plan-controlled bypass), but never silently never-fires. Mark `architectural-invariant`.

### 4. Resolve Witness 3 (`fitl-arvn-may17-equivalent-opponent-preview`)

- **If R (regression)**: restore opponent-margin reachability via the named grant-flow change (engine source `policy-preview-inner-deepening.ts` / `grantFlowContinuation` consumer, or the cap configuration). Foundation #20 constraint: the fix must produce genuinely-`ready` margins, not `ready`-coerced ones. Verify the witness's `>= 2 ready` assertion passes un-skipped.
- **If L (legitimate)**: distill the witness per the diagnosis report's proposal. A viable property-form invariant: the resolution-status distribution across opponent-margin candidates falls within a corpus-wide envelope (e.g., "≥ X% of margins land `ready` OR `unknown`-with-documented-cap-exhaustion across the full witness corpus"). Mark `architectural-invariant`. Foundation #20: the distilled assertion must NOT coerce `unknown` → `ready`.

### 5. Re-bless guardrail (last resort)

If for any witness the diagnosis verdict was L (legitimate) but distillation is attempted and loses defect-class coverage, re-bless the witness to the new trajectory per `.claude/rules/testing.md`. Record the rejection rationale for distillation in the commit body: `Re-bless witness: <test-file>` plus the rejection reason. This path SHOULD be rare — prefer distillation per the testing.md rule. Re-bless is forbidden when the verdict was R.

### 6. Verify no collateral regression

After each resolution, run the FITL determinism lane and the four-profile convergence canaries; assert byte-identity for both. Run `pnpm -F @ludoforge/engine test:all` and confirm no other witnesses regress.

## Likely Surface

Refined against the upstream diagnoses' findings during this ticket's Phase 2 reassessment. Tentative path list:

- `packages/engine/src/agents/policy-agent-plan-root.ts` (Witness 1/2 regression candidate)
- `packages/engine/src/agents/plan-controller.ts` (Witness 1/2 regression candidate)
- `packages/engine/src/agents/plan-proposal.ts` (Witness 1/2 regression candidate)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (Witness 3 regression candidate)
- `data/games/fire-in-the-lake/92-agents.md` (Witness 1/2 YAML-doctrine or evaluator-authoring regression candidate; or Witness 3 cap-configuration regression candidate)
- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (distillation path for Witnesses 1/2 — replacing the assertion body)
- `packages/engine/test/policy-profile-quality/probes/arvn-action-distribution.probe.ts` (distillation path for Witness 1 if the probe builder itself needs replacement)
- `packages/engine/test/policy-profile-quality/probes/turn-shape-minimum-impact.probe.ts` (distillation path for Witness 2)
- `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` (distillation path for Witness 3 — replacing the assertion body)

The actual files modified depend on each witness's verdict — exact scope is refined against `reports/spec-208-witnesses-1-2-diagnosis.md` and `reports/spec-208-witness-3-diagnosis.md` outputs during Phase 2 reassessment.

## Out of Scope

- Un-skipping the witnesses from `SPEC_208_QUARANTINED_PROBE_IDS` and the May-17 `skip` option — owned by `tickets/208FITLARVPQ-004.md`. This ticket leaves the witnesses passing un-skipped *locally* (run via direct path) but does NOT mutate the quarantine constants. Ticket 004's role is the final un-skip + lane gate.
- Modifying ARVN preview budget config (cap classes / depth) as a generic optimization — Spec 207's history (`project_spec207_root_cause.md`) shows this approach was tried and reverted; only invoke it here if Witness 3's diagnosis verdict R explicitly points to a cap-configuration regression.
- Any witness not in Spec 208's three (Witnesses 1, 2, 3). Pre-existing baseline PQ failures unrelated to Spec 208 are out of scope and remain owned by the broader `project_spec202_preexisting_pq_failures.md` follow-up work.
- Relaxing the `0.60` family-share threshold or any assertion bound to mask a regression (forbidden by Spec 208 §4 Non-Goals).
- Coercing `unknown` → `ready` for Witness 3 (forbidden by Foundation #20 and Spec 208 §4 Non-Goals).

## Acceptance Criteria

### Tests That Must Pass

1. All three witnesses pass when run via their direct test paths, un-skipped:
   - `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/probes/probe-budget.test.js` (Witnesses 1 + 2)
   - `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.js` (Witness 3)
2. FITL determinism lane: byte-identical replay across the seed corpus pre and post resolution.
3. Four-profile convergence canaries: byte-identical pre and post resolution.
4. Full `policy-profile-quality` lane: no regression of other witnesses (`pnpm -F @ludoforge/engine test:policy-profile-quality` or the equivalent project-canonical command).
5. Existing suite: `pnpm turbo test` and `pnpm -F @ludoforge/engine test:all` green.

### Invariants

1. **Spec 208 §6 #1**: Root cause identified and documented for each of the three witnesses (R vs L) — this is owned by tickets 001/002 but reaffirmed here as the basis for resolution.
2. **Spec 208 §6 #2**: All three pass *un-skipped* — fixed or distilled. No relaxing to regressed numbers. No `unknown` → `ready` coercion.
3. **Spec 208 §6 #3**: No collateral regression — determinism + four-profile convergence canaries byte-identical; full `test:all` + `policy-profile-quality` lanes green.
4. **Foundation #14**: any signature or schema change migrates all owned artifacts in this same change; no compatibility shims.
5. **Foundation #15**: regression fixes address root cause (named code path); they don't paper over the symptom.
6. **Foundation #16 + Appendix**: distillations restate the defect-class property in seed-independent form (`architectural-invariant` marker per `.claude/rules/testing.md`), not relax the assertion.
7. **Foundation #20**: preview-status semantics preserved end-to-end; `ready` is not synthesized from non-`ready` outcomes.

## Test Plan

### New/Modified Tests

Refined against the diagnosis verdicts. Likely paths:

1. `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` — distillation rewrites for Witnesses 1/2 (if L verdicts).
2. `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` — distillation rewrite for Witness 3 (if L verdict).
3. (If R verdicts) new architectural-invariant tests covering the fixed behavior — paths determined by the regression's location.

### Commands

1. Per-witness verification (after build): `node --test dist/test/policy-profile-quality/probes/probe-budget.test.js` and `node --test dist/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.js`.
2. Determinism lane: `pnpm -F @ludoforge/engine test:e2e` (or the project's canonical determinism command).
3. Four-profile convergence canaries: project-canonical command (look up in `package.json` scripts during Phase 2 reassessment).
4. Full PQ lane: `pnpm -F @ludoforge/engine test:policy-profile-quality` (verify via `package.json` scripts during Phase 2).
5. Full verification: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`.
