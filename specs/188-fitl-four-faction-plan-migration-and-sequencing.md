# Spec 188 — FITL Four-Faction Plan Migration and Sequencing Template Library

**Status**: PROPOSED
**Priority**: High — this is where the architecture pays off: the four competence-report personalities become authored, reviewable plan structures instead of evolved weight soup.
**Complexity**: M–L, but **Tier-1 YAML authoring only** — no engine or compiler changes. Phased by faction: ARVN (full) → US/NVA/VC (skeletons).
**Date**: 2026-05-20
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (plan templates, role selectors, execution controller, fallback)
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (posture evaluators + relationship metadata used by every faction)

**Trigger reports**:
- `reports/fitl-competent-agent-ai.md` (the authoritative source for all four personalities, combinations, target features, errors-to-avoid, and the relationship model — this spec is its faithful encoding)
- `reports/ai-agent-policy-overhaul-first-iteration.md` (DPSA §7 FITL expressiveness check, §10.3 migration sequence — reassessed in §8)

**Ticket namespace**: `FITLPLAN` (proposed)

---

## 1. Goal

Author the four base-game FITL faction personalities from `reports/fitl-competent-agent-ai.md` as `schemaVersion: 3` plan structures in `data/games/fire-in-the-lake/92-agents.md`:

- **doctrine carriers** (re-homed Spec 182 modules) per faction (e.g. ARVN regime-preservation, harvest-Patronage, hold-high-pop-control, deny-US-if-near-win);
- **plan templates** for the report's composed turns and sequencing combos;
- **role selectors** for target/piece/origin/destination/subset roles;
- **guardrails** for the report's "errors to avoid";
- **posture evaluators** and **relationship wiring** (Spec 187) realizing conditional ally-as-rival weighting.

Migrate **ARVN fully first** (the campaign's focus and the stress test), then US/NVA/VC at correct doctrine skeletons. Retire the `arvn-evolved` flat-consideration primary scoring, demoting its surviving terms to leaf/primitive scorers (Spec 186 §4.6).

## 2. Non-Goals

- **No engine, compiler, or kernel changes.** Everything here is authored in `data/games/fire-in-the-lake/`. If a personality cannot be expressed, that is a gap in Spec 186/187 to be raised explicitly via the 1-3-1 rule — not patched with FITL-specific engine code (Foundations #1, #2).
- **No new combinations beyond the competence report.** The sequencing library encodes exactly the report's combos (§ per-faction "preferred combinations"); no speculative templates (YAGNI).
- **No evolution campaign.** This spec *authors* competence directly. Structure-first evolution (reviving rejected Spec 183's idea) is a separate future effort; this spec does not run `campaigns/`.
- **No four-faction parity in one phase.** ARVN is authored to full fidelity; US/NVA/VC land as correct skeletons (doctrine + signature combos + key guardrails), to be deepened later.

## 3. Context (verified against codebase, 2026-05-20)

- **Tier-1 surface.** `data/games/fire-in-the-lake/92-agents.md` is the mutable agent library; `arvn-evolved` is the current ARVN binding. As of Spec 186's ARVN plan slice (commit `a8fc17db8`), it already carries the `arvn.trainGovern` plan template plus its role selectors, and its flat-consideration layer is partially demoted: 1 strategy module (`buildPoliticalEngine`), 1 guardrail (`dropPassWhenOtherMovesExist`), 1 turn-shape evaluator (`currentTurnImpact`), and 10 considerations. It binds `grantFlowContinuation` preview, now made honest by Spec 185.
- **Competence report mapping.** The report supplies, per faction: a priority stack, an action policy table, preferred combinations with target logic, target scoring features (weighted sums → leaf scorers / posture terms), errors-to-avoid (→ guardrails), and a final personality statement (→ doctrine intent strings). §5 supplies the relationship model (→ Spec 187 relationship wiring).
- **Combos to encode** (report §ARVN/US/NVA/VC "preferred combinations"): ARVN Train+Govern, Patrol+Govern, Sweep+Raid, Assault+Raid, Train+Transport, Assault+Transport+Assault; US Train+Advise, Patrol+Advise, Sweep+AirStrike, Assault+AirLift+Assault, AirLift+Train; NVA Rally+Infiltrate, March+Infiltrate, March+Ambush, Attack+Ambush, Terror→future-Rally, LoC-occupation-before-Coup; VC Rally+Subvert, March+Subvert, Terror+Subvert, Terror+Tax, March+Ambush-from-LoC, Rally-underground-reset→Terror.
- **Generic encoding requirement.** Each combo is a generic plan template (root action tag + optional special tag + timing + role steps); the engine never sees "Sweep"/"Raid" — only authored action tags and selector filters.

## 4. Architecture (authoring plan)

### 4.1 ARVN (full fidelity)

- **Doctrines**: `arvn.blockImmediateWin`, `arvn.harvestPatronage`, `arvn.holdHighPopControl`, `arvn.protectAidEcon`, `arvn.selectiveViolence`, `arvn.denyUSIfNearWin`, `arvn.preCoupRedeployDiscipline` — `when`/priority/intent from report §ARVN priority stack + final statement.
- **Plan templates**: `arvn.trainGovern` (Train+Govern, Govern space ≠ Train space — **already authored by Spec 186's ARVN slice; extend, do not re-author**), `arvn.patrolGovern`, `arvn.sweepRaid`, `arvn.assaultRaid`, `arvn.trainTransport`, `arvn.assaultTransportAssault`.
- **Role selectors**: `arvn.governPatronageSpace` and `arvn.trainSpaceForControlOrPacification` (**both already authored by Spec 186's ARVN slice**), plus net-new `arvn.patrolLocOrCity`, `arvn.sweepToExposeSpace`, `arvn.raidRemovalTarget`, `arvn.transportOrigin`/`Destination` (routePairs), `arvn.assaultTargetSpace`, `arvn.pieceRemovalPriority` — quality components from report §ARVN target scoring features.
- **Guardrails** (report §ARVN errors to avoid): `arvn.doNotServeUSWin`, `arvn.preserveAidEconFloor`, `arvn.doNotGovernAwaySupportEverywhere`, `arvn.doNotLoseOriginControlByTransport`, `arvn.doNotOvercommitTroopsPreCoupWithoutBase`, `arvn.doNotFightLowYieldHighlands`.
- **Posture + relationships** (Spec 187): resource-floor `must`; `prefer` own-margin and conditional US-rival denial (`relationship.nominalAlly = US`, flip when `us.nearWin`).

### 4.2 US / NVA / VC (correct skeletons)

Per faction: doctrine set + signature plan templates (US Train+Advise, Patrol+Advise, Sweep+AirStrike, Assault+AirLift+Assault, AirLift+Train; NVA Rally+Infiltrate, March+Infiltrate, March+Ambush, Attack+Ambush, Terror→Rally, LoC-occupation; VC Rally+Subvert, March+Subvert, Terror+Subvert, Terror+Tax, March+Ambush-from-LoC, Rally-reset→Terror) + key role selectors + the faction's top errors-to-avoid guardrails + relationship wiring (NVA/VC rival-ally per report §5.2; US/ARVN per §5.1).

### 4.3 Demotion of legacy ARVN considerations

The `arvn-evolved` flat-consideration terms that survive (projected-margin, leader-denial, etc.) are re-expressed as leaf scorers inside the relevant role-selector quality / posture `prefer` terms or the primitive fallback policy. The v2 primary consideration path for ARVN is deleted (Foundation #14), in the same change.

## 5. Phases & acceptance criteria

**Phase 1 — ARVN full.** Acceptance: (a) all §4.1 doctrines/templates/selectors/guardrails compile and bind to the ARVN seat; (b) the competence-report ARVN witnesses pass (`policy-profile-quality/`): Train+Govern separation (**`arvn-train-govern-separation.test.ts` already exists and passes from Spec 186; extend coverage to the remaining behaviors**); Govern prefers high-pop Active Support before low-pop Passive Support except emergency; US rival-risk flip when US near win; Patrol+Govern beats Train+Govern when LoCs/Econ threatened; Sweep+Raid exposes before removal; Transport refuses origin-control loss; pre-Coup posture avoids redeploy-undone Troop placement. (c) no engine/compiler diff in the ARVN phase.

**Phase 2 — US/NVA/VC skeletons.** Acceptance: per faction, doctrine set + signature combos compile and bind; at least the report's headline witnesses pass (US avoids Air Strike in populated Support unless blocking a win / uses Advise+Air Lift as force multipliers; NVA March+Infiltrate when VC base stealable and VC near win / protects Trail before Coup; VC avoids conventional Attack unless Ambush payoff / protects bases from NVA Infiltrate).

## 6. Test plan

- Profile-quality witnesses (`packages/engine/test/policy-profile-quality/`, warning-class per Appendix) for each accepted faction behavior above — constructed scenarios, property-form where possible (e.g. "Govern target population ≥ alternative unless emergency"), witness-form where seed-specific. The Train+Govern separation witness (`arvn-train-govern-separation.test.ts`) already exists from Spec 186; add the remaining faction-behavior witnesses alongside it.
- Compile/determinism: the FITL GameDef compiles byte-identically with the v3 ARVN library; no `node --test` engine regressions.
- Engine-agnosticism guard: grep assertion that no faction/action identifiers leaked into `packages/engine/src/` as a result of this spec (Foundation #1). Follow the existing lint-test convention at `packages/engine/test/unit/lint/` (e.g. `engine-agnostic-visual-config-import-boundary-policy.test.ts`).
- Docs: extend `docs/agent-dsl-cookbook.md` with authoring sections for `planTemplates`, `postureEvaluators`, and `relationships` — their first production use lands in this spec.

## 7. Foundation alignment

#1 (FITL words only in YAML) · #2 (all rule-relevant policy in GameSpecDoc/data) · #14 (legacy ARVN primary path deleted in-change) · #16 (personalities proven by witnesses, not assumed) · #20 (posture fallbacks authored explicitly).

## 8. Reassessment of the external proposal

**Kept:** the DPSA §7 faction doctrine/template/selector inventories and §10.3 ARVN-first migration sequence — they align with the competence report and are reused as the authoring checklist.

**Corrected:** DPSA presents these as evidence the engine must be replaced; here they are evidence the *authoring* layer (186/187) is sufficient — this spec adds no engine code. The migration demotes (not deletes) ARVN's evolved terms.

**Rejected:** running a fresh evolution campaign to "discover" these personalities — the competence report already specifies them; authoring is the correct path. Evolution (rejected Spec 183's structure-first idea, revived later) tunes structure *after* the authored baseline exists.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-21 (namespace `188FITLFOUFAC`; the spec's earlier `FITLPLAN` suggestion was superseded by the user-supplied namespace). ARVN phase first; US/NVA/VC skeletons follow. Pure-YAML commits; no infrastructure split needed.

- [`archive/tickets/188FITLFOUFAC-001.md`](../archive/tickets/188FITLFOUFAC-001.md) — Agent-DSL cookbook: document planTemplates/postureEvaluators/relationships authoring (covers §6 Docs) — completed 2026-05-21
- [`tickets/188FITLFOUFAC-002.md`](../tickets/188FITLFOUFAC-002.md) — Engine-agnosticism guard test — no faction/action IDs in engine/src (covers §6 Engine-agnosticism guard)
- [`tickets/188FITLFOUFAC-003.md`](../tickets/188FITLFOUFAC-003.md) — ARVN plan structure — doctrines + plan templates + role selectors (covers §4.1)
- [`tickets/188FITLFOUFAC-004.md`](../tickets/188FITLFOUFAC-004.md) — ARVN guardrails (errors-to-avoid) (covers §4.1)
- [`tickets/188FITLFOUFAC-005.md`](../tickets/188FITLFOUFAC-005.md) — ARVN posture evaluators + relationship wiring (covers §4.1)
- [`tickets/188FITLFOUFAC-006.md`](../tickets/188FITLFOUFAC-006.md) — ARVN legacy-consideration demotion + v2 primary-path deletion (covers §4.3)
- [`tickets/188FITLFOUFAC-007.md`](../tickets/188FITLFOUFAC-007.md) — ARVN profile-quality witnesses (covers §5 Phase 1, §6)
- [`tickets/188FITLFOUFAC-008.md`](../tickets/188FITLFOUFAC-008.md) — US skeleton + headline witnesses (pattern-setting) (covers §4.2, §5 Phase 2)
- [`tickets/188FITLFOUFAC-009.md`](../tickets/188FITLFOUFAC-009.md) — NVA skeleton + headline witnesses (port of 008) (covers §4.2, §5 Phase 2)
- [`tickets/188FITLFOUFAC-010.md`](../tickets/188FITLFOUFAC-010.md) — VC skeleton + headline witnesses (port of 008) (covers §4.2, §5 Phase 2)

## Outcome

_Pending implementation._
