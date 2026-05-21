# Spec 187 — Whole-Turn Posture Evaluation and Ally-as-Rival Relationship Metadata

**Status**: PROPOSED
**Priority**: High — completes the scoring half of the turn-plan architecture. Spec 186 makes the composed turn the *unit*; this spec makes it *scorable* against expected resulting board state and against contextual ally/rival incentives.
**Complexity**: M–L. Phase 1 (posture evaluators over honest preview) is M. Phase 2 (relationship metadata + conditional ally weighting) is M.
**Date**: 2026-05-20
**Dependencies**:
- `specs/186-advisory-turn-plan-architecture-core.md` (the `AdvisoryTurnPlan`, the posture hook, the plan trace this spec fills in)
- `archive/specs/185-grant-flow-preview-integrity.md` (honest, effect-complete grant-flow preview — the substrate posture evaluation reads; posture MUST honor its `ready`/non-`ready` status taxonomy)
- `archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (`currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind` standing roles and per-seat outer-preview signal integrity — extended here into relationship roles)

**Trigger reports**:
- `reports/ai-agent-policy-overhaul-first-iteration.md` (DPSA §4.2 Layer 5 posture, §5.6 ally-as-rival, §6 posture authoring — reassessed in §9)
- `reports/fitl-competent-agent-ai.md` (§5 Faction relationship model; §6.2 marginal victory + denial scoring; §6.5 rival-allied utility; §6.6 risk modeling)

**Ticket namespace**: `PLANPOSTURE` (proposed)

---

## 1. Goal

Give an `AdvisoryTurnPlan` two scoring capabilities the competence report requires but the current architecture cannot express:

1. **Posture over expected resulting board state.** A posture evaluator scores the *projected* state after the composed turn executes — own victory-margin delta, enemy-margin denial, resource/logistics floor, coup-readiness, exposure/redeploy risk — by reading Spec 185's honest, effect-complete preview. It MUST distinguish posture computed from `ready` preview from posture that fell back because preview was non-`ready` (Foundation #20).
2. **Ally-as-rival relationship metadata.** Generic, declarative relationship roles (`nominalAlly`, `sharedEnemy`, `rivalAlly`, `nearWin`, `kingmakerRisk`, `cooperativeUntilThreshold`) and **conditional ally weights** so a faction values an ally's gain only until that ally nears victory — the competence report's central relationship insight ("US and ARVN are friendly by rules but strategically misaligned").

The engine never learns US/ARVN/NVA/VC. Relationship semantics are generic policy metadata over seats/standing; FITL meaning is authored in YAML (Spec 188).

## 2. Non-Goals

- **No new preview depth or new cap classes.** Posture consumes the preview surface Spec 185 already produces. No raising of `standard256`/`deep1024`/`postGrant16`. If preview is non-`ready`, posture falls back; it never deepens to force a `ready`. Bounded *composition* of the per-role-step option previews into a plan-level delta (§4.1) is in scope and is not "new preview depth": it aggregates previews Spec 185 already produces, at the same depth, bounded by the plan caps.
- **No omniscient state.** Posture and relationship refs read only the observer-safe projection for the profile, except in explicitly marked `analysis` profiles (Foundation #4); analysis traces are labeled and are not legal default playing agents.
- **No game-specific relationship logic in the engine.** No hardcoded faction pairs, victory formulas, or "near-win" thresholds in `packages/engine/`. Thresholds and pairings are authored refs/conditions (Foundation #1).
- **No plan-structure changes.** The plan IR, role binding, execution controller, and fallback ladder are Spec 186's; this spec only fills the `postureHook` and adds relationship refs.
- **No faction authoring.** The ARVN/US/NVA/VC posture and relationship wiring is Spec 188.

## 3. Context (verified against codebase, 2026-05-20)

- **Honest preview substrate (185).** `preview.victory.currentMargin.$seat`, `currentLeader`, `nearestThreat` differentiate across candidates after grant-flow continuation; non-`ready` statuses (`postGrantCap`, `freeOperationCap`, `grantFlowPartial`, `hidden`, `unresolved`, `failed`, `depthCap`, `random`, `gated`, `noPreviewDecision`) are no longer coerced to numeric `ready`. Posture MUST surface the status, not just the value.
- **Standing roles (180).** `currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind` exist as generic role refs with per-seat outer-preview signal integrity. Relationship roles extend this substrate — they do not introduce a new omniscient surface.
- **Posture hook already wired but inert (186).** `CompiledPlanTemplate.postureHook` (and the YAML `GameSpecPlanTemplateDef.postureHook`) exists, and `plan-proposal.ts` (`postureStatusFor`) currently reports `postureStatus: 'unavailable'` whenever a template declares the hook — the evaluator is never invoked. This spec fills that hook; it is an integration point, not greenfield plumbing.
- **Turn-shape evaluators (182).** Already compute bounded summaries over the inner-preview chain and demote candidates when objectives are unmet, but they are wired to the v2 candidate-scoring pass. This spec re-homes their projection logic as the posture evaluator that scores a *plan*, not a candidate microturn.
- **Competence report demands denial scoring** (§6.2: "reducing an enemy score can be as important as increasing own score; blocking a near-win should override normal faction habits") and **conditional ally utility** (§6.5: `utility = own_gain + ally_gain*ally_weight − enemy_gain − rival_ally_gain_if_ally_near_win`). Neither is first-class today.

## 4. Architecture

### 4.1 Posture evaluators

A library bucket `postureEvaluators` (a net-new entry in `AGENT_POLICY_LIBRARY_BUCKETS`), each referenced by a plan template's `postureHook` (which already exists; §3). It is referenced *indirectly* through the hook, so it is not a profile-use bucket (`AGENT_POLICY_PROFILE_USE_BUCKETS`). A posture evaluator declares:

- `must`: hard posture constraints (e.g. resource-floor-after-turn satisfied) that veto/demote a plan;
- `prefer`: weighted posture preferences, each a leaf-scored value over projected state (`preview.plan.delta.*`, a net-new ref namespace — see below) with an explicit `when` and an explicit **fallback contribution** for non-`ready` preview (Foundation #20);
- `provenance`: the posture's overall preview status (`ready` | `<fallback-reason>`), recorded in the plan trace.

`preview.plan.delta.*` does not exist today; the only delta precedent is option-scope `preview.option.delta.victory.currentMargin.self` (`policy-evaluation-core.ts`). Plan-level delta is computed by **bounded composition of the per-role-step option previews** Spec 185 already produces — aggregating each step's projected delta over the plan's role-bound steps, bounded by the plan caps (no new preview depth or cap class; §2). Each step's preview status folds into the posture `provenance`: any non-`ready` step makes the composed delta non-`ready`, and the declared fallback contribution applies (Foundation #20).

Posture is evaluated once per candidate plan at proposal time (Spec 186 §4.4 step 4), bounded by the same plan caps.

### 4.2 Relationship roles and conditional ally weights

A library bucket `relationships` (a net-new entry in `AGENT_POLICY_LIBRARY_BUCKETS`) mapping generic relationship roles to seats via authored conditions. Like `postureEvaluators`, it is referenced indirectly (by posture `prefer`/`when` terms), not from a profile-use bucket:

- role kinds: `nominalAlly`, `sharedEnemy`, `rivalAlly`, `leader`, `nearWin`, `kingmakerRisk`, `cooperativeUntilThreshold`;
- each binds to a seat via an authored condition expressed as an entry in the existing `strategicConditions` bucket — e.g. a `nearWin` role binds the seat whose per-seat `victory.currentMargin.<seat>` exceeds an **authored** threshold (Foundation #1, no hardcoded near-win threshold in engine) — and may bind to a Spec 180 standing-role selector (`currentLeader`/`nearestThreat`/`closestAhead`/`closestBehind`); never a hardcoded faction id. There is no `standing.<seat>.*` ref namespace — `nearWin` is a role kind whose *binding condition* is a strategic condition, not a standing ref;
- exposes refs (`relationship.<role>.seat`, `relationship.<role>.gainValue`) consumable by posture `prefer` terms and selector vetoes.

**Conditional ally weighting** is expressed as a posture `prefer` term whose `when` gates on relationship refs, e.g. "value `nominalAlly` margin gain at weight W *unless* the nominal ally seat is also bound to the `nearWin` role (`relationship.nearWin.seat == relationship.nominalAlly.seat`), in which case treat ally gain as enemy gain." This realizes the report's `rival_ally_gain_if_ally_near_win` term generically using only the declared `relationship.<role>.seat` refs.

### 4.3 Trace contract extension

The plan trace `posture` block (extending `PolicyPlanTrace` in `kernel/types-plan-trace.ts`) records: `{ status, mustViolations[], preferContributions[], allyWeightContext }`, with each contribution tagged `ready` or its fallback reason. Its `status` **subsumes and replaces** the existing 3-value `postureStatus` enum (`'notConfigured' | 'ready' | 'unavailable'`) — the standalone `postureStatus` field is removed, not kept alongside (Foundation #14) — widening `unavailable` into the specific fallback reason. Replay-identical.

## 5. Data flow

Plan proposer (Spec 186 §4.4) → for each candidate plan, evaluate `postureHook` over Spec 185 preview → `must` failures demote/veto; `prefer` terms (including conditional ally weights) contribute to plan rank → status + contributions recorded in plan trace.

## 6. Edge cases

- **All candidate plans have non-`ready` posture preview**: posture contributes only declared fallbacks; plan ranking proceeds on current-state leaf scorers; trace marks posture `fallback` (never silently `ready`). Mirrors `tiebreakAfterPreviewNoSignal` discipline at plan scope.
- **Relationship condition matches no seat** (e.g. no ally near win): conditional term's `when` is false; base ally weight applies.
- **Ally and rival role bind the same seat under different conditions**: deterministic precedence by authored priority; recorded in trace.

## 7. Phases & acceptance criteria

**Phase 1 — Posture evaluators.** Acceptance: (a) a posture evaluator compiles and is referenced by a plan template; (b) a `must` violation demotes/vetoes a plan in a constructed scenario; (c) a `prefer` term over `ready` preview differentiates two plans, and over non-`ready` preview contributes its declared fallback with the status visible in trace; (d) determinism/replay identity for posture contributions.

**Phase 2 — Relationship metadata.** Acceptance: (a) relationship roles compile and bind seats via authored conditions with no faction ids in engine code; (b) a conditional ally-weight term flips an ally's gain from positive to negative when the nominal ally seat is also bound to the `nearWin` role (`relationship.nearWin.seat == relationship.nominalAlly.seat`), in a constructed scenario; (c) the flip is replay-stable and traced.

## 8. Test plan

- Compiler: posture/relationship golden + determinism + authoring-error corpus (posture term missing fallback; relationship role binding unknown seat; posture `prefer`/`when` term referencing an undeclared `relationship.<role>`).
- Runtime: posture demotion invariant; non-`ready`-preview fallback honesty (architectural-invariant, ties to Foundation #20); conditional ally-weight flip (profile-quality witness, `policy-profile-quality/`).

## 9. Foundation alignment

#1 (generic relationship/posture metadata, no faction ids in engine; near-win thresholds authored, not hardcoded) · #4 (observer-safe projection; analysis-only omniscience labeled) · #10 (posture and the `preview.plan.delta.*` composition bounded by existing plan caps; no new depth) · #12 (static validation of posture/relationship refs) · #14 (the existing `postureStatus` enum migrated into the posture trace block, not duplicated) · #15 (denial + ally-rival scoring as first-class structure, not a weight hack) · #20 (posture preview status honesty; declared fallbacks visible in trace).

## 10. Reassessment of the external proposal

**Kept:** posture-over-projected-state as plan-level scoring (DPSA Layer 5); generic relationship roles and conditional ally weighting (DPSA §5.6) — both map cleanly to competence report §5/§6.5.

**Corrected:** DPSA's posture examples imply fresh preview machinery; this spec binds posture to the *existing* Spec 185 preview and forbids new depth/cap classes. Relationship roles extend Spec 180 standing roles rather than introducing a parallel "standing" concept.

**Rejected:** BDI/POMDP belief machinery as runtime (Foundation #10); omniscient default agents (Foundation #4).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-21:

- [`archive/tickets/187WHOTURPOS-001.md`](../archive/tickets/187WHOTURPOS-001.md) — `postureEvaluators` library bucket (compiler) — completed 2026-05-21 (covers §4.1)
- [`archive/tickets/187WHOTURPOS-002.md`](../archive/tickets/187WHOTURPOS-002.md) — `preview.plan.delta.*` ref namespace + bounded per-step composition (covers §4.1)
- [`archive/tickets/187WHOTURPOS-003.md`](../archive/tickets/187WHOTURPOS-003.md) — Runtime posture evaluation + `PolicyPlanTrace.posture` block — completed 2026-05-21 (covers §4.1, §4.3, §5, §6)
- [`tickets/187WHOTURPOS-004.md`](../tickets/187WHOTURPOS-004.md) — `relationships` library bucket + relationship refs (covers §4.2)
- [`tickets/187WHOTURPOS-005.md`](../tickets/187WHOTURPOS-005.md) — Conditional ally weighting + `allyWeightContext` trace (covers §4.2, §6, §8)

Phase 1 (posture: 001–003) lands before Phase 2 (relationships: 004–005), since conditional ally weights (005) are authored as posture terms.

## Outcome

_Pending implementation._
