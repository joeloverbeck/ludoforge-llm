# Spec 208 — FITL ARVN Baseline Profile-Quality Witness Failures (post-Spec-191 baseline)

**Status**: PROPOSED
**Priority**: Medium — three `policy-profile-quality` witnesses fail on the branch baseline for distinct ARVN-baseline behavioral / preview-richness reasons; they were originally mis-filed under the Spec 207 preview-cost regression.
**Complexity**: M (diagnosis-first; each witness needs its own root-cause call: regression-fix vs distill)
**Dependencies**:
- `archive/specs/207-fitl-agent-decision-cost-regression.md` (COMPLETED) — split source; Spec 208 inherits the three witnesses re-pointed from Spec 207 after `fitl-spec-143-cost-stability` was distilled to its retained-state-leak invariant
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED) — plan-role rework (PR merged 2026-05-23) reshaped ARVN's plan-controlled trajectory; suspected origin for Witnesses 1–2
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED) — plan-primary root authority; co-suspected with Spec 191 for the `arvn.patrolGovern` domination
- `archive/specs/185-grant-flow-preview-integrity.md` (COMPLETED) — owns `grantFlowContinuation` / `postGrant16` / `grantFlow16` caps; Witness 3's `unknown` opponent-margin refs originate in this preview boundary
- `archive/specs/182-structured-strategy-policy-layer-modules-guardrails-and-turn-shape.md` (COMPLETED) — owns the `currentTurnImpact` turn-shape evaluator that Witness 2 asserts on
- `archive/specs/181-structured-strategy-policy-layer-probes-and-selectors.md` — owns the `actionFamilyDistributionBelow` probe that Witness 1 asserts on

**Ticket namespace**: `208FITLARVPQ`

**Date**: 2026-05-29

## 1. Problem

Three `policy-profile-quality` witnesses were quarantined under Spec 207 and **mis-attributed there to the preview overhead budget / cost regression**. They in fact fail on the **unmodified branch baseline** for three *distinct* reasons, none of which is the `chooseNStep` per-decision cost-drift that Spec 207 addressed (resolved by distilling `fitl-spec-143-cost-stability` to a retained-state-leak invariant). All three are ARVN-`baseline`, all replay the `fitl-arvn-action-distribution-windows.json` windows (seeds 1000–1011), and all were calibrated 2026-05-17/18 (Spec 181/182/185 era) **before** Spec 190/191's plan-root / plan-role rework (2026-05-23) reshaped ARVN's trajectory. Each needs its own root-cause call: **fix a genuine regression**, or — when the behavior is a legitimate evolution and the seed-pinned assertion has merely drifted — **distill / re-bless** per `.claude/rules/testing.md` (never relax to the regressed number).

### Witness 1 — `arvn-action-distribution-not-dominated` (plan-controller domination)

`probes/probe-budget.test.ts` → fails its first assertion `actionFamilyDistributionBelow{family:'any', threshold:0.60, windowMinDecisions:100}` with **"action family rate 1.000 was >= threshold=0.600"**: across 100 main-phase ARVN decisions, ARVN selects a single action family **100%** of the time. The matched trace is **plan-controlled** (`plan.status: selected`, `selectedTemplate: arvn.patrolGovern`, `selectedIntent: arvn.patrolGovern`) with **0** preview refs requested — so the domination comes from the plan controller / doctrine layer, not from preview scoring.

### Witness 2 — `turn-shape-minimum-impact-observed` (evaluator never ready)

`probes/probe-budget.test.ts` → fails `turnShapeMinimumImpactObservedBoth{evaluatorId:'currentTurnImpact'}` with **"turn-shape evaluator currentTurnImpact was never ready"** across the same 100-decision window. Likely related to Witness 1: plan-controlled decisions may bypass or never satisfy the `currentTurnImpact` readiness preconditions.

### Witness 3 — `fitl-arvn-may17-equivalent-opponent-preview` (grant-flow preview richness)

`probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` → fails **"expected at least two ready opponent-preview candidates, saw 0"**: the NVA/VC opponent-margin refs land `unknown` (grant-flow / post-grant / free-operation preview-cap exhaustion) instead of `ready`. Per Foundation #20, `unknown` is the **integrity-preserving** outcome of a bounded preview that does not reach the opponent margins; the witness demands ≥2 `ready`. This is a *grant-flow* preview mechanism (`grantFlowContinuation` caps `postGrant16`/`grantFlow16`), distinct from the `chooseNStep` inner-preview cost. Diagnosis must determine whether the post-Spec-191 trajectory legitimately moved the replay windows to states the bounded grant-flow preview cannot reach (→ distill the witness; Foundation #20 says do not coerce `unknown`→`ready`) or whether a grant-flow preview regression stopped it reaching margins it used to reach.

## 2. Evidence

Baseline (unmodified `implemented-spec-206`), all three run un-skipped via `runProbe`:

```
arvn-action-distribution-not-dominated: fail — action family rate 1.000 >= 0.600  (100 matches; plan-controlled arvn.patrolGovern, 0 preview refs)
turn-shape-minimum-impact-observed:     fail — turn-shape evaluator currentTurnImpact was never ready  (100 matches)
fitl-arvn-may17-equivalent-opponent-preview: fail — 0 ready opponent-preview candidates (expected >=2); NVA/VC margin refs unknown (grant-flow cap exhaustion)
```

None changes when the `chooseNStep` preview cost is reduced or sped up (verified during Spec 207 / 207AGEDECCOS-002).

## 3. Suspected areas (diagnosis-first)

- **Witnesses 1–2 (plan controller / turn-shape)**: `policy-agent-plan-root.ts`, `plan-controller.ts`, `plan-proposal.ts`, the `arvn.patrolGovern` template + governing doctrines in `data/games/fire-in-the-lake/92-agents.md`, and the `currentTurnImpact` turn-shape evaluator. Determine whether ARVN's plan selection legitimately collapses to patrol/govern (→ re-evaluate/distill the 0.60 family-share probe) or whether Spec 190/191 collapsed action diversity (→ fix plan/doctrine selection); and why `currentTurnImpact` never readies on plan-controlled decisions.
- **Witness 3 (grant-flow preview)**: the grant-flow continuation preview (`grantFlowContinuation` config, `policy-preview-inner-deepening.ts` deep-continuation, opponent-margin surface resolution). Trace whether the NVA/VC margins are reachable within the `postGrant16`/`grantFlow16` caps on the current replay windows.

## 4. Non-Goals

- Any change to the `chooseNStep`/`chooseOne` inner-preview cost path (Spec 207's resolved domain).
- Softening any probe to mask a genuine regression, or coercing `unknown`→`ready` for Witness 3 (Foundation #20). If a behavior is a legitimate evolution, distill the assertion per `.claude/rules/testing.md` with the diagnosis recorded.

## 5. Quarantine

All three remain `skip`ped referencing **this spec** (re-pointed from Spec 207): the two probe-budget probes via `SPEC_208_QUARANTINED_PROBE_IDS` in `probe-budget.test.ts`; the May-17 witness via its `skip` option. Un-skipping all three (passing at original or distilled bounds, justified by diagnosis) is the acceptance gate.

## 6. Acceptance criteria

1. Root cause identified and documented for each of the three witnesses (regression vs legitimate-needing-distillation).
2. All three pass **unskipped** — by fixing the underlying behavior, or by distilling/re-blessing the assertions per `.claude/rules/testing.md` with recorded justification (no relaxing to regressed numbers; no `unknown`→`ready` coercion).
3. No regression elsewhere: FITL determinism lane + four-profile convergence canaries byte-identical; full `test:all` + `policy-profile-quality` lanes green.

## 7. Foundation alignment

| Foundation | How |
|---|---|
| #8 | Any fix must preserve determinism + replay-identity |
| #15 | Address the root plan-selection / evaluator / grant-flow-preview behavior, not the probe threshold |
| #16 | Real PQ witnesses; surfaced (not softened) — split out from Spec 207 with corrected attribution; distill where the seed-pinned assertion drifted after legitimate evolution |
| #20 | Witness 3's `unknown` opponent-margin refs are the integrity-preserving bounded-preview outcome; restore reachability or distill — do not coerce |

## 8. Follow-On Tickets

Diagnosis-first. Decompose via `/spec-to-tickets` once prioritized:

1. **Diagnose Witnesses 1–2** — why ARVN plan selection collapses to `arvn.patrolGovern` and why `currentTurnImpact` never readies; classify each as regression vs legitimate-needing-distillation.
2. **Diagnose Witness 3** — whether NVA/VC opponent margins are reachable within the grant-flow caps on the current replay windows; regression vs legitimately-bounded.
3. **Fix / distill** per the diagnoses.
4. **Un-skip gate** — remove the quarantine from all three; verify acceptance.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-31:

- [`archive/tickets/208FITLARVPQ-001.md`](../archive/tickets/208FITLARVPQ-001.md) — Diagnose Witnesses 1–2 (plan-controller domination + turn-shape readiness) — COMPLETED 2026-05-31 (covers §8 item 1)
- [`archive/tickets/208FITLARVPQ-002.md`](../archive/tickets/208FITLARVPQ-002.md) — Diagnose Witness 3 (grant-flow opponent-margin preview reachability) — COMPLETED 2026-05-31 (covers §8 item 2)
- [`archive/tickets/208FITLARVPQ-003.md`](../archive/tickets/208FITLARVPQ-003.md) — Resolve per diagnosis — fix regression or distill assertion — COMPLETED 2026-05-31 (covers §8 item 3)
- [`tickets/208FITLARVPQ-004.md`](../tickets/208FITLARVPQ-004.md) — Un-skip gate — remove quarantine, verify acceptance (covers §8 item 4)
