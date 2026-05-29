# Spec 208 — FITL ARVN Plan-Controller Action Domination (PQ witnesses)

**Status**: PROPOSED
**Priority**: Medium — two `policy-profile-quality` witnesses fail on the branch baseline for a behavioral (plan-controller) reason; they were originally mis-filed under the Spec 207 preview-cost regression.
**Complexity**: M (diagnosis-first; the fix touches ARVN plan/doctrine selection, not the preview hot path)
**Dependencies**: None. Split from `specs/207-fitl-agent-decision-cost-regression.md` (see Spec 207 "Re-scope" §).
**Date**: 2026-05-29

## 1. Problem

Two `policy-profile-quality` witnesses, originally quarantined under Spec 207 and **mis-attributed there to the preview overhead budget**, in fact fail **behaviorally on the unmodified branch baseline** — independent of the preview-cost regression and not fixable by any preview-cost change:

1. `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` → probe **`arvn-action-distribution-not-dominated`** fails its first assertion `actionFamilyDistributionBelow{family:'any', threshold:0.60, windowMinDecisions:100}` with **"action family rate 1.000 was >= threshold=0.600"** — across 100 main-phase ARVN decisions (replay windows, seeds 1000–1014) ARVN selects a single action family **100%** of the time. The decision trace shows it is **plan-controlled** (`plan.status: selected`, `selectedTemplate: arvn.patrolGovern`, `selectedIntent: arvn.patrolGovern`) with **0** preview refs requested at that decision — i.e. the domination comes from the plan controller / doctrine layer, not from preview scoring.

2. `packages/engine/test/policy-profile-quality/probes/turn-shape-minimum-impact.probe.ts` (run via `probe-budget.test.ts`) → probe **`turn-shape-minimum-impact-observed`** fails `turnShapeMinimumImpactObservedBoth{evaluatorId:'currentTurnImpact'}` with **"turn-shape evaluator currentTurnImpact was never ready"** — the evaluator never resolves ready across the same 100-decision window.

Both probes were calibrated 2026-05-17/18 (Spec 181/182 era), **before** Spec 191's plan-role / plan-proposal rework (2026-05-23), which changed ARVN's trajectory (163 → 218 decisions) and is the likely source of the behavior shift. They are consistent with this branch's other known stale baseline witnesses.

## 2. Evidence

Baseline (unmodified `implemented-spec-206`), both probes run un-skipped:

```
arvn-action-distribution-not-dominated: aggregateOutcome=fail
  reason: action family rate 1.000 was >= threshold=0.600   (100 matches inspected)
  matched decision trace: plan-controlled, selectedTemplate=arvn.patrolGovern, 0 preview refs requested

turn-shape-minimum-impact-observed: aggregateOutcome=fail
  reason: turn-shape evaluator currentTurnImpact was never ready   (100 matches inspected)
```

These reproduce via the probe runner (`runProbe`) on the `fitl-arvn-action-distribution-windows.json` fixture; neither failure changes when the preview cost is reduced or sped up (verified during Spec 207 / 207AGEDECCOS-002).

## 3. Suspected area (diagnosis-first)

- **`arvn-action-distribution-not-dominated`**: the ARVN plan controller / doctrine layer (`policy-agent-plan-root.ts`, `plan-controller.ts`, `plan-proposal.ts`, the `arvn.patrolGovern` template + its governing doctrines in `data/games/fire-in-the-lake/92-agents.md`) selects `arvn.patrolGovern` for effectively every main-phase decision in the replay windows. Determine whether this is (a) a legitimate ARVN strategy that the probe's 0.60 family-share threshold no longer fits (→ re-evaluate/distill the probe per `.claude/rules/testing.md`), or (b) a plan-selection regression from Spec 190/191 that collapsed ARVN's action diversity (→ fix the plan/doctrine selection).
- **`turn-shape-minimum-impact-observed`**: the `currentTurnImpact` turn-shape evaluator never reaching `ready` suggests either a structural gating issue (the evaluator's preconditions never hold for plan-controlled decisions) or that plan-controlled decisions bypass the turn-shape evaluation path entirely. Trace `currentTurnImpact` readiness through the plan-controlled decision path.

## 4. Non-Goals

- Any change to the `chooseNStep`/`chooseOne` preview hot path (that is Spec 207's domain).
- Softening either probe to mask a genuine plan-selection regression. If diagnosis shows the behavior is a legitimate evolved strategy, re-evaluate/distill the probe assertion per `.claude/rules/testing.md` (do not merely relax the threshold to the regressed number).

## 5. Quarantine

Both probes remain `skip`ped in `probe-budget.test.ts` referencing **this spec** (re-pointed from Spec 207). Un-skipping both (passing at their original, un-relaxed bounds — or distilled equivalents justified by diagnosis) is the acceptance gate.

## 6. Acceptance criteria

1. Root cause identified and documented for each probe (plan-selection regression vs legitimate-strategy-needing-probe-distillation).
2. Both probes pass **unskipped** in `probe-budget.test.ts` — either by fixing the plan/doctrine selection so ARVN's action distribution is not single-family-dominated and `currentTurnImpact` resolves ready, or by distilling the probe assertions per the testing rules with the diagnosis recorded.
3. No regression elsewhere: FITL determinism lane + four-profile convergence canaries byte-identical; full `test:all` + `policy-profile-quality` lanes green.

## 7. Foundation alignment

| Foundation | How |
|---|---|
| #8 | Any plan-selection fix must preserve determinism + replay-identity |
| #15 | Address the root plan-selection/evaluator behavior, not the probe threshold |
| #16 | Real PQ witnesses; surfaced (not softened) — split out from Spec 207 with corrected attribution |

## 8. Follow-On Tickets

Diagnosis-first. Decompose via `/spec-to-tickets` once prioritized:

1. **Diagnose** — why ARVN plan selection collapses to `arvn.patrolGovern` 100% in the replay windows, and why `currentTurnImpact` never readies. Classify each as regression vs legitimate-strategy.
2. **Fix / distill** — per the diagnosis: correct the plan/doctrine selection, or distill the probe assertions with recorded justification.
3. **Un-skip gate** — remove the quarantine from both probes; verify acceptance.
