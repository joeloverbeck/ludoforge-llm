# **Proposal Document — Adversarial Audit of FITL Agent Competence Encoding at `10aa5f0bd76e04b54f7b1e1a8b2da9fe5744fef7`**

## **1. Executive verdict**

The current Fire in the Lake AI competence encoding is **not proven competent**. It is a serious authored scaffold with real architectural support, real plan-template vocabulary, real selector/posture/relationship/guardrail machinery, and a much broader witness suite than the earlier baseline. But the proof surface still leans too heavily on **competence theater**: many tests prove that named structures exist, are bound, score a synthetic candidate, or appear as proposal alternatives. They do **not** prove that the live agent chooses competent legal moves in meaningful board states, follows plan roles through later microturns, executes a constructible turn, and improves the intended strategic property.

The repository has the right generic architecture for this round. `plan-proposal.ts` proposes and scores doctrine-aware plan alternatives; `policy-agent-plan-root.ts` selects the plan root from the published action frontier and throws if the selected root is not actually in that frontier; `plan-controller.ts` follows role-bound microturn choices with an exact → reselected → primitive policy → stable fallback ladder. The bounded compound-availability probe ranks ready/provisional/unavailable special-activity continuations. This is enough to test real behavior now. The bottleneck is not obviously generic runtime expressiveness. The bottleneck is that current tests rarely climb high enough on the proof ladder.

Repository access caveat: I could not verify the current `main` branch SHA through the Git connector helper APIs because the helper path was resolving branch/ref metadata against a different repository namespace. Exact GitHub blob/file URLs at the requested commit SHA worked, so this audit proceeds against exact-SHA fetched files at `10aa5f0bd76e04b54f7b1e1a8b2da9fe5744fef7`. I therefore **cannot honestly assert** that current `main` still equals the requested SHA. No stale code search or snippet search was used.

Bottom line: **do not declare the current agents competent**. Preserve the current architecture and many current YAML structures, but demote most structural witnesses in status, add legal-frontier behavioral fixtures, and require selected-root, microturn-role, executed-outcome, adversarial-variant, and deterministic-replay evidence for each major faction claim. Most next-round work should be **authored YAML plus stronger behavioral fixtures and test harnesses**, not engine churn.

---

## **2. Evidence and repository files inspected**

The uploaded tree manifest was used as inventory after exact-SHA blob fetches were confirmed. It lists the active FITL data files, reports, rules, scan artifacts, policy-profile-quality tests, architecture tests, determinism tests, and engine source areas used for this audit.

Core exact-SHA files inspected:

| Area | Files inspected | Audit use |
| ----- | ----- | ----- |
| Project constitution | `docs/FOUNDATIONS.md` | Non-negotiable constraints: engine agnosticism, one legal protocol, deterministic/bounded computation, constructibility, testing as proof, preview integrity. |
| Competence requirements | `reports/fitl-competent-agent-ai.md` | Requirements source: whole-turn reasoning, shared stack, Monsoon/Coup awareness, faction identities. |
| Latest remediation/iteration reports | `reports/fitl-ai-agent-competence-remediation.md`, `reports/fitl-ai-encoding-first-iteration.md` | Prior diagnosis and latest implementation intent; treated as prior art, not proof. |
| Active agent YAML | `data/games/fire-in-the-lake/92-agents.md` | Current encoding: features, modules, selectors, templates, posture, relationships, profiles. |
| Victory formulas | `data/games/fire-in-the-lake/91-victory-standings.md` | Ground truth for US/ARVN/NVA/VC margin logic. |
| Observability | `data/games/fire-in-the-lake/93-observability.md` | Public current/preview surfaces for resources, victory, active-card metadata/annotations. |
| DSL reference | `docs/agent-dsl-cookbook.md` | Supported authoring surface: strategy modules, plan templates, posture evaluators, relationships, preview refs/fallbacks, retired refs. |
| Current architecture | `plan-proposal.ts`, `plan-controller.ts`, `policy-agent-plan-root.ts`, `plan-proposal-compound-availability.ts`, `compile-agent-plan-templates.ts` | Confirms current engine can support real root selection, plan continuation, bounded compound probing, and role constraints. |
| Latest specs | Specs 201–208 | Useful for why the current structure exists; not accepted as proof. |
| Current scan artifacts | `artifacts/fitl-scan/summary.json`; `failures.ndjson` present but file fetch failed | Scan proves smoke/no warnings/no emergency fallback across 20 short seeds, not competence. |
| Representative policy-profile-quality tests | Shared, US, ARVN, NVA, VC, placeholder-selector tests and helpers | Used to classify current proof strength. |

The Fire in the Lake rules/data were used only within the requested base-game scope. Solitaire flowcharts, printed bot reproduction, Trưng bots, expansions, and optional tournament variants are non-goals.

---

## **3. Current `92-agents.md` encoding summary**

`92-agents.md` is no longer a toy policy file. It contains a broad authored library: state features, candidate features, aggregates, strategic conditions, selectors, strategy modules, relationships, guardrails, plan templates, posture evaluators, profile bindings, and preview configuration. That is a major improvement over an action-weight profile.

The victory-feature layer is aligned with the active victory standings: US scores Support plus Available US Troops/Bases; ARVN scores COIN-Controlled Population plus Patronage; NVA scores NVA-Controlled Population plus NVA Bases; VC scores Opposition plus VC Bases.

Current shared doctrine appears in YAML as:

* `shared.immediateWin`  
* `shared.blockCurrentLeader`  
* `shared.nearCoupConcreteSwing`  
* `shared.resourceLogistics`  
* `shared.eventDirectSwing`  
* `shared.allyRivalThrottle`  
* `shared.monsoonOperationalRestriction`

These are bound across the four profiles. The shared layer is structurally real, but for most shared claims the current proof is still only compiled/bound/scored, not selected/executed.

Current faction plan families are substantial:

| Faction | Current notable plan templates |
| ----- | ----- |
| US | `us.trainPacify`, `us.trainAdvise`, `us.patrolAdvise`, `us.sweepAirStrike`, `us.assaultAirLiftAssault`, `us.airLiftControlOrWithdrawal`, `us.assaultHighValueInfrastructure`; `us.eventDirectSwing` is deliberately **not** a plan template because event decisions are heterogeneous. |
| ARVN | `arvn.trainGovern`, `arvn.patrolGovern`, `arvn.sweepRaid`, `arvn.assaultRaid`, `arvn.trainTransport`, `arvn.assaultTransportAssault`. |
| NVA | `nva.rallyInfiltrate`, `nva.rallyTrail`, `nva.marchControl`, `nva.marchInfiltrate`, `nva.marchInfiltrateControl`, `nva.infiltrateVcOnlyWhenRational`, `nva.marchAmbush`, `nva.attackAmbush`, `nva.bombardCoinStack`, `nva.terrorSupportReduction`, `nva.locOccupationBeforeCoup`. |
| VC | `vc.rallySubvert`, `vc.marchSubvert`, `vc.terrorSubvert`, `vc.terrorTax`, `vc.rallyBaseNetwork`, `vc.rallyTax`, `vc.marchSpread`, `vc.attackAmbush`, `vc.agitationPrep`, `vc.marchAmbushFromLoc`. |

The active DSL cookbook supports this shape: modules are scoring data, plan templates are declarative policy data that do not create legal moves, posture evaluators must use explicit fallback contribution for unavailable preview evidence, and relationships provide ally/rival vocabulary without game-specific engine branches.

The strongest current encoding area is ARVN. ARVN has selected-plan and role-target witnesses for Train/Govern and Govern target selection. US, NVA, and VC have broader authored surface now, but several of their witnesses are still structural. A VC witness, for example, only checks that `vc.attackAmbush` is an Attack + Ambush compound template and that the conventional-Attack guardrail is bound. That proves syntax and binding, not that VC chooses Ambush-first violence in a real state.

---

## **4. Current test/witness strength audit**

The test suite is useful, but it is not yet an adequate competence proof suite.

The most important pattern: multiple faction witnesses call plan proposal with **synthetic root action decisions** instead of using the actual published legal frontier. The US helper creates an `actionSelection` decision with `{ actionId, params: {} }` and passes that to `proposeAdvisoryTurnPlan`; the ARVN helper does the same. This is fine for unit-level plan-proposal coverage, but it does not prove that the live agent faced a real legal frontier, selected the root, completed later microturns, or executed an outcome.

### **4.1 Classification of important witness types**

| Current witness class | Example | Current strength | Harsh diagnosis |
| ----- | ----- | ----- | ----- |
| Structural encoding invariant | `shared-immediate-win-us.test.ts` says the doctrine “compiles, binds, and scores.” | Ladder 1–2, sometimes synthetic 3 | Useful anti-drift check. Not a behavior proof. |
| Profile binding invariant | Shared module helper asserts profile uses/binds modules. | Ladder 2 | Good compile coverage. Cannot prove dominance or selection. |
| Proposal alternative / ranking witness | `us-train-advise-beats-plain-train` asserts `us.trainAdvise.score > us.trainPacify.score`. | Ladder 3 | Better than pure binding, but still a synthetic root proposal. |
| Structural self-admitted weak witness | `us-sweep-airstrike-prefers-zero-pop-or-trail` explicitly says Sweep/Air Strike yields no proposal at initial state, so the test is “proven as an architectural invariant.” | Ladder 2 | This is honest, but it should be demoted. It proves intent vocabulary, not safe Air Strike behavior. |
| Selected proposal / role binding witness | `arvn-train-govern-separation` selects `arvn.trainGovern` and binds distinct spaces. | Ladder 4, partial 5 | One of the better witnesses, but still not live root + executed outcome. |
| Curated role-target witness | `arvn-govern-active-support-priority` mutates support markers and asserts `can-tho:none` is selected with expected components. | Ladder 4, partial 5 | Good role-selector proof. Needs legal microturn execution and Patronage/Support outcome assertion. |
| Pure selector/template wiring | `nva-rally-improves-trail` checks template bound, root tag Rally, selector depends on `projectedTrailDelta`. | Ladder 1–2 | Non-proving. It does not show NVA improves Trail when Trail is strategically urgent. |
| VC structural doctrine wiring | `vc-terror-high-pop-non-coin-controlled` checks templates and module bind `vc.terrorHighPopTarget`. | Ladder 1–2 | It does not show Terror is selected, legal, or politically effective. |
| Placeholder drift guard | `no-placeholder-value-one-selectors` rejects scalar `value: 1` selector components. | Structural quality invariant | Valuable. It prevents one kind of selector theater, but not strategic competence. |
| Smoke/termination scan | `fitl-scan/summary.json` passes 20 seeds, 5 turns, no warnings/failures. | Ladder 9 for bounded/no-throw smoke only | Not a competence proof. It says “does not crash or emergency fallback,” not “plays well.” |

### **4.2 Current tests that are genuinely behavioral**

The genuinely behavioral tests are mostly **proposal-level** rather than **execution-level**:

* ARVN `trainGovern` selection and distinct role binding is a meaningful proposal witness.  
* ARVN Govern active-support priority is a meaningful curated role-target witness.  
* Shared Monsoon suppression is behavior-ish at the proposal stage because it creates a Monsoon-lookahead state and asserts template suppression, but it still does not execute a turn.  
* Some convergence/probe tests likely detect action-distribution problems, but Spec 208 shows a dangerous pattern: failed ARVN witnesses were later diagnosed as legitimate trajectory drift and distilled into architectural invariants. That may be correct, but it also reinforces the point that witness status must be explicit and not inflated.

### **4.3 Current tests that are weak or tautological**

The weakest tests are those that assert:

* a template id is in `profile.plan.planTemplates`;  
* a role selector id equals a named selector;  
* a guardrail id is bound;  
* a selector depends on a candidate feature;  
* a module score group has a term;  
* a strategy module score under a synthetic candidate equals an expected number.

Those checks should remain as regression guards, but they must be labelled as **structural encoding invariants**. They should not be counted as behavioral competence witnesses.

---

## **5. Proof ladder used for this audit**

For every competence claim, the strongest current proof level is classified as:

1. Not encoded.  
2. Symbol exists in YAML.  
3. Symbol is bound to the relevant profile.  
4. Plan/template/module appears as a proposal alternative.  
5. Plan/template/module is actually selected at root/action decision.  
6. Later microturn role choices match intended doctrine.  
7. Materialized move is legal and constructible.  
8. Executed turn outcome improves intended strategic property.  
9. Behavior remains correct in adversarial variants.  
10. Behavior remains deterministic and bounded under replay.

A claim at level 1–3 is not a behavioral proof. Most current FITL competence claims sit at levels 2–4. Very few reach 5. Almost none, based on the inspected witnesses, reach 7–8.

---

## **6. Harsh traceability matrix**

| Faction | Competence requirement | Current YAML encoding status | Current tests/witnesses | Current proof-ladder level | Gap diagnosis | Behavioral or ceremonial? | Proposed change | Work type | Required behavioral fixture | Required trace assertion | Priority |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Shared | Immediate own win dominates ordinary play | `shared.immediateWin` exists and is bound. | Shared immediate-win tests compile/bind/score. | 2–3 | Synthetic scoring, not legal win selection. | Mostly ceremonial. | Add one legal-state fixture per faction where one legal move wins and tempting non-win exists. | Test harness + YAML tuning | “Win now or choose bad setup” state. | doctrine → selected root → executed margin ≥ 0. | P0 |
| Shared | Block current leader / near win | `shared.blockCurrentLeader`, near-win conditions, leader deltas. | Shared block tests likely helper-based; same structural pattern. | 2–3 | No proof it blocks the right leader with the right mechanism. | Mostly ceremonial. | Add leader-specific denial fixtures: block US, ARVN, NVA, VC. | Harness + YAML | Near-win leader with at least two legal denials and one irrelevant strong move. | selected candidate reduces leader margin more than alternative. | P0 |
| Shared | Near-Coup concrete swing over speculative setup | `shared.nearCoupConcreteSwing`, `distanceToCoup`, `coupImminent`. | Shared near-Coup tests listed in manifest. | 2–3 | Needs executed Coup-relevant property, not module score. | Ceremonial until executed. | Add near-Coup fixtures for Support, Patronage, Trail/Earnings, Agitation readiness. | Harness + YAML | Coup imminent, setup tempting, concrete swing available. | selected plan changes Coup-scored value. | P0 |
| Shared | Monsoon awareness | `shared.monsoonOperationalRestriction` suppresses Sweep/March templates. | Helper asserts template suppression under Monsoon. | 3 | Good proposal-level guard; does not prove Monsoon fallback quality. | Partially behavioral. | Add “before Monsoon choose Sweep/March setup, during Monsoon choose best legal fallback” paired fixtures. | Harness + YAML | Same board with Monsoon false/true. | active doctrine suppresses forbidden family and selected root is legal fallback. | P0 |
| Shared | Resource/logistics maintenance | Shared resource module, Aid/Trail/resources deltas. | Structural/fallback integrity tests. | 2–3 | Too generic; logistics are faction-specific. | Mostly ceremonial. | Per-faction logistics fixtures: Aid/Econ, Trail, VC resources/bases. | YAML + fixtures | Low-resource state where logistics move beats margin-neutral violence. | projected ref ready or explicit fallback; executed resource/logistic improvement. | P0 |
| Shared | Event direct-swing | `shared.eventDirectSwing` exists; no event plan template because event decisions lack uniform bindable path. | Structural shared-event tests listed. | 2 | Event handling is a named module, not proven card behavior. | Ceremonial. | Use active-card annotation surfaces for direct-swing event fixtures; only propose generic architecture if annotations cannot express target quality. | YAML first; maybe architecture later | Event with direct Support/Patronage/Trail/Opposition swing vs strong op. | active-card annotation → event selected → outcome swing. | P1 |
| Shared | Ally-rival throttle | Relationships and `shared.allyRivalThrottle` exist. | Shared ally-rival tests listed. | 2–3 | Needs proof ally gain is throttled when ally near win but not otherwise. | Partial/ceremonial. | Paired ally-state fixtures for US↔ARVN and NVA↔VC. | YAML + fixtures | Same move helps ally; ally far vs near win. | relationship role flips; candidate demoted only near win. | P0 |
| Shared | Preview fallback integrity | Candidate preview fallbacks exist; observability surfaces public preview margins/resources. | Preview integrity tests listed; scan no warnings. | 9 for integrity canaries, not competence | Good architecture proof, not strategic proof. | Preserve. | Require every behavior fixture to assert preview statuses for scoring refs. | Test harness | Fixture with ready and unavailable preview variants. | ready refs influence score; unavailable refs traced, not coerced. | P0 |
| US | Support + Available US piece victory logic | US features/templates exist; victory formula correct. | `us-immediate-win-by-support`, `us-train-pacify-high-pop-support` listed; sampled US tests are proposal/structural. | 3–4 likely | Needs executed Support and Available delta. | Partially ceremonial. | Add US win fixture: Train/Pacify or withdrawal beats Assault body-count. | YAML + fixtures | US can win by Support/Available; body-count legal but inferior. | selected root improves `Support + Available`. | P0 |
| US | Train/Pacify as Support carrier | `us.trainPacify`, `us.trainSupportSpace`. | Tests listed; current sampled Train/Advise only compares alternatives. | 3 | Does not prove Pacification target is legal/executed. | Proposal-only. | Execute Train Pacify through microturns; assert Support marker changes. | Fixture + trace helper | COIN-controlled high-pop with US piece and Terror/Passive marker. | role target → Train microturn → Support delta. | P0 |
| US | Train + Advise force multiplier | `us.trainAdvise` present. | `us.trainAdvise` out-scores `us.trainPacify`. | 3 | Alternative ranking only; not live selection/execution. | Proposal-only. | Make live legal frontier fixture where Train+Advise root is selected over plain Train. | Fixture + YAML | Indigenous removal/Aid target plus Pacify-only target. | selected plan `us.trainAdvise`; Advise microturn exact role; Aid/removal outcome. | P0 |
| US | Patrol/Advise for Aid/Econ/LoC | `us.patrolAdvise`, `us.patrolLocTarget`. | `us-patrol-protects-high-econ-loc` listed. | Unknown; likely 3–4 | Needs actual LoC/Econ protection, not selector name. | Under-proven. | Add LoC sabotage/econ fixture. | Fixture + YAML | High-Econ LoC threatened; Assault body-count tempting. | Patrol selected; LoC/Econ/Aid property improves. | P1 |
| US | Sweep + Air Strike without political self-harm | `us.sweepAirStrike`, `us.airStrikeTarget`, `us.avoidPoliticalAirStrike`. | Test explicitly structural because no proposal. | 2 | Honest non-proof. | Ceremonial. | Add two fixtures: zero-pop/Trail strike selected; populated Support strike rejected. | YAML + fixtures | Zero-pop base/trail target; populated Support target. | guardrail fires/does not fire correctly; executed Support not harmed. | P0 |
| US | Air Lift mobility / Assault / control / withdrawal | `us.assaultAirLiftAssault`, `us.airLiftControlOrWithdrawal`. | Tests listed: AirLift/Assault no-control-abandonment, AirLiftTrain disabled. | 2–4 likely | Needs live microturn route and origin-control proof. | Under-proven. | Preserve current templates; add executed Air Lift route fixtures. | Fixture + maybe YAML | Air Lift enables high-value Assault without abandoning control. | root → compound availability ready → Air Lift role exact → Assault outcome. | P1 |
| US | Avoid ARVN kingmaking / low-yield body count | Guardrails exist. | Structural/guardrail tests listed. | 2–3 | Need negative fixture where legal US move hands ARVN win. | Ceremonial. | Add US refuses ARVN-near-win helper move unless US wins first. | YAML + fixtures | ARVN near win; US can help ARVN or improve own support. | ally-rival module demotes ARVN-gain move. | P0 |
| ARVN | COIN-Controlled Pop + Patronage engine | `arvn.trainGovern`, `arvn.governPatronageSpace`, `buildPoliticalEngine`. | `arvn-train-govern-separation`, `arvn-govern-active-support-priority`. | 4, partial 5 | Best current area, but no executed Patronage/Support outcome. | Partially behavioral. | Add executed Govern fixture with Patronage delta and Support damage bound. | Fixture + trace helper | Active Support vs Passive Support govern choices. | selected govern target → Govern microturn → Patronage + expected marker result. | P0 |
| ARVN | Govern without reckless Support destruction | Guardrail + active/passive selector components. | Active-support target witness. | 4 | Good selector behavior; not full outcome/adversarial. | Partial. | Add negative Passive-Support-overuse fixture. | YAML + fixtures | Patronage tempting but Support loss opens VC Rally. | guardrail/posture demotes reckless Govern. | P0 |
| ARVN | Patrol/Govern and LoC/Econ protection | `arvn.patrolGovern`, Aid/Econ modules. | Tests listed; Spec 208 previously observed plan-controller domination by `arvn.patrolGovern`. | Mixed | Risk: Patrol/Govern may dominate too broadly. | Suspicious. | Add positive and negative Patrol/Govern fixtures. | YAML + fixtures | Threatened LoC vs no-threat Patronage-only board. | selected only when LoC/Econ/control benefit exists. | P0 |
| ARVN | Transport without origin-control suicide | Transport roles + postState constraints/guardrail. | Transport tests listed. | 3–5 likely | Needs execution through Transport microturn. | Partially proven if tests execute; otherwise proposal-only. | Preserve constraints; add live Transport route fixture. | Fixture | Origin would lose control if emptied. | constraint rejects bad route; selected route preserves origin control. | P0 |
| ARVN | Sweep/Raid expose-before-removal | `arvn.sweepRaid`, selectors. | Tests listed. | 3–4 likely | Needs role continuation and removal outcome. | Under-proven. | Add hidden-base protection fixture. | Fixture + YAML | Underground guerrillas shield base. | Sweep exposes; Raid removes high-value piece/base. | P1 |
| ARVN | Pre-Coup redeploy-risk avoidance | Guardrail exists. | `arvn-precoup-posture` listed. | 3–4 likely | Needs Coup-projected redeploy outcome. | Under-proven. | Add near-Coup redeploy evaporation fixture. | Fixture | ARVN Troops can gain temporary province control but redeploy away. | candidate demoted due projected redeploy loss. | P0 |
| NVA | Trail protection/improvement, Laos/Cambodia logistics | `nva.logisticsAndTrail`, `nva.rallyTrail`, `nva.preserveTrail`. | `nva-rally-improves-trail` is structural. | 2 | Template/selector dependency only. | Ceremonial. | Add Trail-low legal-state fixture where Rally improves Trail and beats March violence. | YAML + fixtures | Trail weak before Coup; control move tempting. | Rally selected; Trail/Aid/Earnings property improves. | P0 |
| NVA | NVA Control + Bases victory logic | `nva.marchControl`, `nva.controlAndBases`, base features. | Tests listed. | 2–3 likely | Need executed NVA control/base margin. | Mostly ceremonial. | Add high-pop control swing and base-building fixtures. | Fixture + YAML | March can seize populated control; low-yield Attack available. | selected root changes NVA margin. | P0 |
| NVA | March + Infiltrate as control/conventional-force engine | Templates exist. | `nva-march-infiltrate-builds...` checks compound and selector dependencies. | 2 | It separates names, not behavior. | Ceremonial. | Add live March+Infiltrate fixture. | Fixture + YAML | March creates Infiltrate superiority; VC takeover tempting. | March role exact; Infiltrate role exact; NVA margin/control improves. | P0 |
| NVA | Infiltrate VC only when justified | `nva.infiltrateVcOnlyWhenRational`, guardrail. | Structural tests. | 2 | Critical ally-rival behavior unproven. | Ceremonial. | Paired VC-near-win and VC-not-near-win fixtures. | Fixture + YAML | Same VC base target; NVA gain/VC denial toggled. | Infiltrate selected only in justified variant. | P0 |
| NVA | Bombard high-value COIN stacks | `nva.bombardCoinStack`, guardrail. | Tests listed. | 2–3 likely | Needs removal/control outcome and avoidance of low-yield Bombard. | Under-proven. | Add concentrated-stack and decoy-stack fixtures. | Fixture + YAML | Big COIN stack vs empty low-value target. | Bombard target role; executed casualty/control effect. | P1 |
| NVA | Attack + Ambush over conventional attrition | `nva.attackAmbush`, `nva.marchAmbush`. | Tests listed. | 2–3 likely | Need live Ambush-first choice. | Under-proven. | Add Attack without Ambush negative and Attack+Ambush positive fixture. | Fixture | Ambush available; conventional Attack legal but worse. | compound availability ready; Ambush selected; removal outcome. | P1 |
| VC | Opposition + VC Bases victory logic | `vc.oppositionEngine`, `vc.rallyBaseNetwork`, `vc.terror*`. | Terror/base tests mostly structural. | 2 | Does not show Opposition/Base gain. | Ceremonial. | Add VC Terror/Base executed fixtures. | Fixture + YAML | High-pop non-COIN space with VC underground. | Terror selected; Opposition marker shifts; base count protected/created. | P0 |
| VC | Terror in high-pop non-COIN-controlled spaces | `vc.terrorHighPopTarget` bound. | Structural target-surface test. | 2 | Selector name overstates proof. | Ceremonial. | Add role-target + executed Terror fixture. | Fixture | High-pop non-COIN vs low-pop legal Terror. | selected target satisfies selector and Opposition delta improves. | P0 |
| VC | Tax for resources without political self-harm | `vc.rallyTax`, `vc.terrorTax`, tax guardrails. | Tests listed. | 2–3 likely | Need LoC Tax preferred, populated Support Tax vetoed unless necessary. | Under-proven. | Add LoC-tax positive and populated-Support negative fixtures. | Fixture + YAML | VC resources low; LoC tax and populated tax both legal. | Tax role targets LoC; Support harm avoided. | P0 |
| VC | Subvert against ARVN cubes/Patronage | `vc.rallySubvert`, `vc.marchSubvert`, `vc.terrorSubvert`. | `vc-subvert-drops-arvn-patronage` listed. | Unknown | Needs actual Patronage/cube outcome. | Under-proven. | Add ARVN-near-win Subvert fixture. | Fixture | ARVN near Patronage win; Subvert target legal. | selected Subvert drops Patronage or cube-control property. | P0 |
| VC | March spread without exposure | `vc.marchSpread`, posture `vc.preserveUndergroundAndBases`. | Tests listed. | 2–3 likely | Needs no needless exposure outcome. | Under-proven. | Add March-spread live fixture with exposure trap. | Fixture | Spread legal; exposed route legal but bad. | selected role preserves Underground/base safety. | P1 |
| VC | Ambush-first violence / avoid conventional Attack | `vc.attackAmbush`, guardrail. | `vc-attack-only-with-ambush` structural. | 2 | Does not prove VC attacks only with Ambush. | Ceremonial. | Add live Attack+Ambush vs Attack-only fixture. | Fixture | Ambush available, conventional Attack legal. | selected plan compound Ambush; no Attack-only if Ambush unavailable. | P0 |
| VC | Protect VC Bases from NVA Infiltrate | Guardrail/template modules. | Tests listed. | 2–3 likely | Needs adversarial NVA-near-win/near-infiltrate state. | Under-proven. | Add base-threat fixture. | Fixture | NVA can Infiltrate VC base next; VC has protective move. | selected move reduces Infiltrate vulnerability. | P1 |
| VC | Agitation readiness before Coup | `vc.agitationPrep`, `vc.preserveAgitationResources`. | `vc-agitation-prep-before-coup` listed. | 2–3 likely | Needs Coup-support-phase readiness outcome. | Under-proven. | Add near-Coup Agitation-ready fixture. | Fixture | Coup imminent; Terror now vs resource/position prep. | selected move increases agitation-ready population/resources. | P0 |

---

## **7. Shared-doctrine gap analysis**

### **Immediate own win**

Current encoding has the right symbol, but the witness style is too weak. A curated module-score fixture is not enough. The next suite must construct a legal board where the faction can cross its threshold and must prove the live agent selects that winning move from the published frontier. For US, this means Support + Available; ARVN means COIN-Controlled Population + Patronage; NVA means NVA-Controlled Population + NVA Bases; VC means Opposition + VC Bases. The victory formulas are explicit and should be used directly in outcome assertions.

### **Block current leader / block near win**

The current shared block module is conceptually right but under-proven. Blocking is not a generic “reduce enemy margin” action; each faction needs different denial levers. The behavioral fixtures must isolate the denial mode:

* block US by reducing Support / preventing Pacification / affecting Available-related posture;  
* block ARVN by reducing COIN Control or Patronage;  
* block NVA by removing NVA Control or Bases;  
* block VC by reducing Opposition, removing VC Bases, or preventing Agitation.

The current tests should not be allowed to pass merely because `projectedLeaderMarginDelta` exists.

### **Coup timing**

The competence report correctly states that near-Coup concrete scoring beats speculative setup. The current YAML has `distanceToCoup`, `coupImminent`, and near-Coup modules, but the proof must be outcome-driven. A near-Coup fixture must execute a turn and assert that the relevant Coup-scored property improves or the opponent’s imminent Coup margin decreases. Anything less is a naming convention.

### **Monsoon timing**

The current Monsoon suppression design is one of the better shared structures because it actively suppresses Sweep/March templates under Monsoon. But it still needs paired behavioral tests: before Monsoon, the agent should prefer Sweep/March setup when strategically correct; during Monsoon, it should choose a competent legal fallback rather than merely “not Sweep/March.”

### **Resource/logistics maintenance**

The shared resource/logistics module is too coarse. Resource maintenance is different for each faction:

* US/ARVN: Aid/Econ/LoCs and affordability.  
* NVA: Trail, bases, Laos/Cambodia infrastructure.  
* VC: Resources, bases, underground network, Agitation readiness.

The generic module should remain, but every faction needs at least one executed fixture where the agent chooses logistics over a superficially attractive violent move.

### **Event direct-swing**

The current decision to avoid `*.eventDirectSwing` plan templates is defensible because event decisions have heterogeneous card-specific surfaces and no uniform bindable `decisionPath`. The active observability file exposes active-card identity, tag, metadata, and annotation in current and preview contexts, so the first attempt should be YAML/annotation-driven, not a generic architecture change.

If event fixtures prove the current annotation surface cannot express direct swing versus trap events, then propose a **generic event-decision annotation taxonomy**, not FITL-specific engine logic.

### **Ally-rival throttle**

The relationship layer is correct in concept. It must now be proven with paired fixtures: same board, same tempting ally-helping move, ally far from win versus ally near win. The agent should cooperate in the former and throttle in the latter.

### **Preview fallback integrity**

The current preview fallback discipline is valuable and should be preserved. The suite should require every preview-driven behavioral test to assert whether the decisive preview refs were `ready`, `unknown`, `unavailable`, or explicitly fallback-traced. Spec 208’s opponent-preview diagnosis is the warning: `unknown` may be the correct integrity-preserving result, but then the behavioral witness must not silently treat it as confidence.

---

## **8. Faction-by-faction gap analysis**

### **8.1 US**

Current US encoding has the right major nouns: Support, Available US pieces, Train/Pacify, Train/Advise, Patrol/Advise, Sweep/Air Strike, Air Lift, high-value Assault, ARVN kingmaking, political Air Strike harm. But the current sampled US tests prove far too little.

`us-train-advise-beats-plain-train` is a proposal ranking witness. It does not prove that the agent selects the root from a real legal frontier or executes Advise. `us-sweep-airstrike-prefers-zero-pop-or-trail` is explicitly structural; it says Sweep/Air Strike yields no proposal at initial state and therefore proves only wiring.

US must get P0 behavioral fixtures for:

1. **Immediate win by Support/Available**: Train/Pacify or withdrawal-like availability posture beats body count.  
2. **Train/Pacify**: selected target is legal for US Train Pacification and produces Support/Terror-marker improvement.  
3. **Train+Advise**: Advise is selected when it adds Aid or indigenous removal; the executed outcome proves the force multiplier.  
4. **Safe Air Strike**: zero-pop/Trail/base strike selected; populated Support strike demoted unless decisive.  
5. **Avoid ARVN kingmaking**: US refuses a legal ARVN-helping move when ARVN is near win unless US wins first.  
6. **Air Lift**: current templates should be preserved, but not trusted until a live microturn fixture proves route selection and no control abandonment.

Strong opinion: US is the most likely faction to look “smart” while actually playing badly, because it has many spectacular tactical moves. The audit should be ruthless about low-yield body count and political self-harm.

### **8.2 ARVN**

ARVN is the best current area, but it should not be privileged. The current ARVN witnesses are better than most because they assert selected templates and role bindings. `arvn-train-govern-separation` proves `arvn.trainGovern` selection with distinct Train/Govern spaces; `arvn-govern-active-support-priority` proves a curated Govern target preference.

But even here the proof stops too early. ARVN still needs executed-outcome fixtures:

1. **Train+Govern political engine**: prove Patronage increases and Support destruction is bounded.  
2. **Govern active-vs-passive distinction**: active Support Govern should be selected when Patronage mode is available; passive-Support over-governing should be demoted when it opens insurgent opportunity.  
3. **Transport origin-control**: live Transport microturn must reject origin-control suicide.  
4. **Pre-Coup redeploy risk**: ARVN must avoid Troop deployments that evaporate in Coup redeploy.  
5. **Patrol/Govern not always**: Spec 208 shows prior ARVN windows were plan-controlled by `arvn.patrolGovern` 100% of sampled main-phase ARVN decisions. Even if that was later classified as legitimate drift, it is an audit smell. ARVN needs positive and negative Patrol/Govern fixtures.  
6. **Resisting US helper role**: ARVN must refuse to feed US Support/Available wins when ARVN is not winning.

Strong opinion: ARVN should remain the “reference faction” for plan/role proof, but its current evidence should be reclassified as **selected proposal behavior**, not full competence.

### **8.3 NVA**

The NVA encoding has a rich list of plans, but the sampled tests are mostly architectural invariants. `nva-rally-improves-trail` checks that `nva.rallyTrail` exists, roots on Rally, and depends on `projectedTrailDelta`. `nva-march-infiltrate-builds-nva-not-steal-vc` checks compound structure and selector dependencies. These are exactly the kind of tests that can produce false confidence.

NVA needs P0 behavioral fixtures for:

1. **Trail repair/protection**: Rally improves Trail/logistics when Trail is low or Coup is near.  
2. **NVA Control in population**: March into a meaningful populated control target beats low-yield violence.  
3. **March+Infiltrate**: March creates the conditions for Infiltrate; Infiltrate produces NVA gain, not random VC harm.  
4. **VC Infiltrate rationality**: Infiltrate VC only when NVA gain or VC denial justifies it.  
5. **Attack+Ambush**: Ambush-first violence selected over conventional attrition.  
6. **Bombard**: high-value COIN stack target selected; low-yield Bombard demoted.  
7. **Block VC near win**: NVA must deny VC when VC is close, even if both are insurgents.

Strong opinion: NVA’s current YAML names sound strategically mature, but the witnesses sampled are largely ceremonial. NVA should be treated as unproven until March/Infiltrate and Trail fixtures execute.

### **8.4 VC**

VC has the largest gap between strategic subtlety and proof. The YAML now names the right things: Terror, Tax, Rally/Base network, Subvert, March spread, Ambush, Agitation prep, base protection from NVA, Tax self-harm guardrails. But the sampled VC tests are structural. `vc-attack-only-with-ambush` checks that `vc.attackAmbush` is an Attack+Ambush compound and the guardrail is bound; `vc-terror-high-pop-non-coin-controlled` checks that templates bind the `vc.terrorHighPopTarget` selector. Neither proves a competent VC decision.

VC needs P0 behavioral fixtures for:

1. **Terror high-pop non-COIN-controlled**: execute Terror and assert Opposition or Support-denial improvement.  
2. **Tax intelligence**: prefer LoC Tax; demote populated Support Tax unless resource crisis justifies it.  
3. **Rally/Base network**: Rally creates a VC Base or underground network in a strategically meaningful space.  
4. **Subvert ARVN Patronage/security**: selected Subvert target drops ARVN cubes or Patronage in an ARVN-near-win state.  
5. **Ambush-first violence**: Attack+Ambush selected; conventional Attack avoided when Ambush unavailable or not worth exposure.  
6. **Agitation readiness**: near-Coup VC prepares Resources/pieces/non-COIN spaces for Agitation rather than making a flashy but irrelevant move.  
7. **Protect VC Bases from NVA Infiltrate**: paired NVA-near-win and NVA-not-near-win fixtures.

Strong opinion: VC is the most vulnerable to competence theater because “Terror,” “Tax,” and “Subvert” sound political by name. The tests must prove political outcomes.

---

## **9. Behavioral fixture and scenario recommendations**

The next round needs a **curated FITL competence scenario harness**. It should not rely on synthetic root action lists except for narrow unit tests. The harness should create a real game state, publish the real legal frontier, invoke the policy agent normally, drive the plan through microturns, execute the turn, and assert both trace and board outcome.

### **Required fixture helper capabilities**

1. **Legal frontier fixture runner**  
    Builds a state, advances to the relevant decision point, obtains the published legal `actionSelection` frontier, and asks the agent to choose normally.  
2. **Plan trace assertion helper**  
    Asserts the chain: doctrine active → template eligible → root candidate present → selected root → compound availability status → role binding → microturn exact/reselected/fallback → executed outcome.  
3. **Outcome delta helper**  
    Computes before/after deltas for:  
   * victory margins and ranks;  
   * Support/Opposition;  
   * Patronage/Aid/Trail/resources;  
   * base counts;  
   * control population;  
   * LoC sabotage/Econ;  
   * underground/active guerrilla exposure;  
   * Coup/agitation/pacification readiness.  
4. **Adversarial alternative helper**  
    Ensures at least one bad-but-legal alternative is available. The test should fail if the agent chooses it.  
5. **Preview-status assertion helper**  
    Requires every preview-derived decisive feature to be `ready` or explicitly traced as unavailable/unknown/fallback. No silent numeric certainty.  
6. **Deterministic replay wrapper**  
    Replays each curated fixture twice and asserts identical selected stable move keys, microturn decisions, trace status, and outcome deltas.

### **Fixture set by priority**

P0 fixtures:

* US immediate Support/Available win.  
* US Train/Pacify high-pop Support.  
* US Train+Advise force multiplier.  
* US avoid populated Support Air Strike.  
* US avoid ARVN kingmaking.  
* ARVN Train+Govern executed Patronage.  
* ARVN Transport origin-control preservation.  
* ARVN pre-Coup redeploy avoidance.  
* NVA Trail repair before Coup.  
* NVA March+Infiltrate NVA-gain.  
* NVA Infiltrate VC only when rational.  
* VC Terror high-pop non-COIN.  
* VC Tax LoC over populated Support.  
* VC Ambush-first Attack.  
* VC Agitation readiness before Coup.  
* Shared block-current-leader, one per faction.

P1 fixtures:

* US Patrol/Advise LoC/Econ.  
* US Air Lift Assault/control/withdrawal.  
* ARVN Sweep/Raid expose-before-removal.  
* NVA Bombard concentrated COIN.  
* NVA Attack+Ambush conventional-pressure.  
* VC Rally/Base network.  
* VC protect Bases from NVA Infiltrate.  
* Event direct-swing card fixtures.

---

## **10. Proposed authored agent-library changes**

### **10.1 Preserve**

Preserve these current structures:

* The shared doctrine module vocabulary.  
* The four profile bindings.  
* Current plan-template architecture and most plan-template ids.  
* ARVN `trainGovern` shape and Govern active-support selector logic.  
* Transport route/postState constraints.  
* Preview fallback discipline.  
* Relationships and ally-rival roles.  
* No-placeholder selector invariant.  
* Deterministic stable tie-breaking.  
* Event direct-swing as a module rather than a plan template unless event fixtures prove a generic gap.

### **10.2 Replace or strengthen**

Replace or strengthen these areas:

* Any witness-facing selector whose core “quality” is still mostly symbolic, global, or indirect.  
* Structural tests that claim behavioral competence in names/comments.  
* Overbroad plan-template suppression or enablement that can dominate action families without outcome proof.  
* Faction modules that merely add generic projected margin instead of item-local target quality.  
* Guardrails that are bound but not shown to fire in the right state and stay silent in the wrong state.

### **10.3 Concrete YAML-level recommendations**

Supported now, based on current DSL/cookbook and active specs:

* Use `stateFeatures` for durable board facts: `availableUsPieces`, `keyEconSabotageCount`, `agitationReadyPop`, `pacifiableSupportPop`, `nvaSanctuaryBaseCount`, `vcBaseThreatenedByNvaInfiltrate`.  
* Use `candidateFeatures` for preview deltas with explicit fallback: `projectedSupportDelta`, `projectedOppositionDelta`, `projectedAvailableUsDelta`, `projectedPatronageDelta`, `projectedNvaBaseDelta`, `projectedVcBaseDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedAgitationReadyDelta`.  
* Use item-local selectors rather than global margin proxies for:  
  * US Pacify target;  
  * US Air Strike target;  
  * US Patrol LoC target;  
  * ARVN Govern target;  
  * ARVN Transport origin/destination;  
  * NVA March control destination;  
  * NVA Infiltrate rational target;  
  * VC Terror high-pop target;  
  * VC Tax LoC target;  
  * VC Subvert Patronage/security target.  
* Use `postureEvaluators` for whole-turn risks: US overcommitment/political damage, ARVN Aid/redeploy, NVA Trail/VC-kingmaking, VC underground/base/resource preservation.  
* Use `relationships` for ally-rival flips, not per-faction hardcoded engine logic.  
* Use `planTemplates` only for turn shapes with bindable root/role/microturn surfaces. Do not force events into plan templates until a generic event-decision surface exists.

Likely supported but needs verification in fixtures:

* Post-state constraints that prove control preservation after Transport/Air Lift.  
* Preview features for Agitation readiness and Pacification readiness if they require derived metrics not yet synthesized.  
* Candidate-feature deltas for base counts if current token aggregate filters express the needed piece/status distinction cleanly.

Unsupported or not recommended now:

* A fictional `preview.role.*` namespace.  
* Event plan templates with no uniform decision path.  
* New preview depth/cap classes without a fixture proving current budgets cannot distinguish required behavior.  
* Any game-specific engine branch for FITL faction names.

---

## **11. Proposed test-strengthening plan**

### **11.1 Reclassify the current tests**

Every policy-profile-quality test should include a metadata classification that is enforced:

* `structural-encoding-invariant`  
* `profile-binding-invariant`  
* `proposal-alternative-witness`  
* `selected-root-behavior-witness`  
* `microturn-role-choice-witness`  
* `executed-turn-outcome-witness`  
* `adversarial-scenario-witness`  
* `deterministic-performance-canary`  
* `weak-non-proving-witness`

Tests like `us-sweep-airstrike-prefers-zero-pop-or-trail`, `nva-rally-improves-trail`, `vc-attack-only-with-ambush`, and `vc-terror-high-pop-non-coin-controlled` should be explicitly demoted to structural. They can stay, but they must not satisfy competence acceptance.

### **11.2 Add a “proof-ladder gate”**

For each major requirement, the test report should publish the highest proof-ladder level achieved. The done standard for this audit should require:

* shared immediate win/block leader: level 7 and replay level 9;  
* each faction’s primary victory engine: level 7 and replay level 9;  
* each faction’s top two signature combinations: level 6 minimum, level 7 preferred;  
* ally-rival throttles: level 8 paired adversarial variants;  
* preview-driven claims: explicit preview-status proof;  
* guardrails: positive and negative firing tests.

### **11.3 Replace synthetic-root-only tests with live-frontier tests**

Keep synthetic `proposeAdvisoryTurnPlan` tests for plan-proposal unit coverage. Add separate live tests where:

1. the kernel publishes a legal action-selection frontier;  
2. the agent’s plan proposal selects a root;  
3. `policy-agent-plan-root.ts` chooses the actual frontier move;  
4. the plan controller drives role-bound microturn choices;  
5. the move executes;  
6. the outcome is asserted.

The engine already has the contract that plan-selected roots must be present in the published frontier. Use it.

### **11.4 Strengthen negative tests**

For every “agent should do X” witness, include a bad-but-legal alternative:

* US can Air Strike a populated Support target; should refuse unless decisive.  
* ARVN can Govern Passive Support everywhere; should refuse when Support damage is reckless.  
* NVA can Infiltrate VC without NVA gain/VC denial; should refuse.  
* VC can Tax populated Support when LoC Tax exists; should refuse.  
* VC can Attack without Ambush; should refuse or demote.  
* ARVN can Transport out of an origin and lose control; should reject.

### **11.5 Keep performance secondary**

Performance canaries matter, but they must not dominate competence. Spec 207’s history is a caution: cost/probe failures can be misattributed, and reducing preview breadth can change behavior. Do not “optimize away” behavioral signal just to satisfy a timing witness.

---

## **12. Required generic architecture changes**

None should be scheduled immediately.

The current architecture can express the next required proof layer:

* legal-frontier root selection;  
* plan-template alternatives;  
* compound availability;  
* role-bound microturn continuation;  
* posture scoring;  
* relationship scoring;  
* preview fallback/status;  
* deterministic replay.

The next changes should therefore be YAML authoring plus test harness work. A generic architecture change becomes justified only if a concrete behavioral fixture proves one of these cannot be expressed.

Potential future generic architecture candidates, only if proven necessary:

1. **Event decision annotation taxonomy**  
    If active-card annotation surfaces cannot let the policy distinguish direct-swing events from traps, add a game-agnostic event-decision annotation/role surface. Do not add FITL-specific event logic.  
2. **Reusable executed-turn competence harness**  
    This is test infrastructure, not runtime architecture. It should be game-agnostic: construct state, run policy through legal frontier, execute, assert outcome deltas and trace chain.  
3. **Derived readiness metrics**  
    If Agitation/Pacification readiness cannot be expressed through current features/aggregates, add generic derived-metric support rather than faction-specific helpers.  
4. **Preview reachability diagnostics**  
    If preview-driven fixtures fail because refs are unknown, improve diagnostics first. Do not add new cap classes until a fixture proves the current bounded preview cannot distinguish a required competent choice.

---

## **13. Risks, sequencing, and recommended implementation order**

### **Risks**

The main risk is false confidence. Current structure names are good enough to fool reviewers: `nva.infiltrateVcOnlyWhenRational`, `vc.terrorHighPopTarget`, `us.assaultHighValueInfrastructure`, and `shared.immediateWin` sound like competence. They are not competence until they select and execute the right move in the right state.

A second risk is brittle overfitting. Curated scenarios must avoid asserting a single arbitrary stable key when several moves are strategically equivalent. Assert strategic properties and adversarial dominance, not cosmetic identity.

A third risk is preview misuse. Unknown or unavailable preview must remain unknown/unavailable. A test that expects preview certainty where the bounded engine cannot provide it should be diagnosed or distilled, not coerced.

### **Sequencing**

1. **Reclassify current witnesses**  
    Label every current policy-profile-quality test by proof category. Demote structural tests.  
2. **Build the live-frontier behavioral harness**  
    This is the enabling step. Without it, the next YAML changes will again be hard to prove.  
3. **Add P0 shared fixtures**  
    Immediate win, block leader, near-Coup concrete swing, Monsoon paired behavior, ally-rival paired behavior.  
4. **Add P0 faction fixtures**  
    Prioritize US Support/Available, ARVN Train/Govern execution, NVA Trail/March+Infiltrate, VC Terror/Tax/Ambush/Agitation.  
5. **Tune/replace YAML only where a fixture fails**  
    Do not churn for aesthetics. Rewrite selectors/modules/templates only when a fixture exposes ceremonial encoding or wrong behavior.  
6. **Add adversarial variants**  
    Convert every positive fixture into at least one negative/bad-alternative fixture.  
7. **Add replay/performance canaries for the curated corpus**  
    Deterministic replay and bounded cost are final gates, not substitutes for behavior.

---

## **14. Explicit non-goals and exclusions**

This proposal excludes:

* solitaire flowcharts;  
* printed non-player faction bot reproduction;  
* Trưng bots;  
* expansions;  
* optional tournament variants unless already intentionally encoded as base-game behavior;  
* broad online FITL strategy research;  
* new preview depth/cap classes without behavioral proof;  
* game-specific engine logic;  
* compatibility shims for old agent DSL surfaces;  
* implementation tickets or code changes.

---

## **15. Final recommendation**

Proceed with a **behavior-first competence proof round**, not another generic engine round.

The current `92-agents.md` should be treated as a strong draft library, not a validated competent agent. Preserve the good structure, especially the shared doctrine layer, relationship vocabulary, posture evaluators, plan templates, plan controller architecture, preview fallback discipline, and no-placeholder selector invariant. But stop allowing structural witnesses to count as proof.

The new acceptance standard should be:

* production spec compiles;  
* no illegal/non-constructible agent moves;  
* live legal-frontier selected-root tests for each major claim;  
* microturn role choices follow the selected plan;  
* executed outcomes improve the relevant strategic property;  
* adversarial variants prove the agent avoids bad-but-legal alternatives;  
* preview evidence is ready or explicitly unavailable/unknown, never silently coerced;  
* deterministic replay remains stable;  
* smoke/performance canaries stay green but do not replace behavior.

If the agents pass that standard, the project can credibly claim base-game FITL faction competence. At the current commit, the honest verdict is: **architecturally capable, authorially ambitious, partially behaviorally witnessed, but not yet proven competent.**

