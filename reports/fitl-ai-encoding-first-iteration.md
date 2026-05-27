# **Proposal to Complete Base-Game Fire in the Lake AI Agent Competence Encoding**

## **1. Executive verdict**

The current architecture is good enough. The remaining work should be treated as **authored agent-library completion**, not as another generic engine overhaul.

The active `92-agents.md` at the requested commit already contains the right modern vocabulary: state features, candidate features, aggregates, strategic conditions, selectors, strategy modules, guardrails, posture evaluators, relationships, plan templates, profile bindings, preview configuration, and microturn-aware plan execution. The architecture can express doctrine-gated whole-turn plans, root selection, compound special-activity availability, role-bound target choices, post-state constraints, posture scoring, preview fallback discipline, and observer-safe traces. That is the hard part.

The authored file is not yet a complete competence encoding. It is a strong but transitional scaffold: ARVN has the most mature behavioral structure; US, NVA, and VC have some meaningful skeletons and witnesses, but their coverage is thinner; many strategic requirements from `fitl-competent-agent-ai.md` remain weakly represented as generic margin scoring, placeholder-ish selector components, or incomplete plan families. The correct next move is to turn `92-agents.md` into a coherent four-faction competence library rather than layering more ad hoc weights on top of the current structure.

One verification caveat: I could verify repository metadata for `joeloverbeck/ludoforge-llm` and its default branch name `main`, and I inspected commit-pinned files at `c30b742d7b0e828d296091b8b6f3108e47996a52`. The Git connector available here did not expose the current `main` branch ref SHA for this repository; its branch/commit helper calls were not reliable for this repo. I therefore cannot honestly assert that current `main` still equals `c30b742d7b0e828d296091b8b6f3108e47996a52`. This proposal is pinned to the requested SHA and uses the uploaded manifest only as inventory. Repository metadata confirms the installed repository name/full name and default branch, but not the current branch commit SHA.

Final recommendation: **do not propose new preview depth classes or generic runtime changes now**. Complete the four-faction YAML and tests first. Only add architecture if a concrete YAML authoring attempt proves that a required behavior cannot be expressed with the current DSL.

---

## **2. Evidence and repository files inspected**

I used the uploaded tree manifest as the path inventory for the requested commit.

Core source-of-truth files inspected:

* `docs/FOUNDATIONS.md`, which makes engine agnosticism and GameSpecDoc/YAML ownership non-negotiable: kernel/compiler/runtime must not hardcode FITL logic, and rule-authoritative data belongs in GameSpecDoc assets.  
* `reports/fitl-competent-agent-ai.md`, which defines base-game competence for US, ARVN, NVA, and VC, explicitly excluding bot reproduction, expansions, Trưng bots, and tournament variants. It also states that the report is a requirements document, not an implementation formula.  
* `data/games/fire-in-the-lake/92-agents.md`, the current authored agents file. It already contains shared margin features, resource features, strategic conditions, selectors, and per-faction selector/module vocabulary, but the inspected portion also shows a mix of mature ARVN structures and weaker generic selectors.  
* `data/games/fire-in-the-lake/91-victory-standings.md`, which defines the four victory formulas: US Support + Available US Troops/Bases, ARVN COIN-Controlled Population + Patronage, NVA NVA-Controlled Population + NVA Bases, and VC Opposition + VC Bases.  
* `data/games/fire-in-the-lake/93-observability.md`, which makes most FITL policy surfaces public for the current player, including public preview access for resources and victory margins/ranks, with explicit hidden-sampling rules.  
* `docs/agent-dsl-cookbook.md`, which describes the production-safe post-microturn DSL shape: move-scoped published-frontier scoring, microturn-scoped option scoring, strategy modules, plan templates, posture evaluators, relationships, explicit preview fallback, and retired pre-microturn ref families.  
* FITL rules/data under `rules/fire-in-the-lake/` and `data/games/fire-in-the-lake/`, especially Operations, Special Activities, Coup phases, Monsoon restrictions, and action/pipeline definitions.  
* Agent/compiler/runtime architecture files under `packages/engine/src/agents/`, `packages/engine/src/cnl/`, and `packages/engine/src/kernel/`, especially plan proposal, plan controller, plan role constraints, compound availability, preview runtime, strategy-module compilation, relationship compilation, posture compilation, and agent integration.  
* Current policy-profile-quality and architecture/determinism witnesses, including US, ARVN, NVA, VC behavior witnesses, cross-family plan trace tests, preview-integrity tests, observer-safety tests, and FITL PolicyAgent determinism canaries.

No broad online FITL strategy research was redone.

---

## **3. Current architecture/source summary**

The architecture now has the right shape for competent FITL agents.

The compiler lowers an `agents:` section into a schema-versioned policy catalog with parameter definitions, compiled library buckets, profiles, bindings, selector caps, and observer-derived surface visibility. It knows about strategy modules, selectors, guardrails, turn-shape evaluators, posture evaluators, relationships, plan templates, and preview continuation cap classes.

Plan templates are now first-class enough for FITL’s “operation plus special activity plus targets” problem. A template can match a root by action tags or action ids, declare compound special tags and timing, bind roles through selectors, impose constraints, declare microturn steps, attach posture, and specify fallback behavior. Supported role constraints include `notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, and bounded `postState` predicates.

Runtime plan proposal is doctrine-aware. It collects root candidates from the published action-selection frontier, activates doctrine modules, filters eligible templates, binds role targets, records constraint rejections, checks posture, scores alternatives, and selects a root. The selected root is then chosen by stable move key from the already-published legal frontier, not by inventing a move.

The plan controller follows the selected plan across later microturns. It first tries an exact role-bound match, then a reselection within the same role, then the primitive policy decision, then a stable frontier fallback. That is the right failure ladder: plan intent is strong, but legality and published-frontier authority still win.

Compound availability is intentionally bounded. The proposal-time probe checks whether a root can plausibly grant the requested special activity, but it uses a tight one-microturn-style budget and classifies uncertain continuations as provisional rather than pretending certainty. That is exactly the right Foundation-aligned stance.

Preview has explicit typed unavailability: random, hidden, unresolved, failed, depth cap, post-grant cap, free-operation cap, grant-flow partial, no preview decision, and gated. It exposes preview state, outcome, drive trace, grant-flow segments, and fallback metadata. Current tests already prove unavailable preview contributions are not silently coerced into zero and that selection after no preview signal is explicitly traced.

Observer safety has proof coverage beyond FITL. The current architecture tests cover hidden token filtering across selector sources, production Texas Hold’em hidden deck behavior, preview provenance fallback, posture fallback status, and plan trace vocabulary that avoids hidden-id leakage.

The existing behavior witnesses show the architecture is being used, but unevenly. US has witnesses for `us.trainAdvise` and `us.sweepAirStrike`; ARVN has strong plan witnesses for `arvn.trainGovern`; NVA has logistics/trail witnesses; VC has an ambush-restraint witness. These are good signs, but they are not a full competence suite.

---

## **4. Traceability matrix**

| Faction | Competence requirement | Source/evidence | Current encoding status | Current file/symbols involved | Gap diagnosis | Proposed change | YAML-only or architecture | Test/witness requirement | Priority |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Shared | Immediate own win and block immediate enemy win | Competence report universal stack; victory standings define all margins. | Partial | `selfMargin`, named margin features, projected margins, standing-role aggregates in `92-agents.md`. | Margin features exist, but doctrine should explicitly outrank ordinary efficiency when a win/block is concrete. | Add shared `immediateWin`, `blockCurrentLeader`, and `nearWinDenial` modules consumed by all four profiles. | YAML-only | Four curated win witnesses and four block-leader witnesses; selected candidate must improve own threshold or reduce leader margin. | P0 |
| Shared | Evaluate composed turns, not isolated operations | Report requires whole operation + special sequencing; rules allow special activities before/during/after operations. | Good architecture, partial content | Plan templates, compound availability, plan controller. | Existing content covers some skeletons, not full faction parity. | Expand per-faction plan families for common Op + Special pairings. | YAML-only | Trace must show doctrine → plan template → root → compound availability → role target → microturn decision. | P0 |
| Shared | Monsoon awareness | Rules encode Sweep/March restrictions, Air Strike/Air Lift caps, pivotal block. | Weak/implicit | Legality prevents illegal moves; agent doctrine still needs pre-Monsoon and Monsoon personality shift. | Agents may merely accept legality rather than anticipate loss of Sweep/March. | Add `isMonsoon`, `nextCoupNear`, `sweepMarchUnavailableSoon`, `monsoonFallback` features/modules. | YAML-only | Scenario where Sweep/March setup is preferred before Monsoon but not during Monsoon. | P0 |
| Shared | Coup awareness | Coup phases: victory, resources, support, redeploy, commitment, reset. | Partial | Some NVA/ARVN pre-Coup witnesses exist. | Needs systematic treatment for all four factions. | Add near-Coup posture modules: concrete scoring over speculative setup; resources/redeploy/agitation/pacification readiness. | YAML-only | One near-Coup witness per faction plus one “do not choose speculative setup over concrete Coup swing” witness. | P0 |
| Shared | Resource/logistics maintenance | Report and rules: Aid/Econ, Trail, bases/resources, LoC sabotage. | Partial | `selfResources`, NVA logistics skeletons, ARVN resource tests. | Global resource feature is too coarse; logistics are faction-specific. | Add Aid, Econ, Trail, base-count, sabotage, resource-floor, and available-piece features. | YAML-only | Profile-quality resource-floor witnesses for US/ARVN/NVA/VC. | P0 |
| Shared | Ally-rival risk | Report says nominal allies can become rivals; compiler supports relationships. | Partial | Conditions `usNearWin`, `arvnNearWin`, `nvaNearWin`, `vcNearWin`; some ARVN/VC/NVA tests. | Relationship layer should be symmetrical and visible for all four factions. | Add full relationship bindings: US↔ARVN and NVA↔VC nominal ally plus kingmaker-risk flip. | YAML-only | Rival-flip witness for each alliance direction. | P0 |
| Shared | Event handling as first-class decision | Competence report says Events can override normal rules and must not be fallback-only. | Weak/underspecified | `eventWeight` parameter; observability exposes active-card identity/tag/metadata/annotation. | The report does not define a card-by-card event valuation taxonomy. | Add generic event module using existing active-card annotation/value surfaces; avoid card-specific engine logic. | YAML-only unless annotation surface proves insufficient | Event-over-op witnesses for direct margin, resource, denial, and eligibility events. | P1 |
| US | Balance Support with Available US pieces | US victory formula; report’s US identity; rules commitment phase. | Partial | US margin features; `us-baseline`; some US plan witnesses. | Needs explicit availability/overcommitment posture, not just projected margin. | Add `availableUsPieceCount`, `projectedAvailableUsDelta`, `usOvercommitmentRisk`, `usSupportPacifyPriority`. | YAML-only | US chooses high-support/availability improvement over low-yield body-count removal. | P0 |
| US | Safe Air Strike; avoid political damage | Air Strike shifts populated spaces toward Opposition. | Present but narrow | `us.avoidPoliticalAirStrike`, `us.sweepAirStrike`. | Good skeleton; should generalize to all Air Strike plan families. | Preserve guardrail; add posture for populated Support/Opposition loss and Trail-degrade value. | YAML-only | Existing witness plus scenarios for zero-pop Trail strike and populated Support refusal. | P0 |
| US | Train + Advise as force multiplier | Advise may accompany Train/Patrol and add Aid/use indigenous forces. | Present but narrow | `us.forceMultiplier`, `us.trainAdvise`. | Needs richer selectors: Irregular/Ranger removal, Aid need, ARVN substitution. | Expand `us.adviseTargetSpace`, `us.trainSupportSpace`, and posture around Aid and Support. | YAML-only | Train+Advise beats plain Train when indigenous removal/Aid swing exists. | P0 |
| US | Air Lift before Assault/Train when mobility unlocks value | Air Lift moves US and selected allied pieces, Monsoon-restricted. | Likely incomplete; one witness explicitly excludes `us.airLiftTrain`. | Some current structure avoids unsupported template. | Air Lift is strategically central but may be under-authored. | Add `us.airLiftAssault`, `us.airLiftControl`, and only add `us.airLiftTrain` if current microturn surface can prove legality. | YAML-only unless timing cannot be expressed | Mobility witness: Air Lift creates legal high-value Assault/Control without abandoning key control. | P1 |
| US | Protect Aid/Econ/LoCs | Rules define ARVN earnings/Econ and US spending floor. | Weak | Generic resource features; Patrol selectors likely present but not deeply witnessed. | US should Patrol/Advise/Train to keep COIN economy alive. | Add `us.protectAidEcon` module and LoC/Econ selectors. | YAML-only | US Patrol witness: protects high-Econ LoC over low-yield removal. | P1 |
| ARVN | Build Patronage/control engine through Train + Govern | ARVN formula; Govern rules; current witness. | Strongest current area | `arvn.trainGovern`, `arvnPoliticalTargetOpportunity`, `arvn.governPatronageSpace`. | Preserve, but improve selectors so they are local and state-specific rather than global/simple. | Refine selectors and posture; keep template. | YAML-only | Existing separation witness plus active-support/patronage yield witness. | P0 |
| ARVN | Avoid redeploy undo before Coup | Coup redeploy moves ARVN Troops from LoCs/provinces without COIN Bases. | Present but should expand | `arvn-precoup-posture-avoids-redeploy-undone.test.ts` in manifest; ARVN selectors visible. | Needs broader posture for all ARVN movement plans. | Add `arvn.redeploySafety` posture hook to Transport, Sweep, Assault, and Train plans. | YAML-only | Pre-Coup ARVN refuses plan that gains temporary control but will redeploy away. | P0 |
| ARVN | Transport without origin-control suicide | Transport rules; current transport tests in manifest. | Present | `arvn.transportOrigin`, `arvn.transportDestination`, reachable constraints. | Preserve and strengthen with item-local origin/destination control checks. | Keep reachable/distinct constraints; add postState origin-control guard. | YAML-only | Transport origin-control-loss rejection and reachable rejection remain. | P0 |
| ARVN | Sweep/Raid expose-before-removal | Raid rules; current witness in manifest. | Partial | `arvn.sweepToExposeSpace`, `arvn.raidRemovalTarget`. | Needs stronger target valuation for bases, underground guerrillas, and control swing. | Add `arvn.sweepRaid` plan posture and local enemy/base/underground features. | YAML-only | Sweep+Raid chooses exposure/removal plan over plain Assault when guerrillas protect bases. | P0 |
| ARVN | US ally-rival risk | Report requirement; relationship compiler supports kingmaker risk. | Partial | `usNearWin`; `arvn-us-rival-risk-flip.test.ts` in manifest. | Needs full relationship-driven scoring, not isolated condition. | Add `arvn.usNominalAlly`, `arvn.usKingmakerRisk`, and module penalties for pure US margin gains. | YAML-only | ARVN refuses a move that hands US immediate win unless it wins first. | P0 |
| NVA | Trail and Laos/Cambodia logistics | Trail affects Rally, March, Infiltration, earnings. | Present but not complete | `nva.logisticsAndTrail`, `nva.rallyInfiltrate`, `nva.locOccupationBeforeCoup`, `nva.protectLogisticsAndBases`. | Good skeleton; needs more direct Trail/Earnings/base defense selectors. | Add `nva.trailWeak`, `nva.baseLogistics`, `nva.laosCambodiaSafety` features and posture. | YAML-only | Existing witness plus Trail-at-risk before Coup scenario. | P0 |
| NVA | March + Infiltrate to build control and conventional force | NVA March and Infiltrate rules. | Partial | `nva.rallyInfiltrate`; `nva-march-infiltrate-steal-vc-base` in manifest. | Needs better distinction between building NVA force and stealing VC assets. | Add separate `nva.marchInfiltrateControl`, `nva.rallyInfiltrateBuild`, `nva.infiltrateVcOnlyWhenRational`. | YAML-only | NVA steals VC base only when own gain/VC denial justifies ally harm. | P0 |
| NVA | Bombard/Attack/Ambush competence | Bombard and Ambush rules. | Weak | Unknown from inspected current tests except logistics. | Current witnesses do not prove tactical NVA violence is competent. | Add `nva.bombardCoinStack`, `nva.attackAmbush`, `nva.marchAmbush` plans. | YAML-only | Bombard high-value US/ARVN stack; Attack+Ambush avoids attrition and removes critical piece. | P1 |
| NVA | Deny VC ally when VC near win | VC/NVA ally-rival requirement; victory formulas. | Partial | `vcNearWin`; relationship support exists. | Needs explicit relationship flip and plan suppression. | Add `nva.vcNominalAlly`, `nva.vcKingmakerRisk`, suppress plans that improve VC margin when VC near win. | YAML-only | NVA blocks VC near-win even if nominally allied. | P0 |
| VC | Build Opposition and VC Bases | VC victory formula; Terror/Agitation rules. | Partial | VC profile and some modules exist; inspected test focuses Ambush. | Needs systematic Rally/Terror/Agitate engine. | Add `vc.oppositionEngine`, `vc.baseNetwork`, `vc.agitationReadiness` modules and selectors. | YAML-only | VC chooses Terror/Agitate setup in high-pop non-COIN-controlled space near Coup. | P0 |
| VC | Fund economy through Tax | Tax rules. | Likely weak | `taxWeight` parameter exists; plan coverage uncertain. | Tax should be composed with Terror/Rally/March, not flat bonus only. | Add `vc.terrorTax`, `vc.rallyTax`, `vc.marchTax` plans and tax-space selector. | YAML-only | VC inserts Tax when it enables additional Terror/Rally or preserves Agitation resources. | P1 |
| VC | Subvert ARVN Patronage/cubes | Subvert rules. | Likely weak | No inspected witness. | Important denial vector against ARVN is under-proven. | Add `vc.subvertPatronage` module and `vc.rallySubvert` / `vc.terrorSubvert` templates. | YAML-only | VC chooses Subvert when it drops Patronage or removes ARVN control pieces near ARVN win. | P1 |
| VC | Avoid conventional Attack without Ambush | Attack/Ambush rules and current witness. | Present | `vc.avoidConventionalAttackWithoutAmbush`, `vc.marchAmbushFromLoc`. | Good skeleton; expand to Attack+Ambush and LoC-adjacent targeting. | Preserve guardrail; add `vc.attackAmbush` and road/river target selectors. | YAML-only | Existing witness plus Attack+Ambush target selection witness. | P0 |
| VC | Protect VC Bases from NVA Infiltrate | NVA Infiltrate can replace VC pieces; VC/NVA rivalry. | Partial | `vc-protects-bases-from-nva-infiltrate.test.ts` in manifest. | Needs relationship-driven posture, not isolated guardrail. | Add `vc.nvaKingmakerRisk` and base vulnerability feature. | YAML-only | VC avoids exposing/abandoning bases to NVA Infiltrate when NVA near win. | P0 |

---

## **5. Faction-by-faction gap analysis**

### **US**

The US needs the most conceptual sharpening. The current file has meaningful US skeletons: `us.trainAdvise`, `us.sweepAirStrike`, `us.forceMultiplier`, and `us.avoidPoliticalAirStrike` are already witnessed. That is good. But the US competence target is bigger than “Train+Advise” and “safe Air Strike.”

The US should be encoded as an expeditionary stabilizer: Support first, Available US pieces second, force only when it creates political or denial value. The victory formula confirms the tension: US wins from Support plus Available US Troops/Bases, so overcommitment can be self-defeating even when it improves the board tactically.

Missing or weak US encoding:

* A clear **availability/overcommitment posture**: avoid committing or retaining US pieces on map unless they materially defend Support, deny NVA/VC, or enable Pacification.  
* A stronger **Support engine**: select Pacification spaces by population, current support/opposition, Terror markers, COIN Control, and legality, not just generic projected margin.  
* **Air Lift as force projection and withdrawal**, not merely a generic special activity. The current witness explicitly expects `us.airLiftTrain` not to be enabled, which is sensible if that turn shape is not yet safely expressible, but Air Lift still needs competence coverage through Assault/control/withdrawal templates.  
* **Aid/Econ/LoC protection** as a US concern. The US does not spend its own resources, but ARVN Resources and Econ directly constrain US spending and COIN tempo.  
* **ARVN kingmaker risk**: the US should keep ARVN functional, but not feed Patronage/control if ARVN is about to win.

Recommended US plan families:

* `us.trainAdvise`  
* `us.trainPacify`  
* `us.patrolAdvise`  
* `us.sweepAirStrike`  
* `us.airLiftAssault`  
* `us.airLiftControlOrWithdrawal`  
* `us.assaultHighValueInfrastructure`  
* `us.eventDirectSwing`

`us.airLiftTrain` should remain disabled until a witness proves the current root/compound/step surface can bind “Air Lift before Training to make Pacification legal” without hidden search or illegal construction. That is not a reason for architecture work yet; it is a reason for a narrow authoring experiment and witness.

### **ARVN**

ARVN is currently the best represented faction. The existing `arvn.trainGovern` witness proves distinct Train/Govern roles, production compilation determinism, and plan-template use. The manifest also shows current witnesses for Patrol/Govern, pre-Coup redeploy posture, Sweep/Raid, Transport, and US rival risk.

The problem is not absence of ARVN direction. The problem is that the ARVN authoring appears to have grown as the proving ground for the architecture. It should now be cleaned into a doctrine library rather than left as a pile of historical scaffolding.

ARVN should be encoded around:

* build Patronage/control without collapsing Support too carelessly;  
* preserve Aid/resources enough to keep COIN actions affordable;  
* use Train + Govern when the political engine is behind;  
* use Patrol/Govern when LoCs and Econ are threatened;  
* use Sweep/Raid and Assault/Raid for high-value insurgent targets;  
* use Transport for real control/reinforcement, not origin suicide;  
* avoid pre-Coup moves that redeploy away;  
* treat US as ally until US is close to victory.

Most ARVN gaps are quality gaps, not missing primitives. The visible selectors include useful names, but several components are generic or not item-local enough. For example, a selector component that scores every selected zone with a constant `1` or uses a global `coinControlPop` feature is not a real target valuation; it is a placeholder. That kind of structure should be replaced when the role can be grounded in `lookup` and `zoneProp`.

Recommended ARVN plan families:

* preserve `arvn.trainGovern`;  
* preserve and strengthen `arvn.patrolGovern`;  
* preserve and strengthen `arvn.sweepRaid`;  
* preserve and strengthen `arvn.transportControl`;  
* add or strengthen `arvn.assaultRaid`;  
* add `arvn.trainPacifyCoupPrep`;  
* add `arvn.eventPoliticalSwing`.

### **NVA**

NVA has encouraging skeletons, especially around logistics. The current NVA witness proves `nva.logisticsAndTrail`, `nva.rallyInfiltrate`, `nva.locOccupationBeforeCoup`, `nva.protectLogisticsAndBases`, resource-floor posture, and LoC occupation components. That is a good start.

But NVA competence requires more than Trail protection. NVA should be encoded as a conventional/logistics insurgent:

* protect and improve Trail;  
* build NVA Bases and Troops;  
* take NVA Control in populated spaces;  
* use Laos/Cambodia and Trail mobility;  
* March + Infiltrate when it builds NVA strength or control;  
* Infiltrate VC only when it improves NVA or denies VC near-win, not as automatic ally cannibalism;  
* Bombard high-value COIN stacks;  
* Attack/Ambush when it removes key pieces without unacceptable attrition;  
* avoid feeding VC victory.

The most important NVA gap is the **VC-rival filter**. `Infiltrate` can replace VC pieces, including bases/tunnels, but doing so is only competent when it helps NVA or blocks VC. If the agent simply rewards NVA piece gain without accounting for alliance-rival posture, it will sometimes look malicious or stupid rather than strategic. The relationship layer is the right solution.

Recommended NVA plan families:

* `nva.rallyTrail`  
* `nva.rallyInfiltrate`  
* `nva.marchControl`  
* `nva.marchInfiltrate`  
* `nva.marchAmbush`  
* `nva.attackAmbush`  
* `nva.bombardCoinStack`  
* `nva.terrorSupportReduction`  
* `nva.eventLogisticsOrControlSwing`

### **VC**

VC has at least one strong skeleton: current tests prove `vc.avoidConventionalAttackWithoutAmbush`, `vc.fundAndAmbushCarefully`, and `vc.marchAmbushFromLoc`. That is correct: VC should avoid fair fights and prefer underground guerrilla leverage.

But VC is probably still under-encoded. VC competence should be an Opposition/base/resource engine:

* build and protect VC Bases;  
* spread and preserve Underground guerrillas;  
* Terror high-pop or strategically useful spaces;  
* Tax when it funds future Terror/Rally/Agitation;  
* Subvert ARVN cubes and Patronage when ARVN is a threat;  
* Ambush before conventional Attack;  
* avoid exposing Underground guerrillas unless the payoff is worth it;  
* protect VC Bases from NVA Infiltrate when NVA is a rival;  
* prepare for Coup Agitation with resources, VC pieces, and non-COIN Control.

The biggest VC gap is **Coup-support-phase thinking**. VC’s Terror turn is only half the story; the agent must value whether Terror, Tax, March, or Rally creates Agitation-ready spaces before the next Coup.

Recommended VC plan families:

* `vc.rallyBaseNetwork`  
* `vc.rallyTax`  
* `vc.terrorTax`  
* `vc.terrorSubvert`  
* `vc.marchSpread`  
* `vc.marchAmbushFromLoc`  
* `vc.attackAmbush`  
* `vc.agitationPrep`  
* `vc.eventOppositionOrResourceSwing`

---

## **6. Proposed authored agent-library changes**

### **6.1 Preserve these current structures**

Preserve:

* The four baseline profile identities: `us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`. Current tests already load these names directly.  
* The modern `agents.library` buckets and `profiles`/`bindings` shape described by the cookbook.  
* Existing high-value witnesses and their corresponding symbols:  
  * `us.trainAdvise`  
  * `us.sweepAirStrike`  
  * `us.avoidPoliticalAirStrike`  
  * `arvn.trainGovern`  
  * `nva.rallyInfiltrate`  
  * `nva.locOccupationBeforeCoup`  
  * `nva.protectLogisticsAndBases`  
  * `vc.avoidConventionalAttackWithoutAmbush`  
  * `vc.marchAmbushFromLoc`  
* Existing preview fallback discipline and explicit observer model.  
* Current cap classes unless a new witness proves a bounded-expression failure.

### **6.2 Replace or clean up these current structures**

Replace:

* Placeholder selector components that score all items with constants when a real local feature is available.  
* Global features used as local target quality, such as scoring every zone by a global population/control total instead of looking up that zone’s population/control/support/enemy contents.  
* Generic action weights that are not doctrine-gated. `rallyWeight`, `taxWeight`, `governWeight`, `trainWeight`, `sweepWeight`, and `assaultWeight` are acceptable as fallback tuning knobs, but they should not be the primary strategic encoding.  
* Any profile logic that preserves historical ARVN-specific architecture experiments if it no longer improves competence, clarity, testability, traceability, or Foundation alignment.

Do not churn names for aesthetics. Rename only where a symbol’s name lies about its doctrine or where old scaffolding makes tests harder to read.

### **6.3 Shared state features to add or strengthen**

Supported now, based on current ref families and cookbook examples:

stateFeatures:  
 selfMargin: ...  
 usMargin: ...  
 arvnMargin: ...  
 nvaMargin: ...  
 vcMargin: ...  
 selfRank: ...  
 currentLeaderMargin: ...  
 nearestThreatMargin: ...

 aid:  
   type: number  
   expr: { ref: var.global.aid }

 patronage:  
   type: number  
   expr: { ref: var.global.patronage }

 trail:  
   type: number  
   expr: { ref: var.global.trail }

 selfResources:  
   type: number  
   expr: { ref: var.player.self.resources }

 arvnResources:  
   type: number  
   expr: { ref: var.seat.arvn.resources }

 vcResources:  
   type: number  
   expr: { ref: var.seat.vc.resources }

 nvaResources:  
   type: number  
   expr: { ref: var.seat.nva.resources }

 coinControlPop:  
   type: number  
   expr: { ref: metric.auto:victory:controlledPopulation:coin }

 nvaControlPop:  
   type: number  
   expr: { ref: metric.auto:victory:controlledPopulation:solo }

 # Schedule refs are supported by the current DSL cookbook; exact id names  
 # should be verified against compiled phaseBoundary ids.  
 distanceToCoup:  
   type: number  
   expr:  
     ref: schedule.distance.toPhase.coupVictory.cards

Likely supported but must be verified against current metric/ref ids:

* total Support;  
* total Opposition;  
* VC base count;  
* NVA base count;  
* Available US Troops/Bases count;  
* sabotaged Econ;  
* active Terror/Sabotage marker counts;  
* ARVN Troops in redeploy-risk spaces;  
* VC Underground guerrilla count;  
* NVA bases in Laos/Cambodia;  
* COIN-Controlled Laos/Cambodia flag.

If these are not already metrics, prefer adding derived metrics in game data or synthesized policy metrics over pushing FITL-specific logic into engine code.

### **6.4 Shared candidate features**

Supported now:

candidateFeatures:  
 projectedSelfMargin:  
   type: number  
   expr:  
     coalesce:  
       - { ref: preview.victory.currentMargin.self }  
       - { ref: feature.selfMargin }

 projectedUsMargin:  
   type: number  
   expr:  
     coalesce:  
       - { ref: preview.victory.currentMargin.us }  
       - { ref: feature.usMargin }

 projectedArvnMargin:  
   type: number  
   expr:  
     coalesce:  
       - { ref: preview.victory.currentMargin.arvn }  
       - { ref: feature.arvnMargin }

 projectedNvaMargin:  
   type: number  
   expr:  
     coalesce:  
       - { ref: preview.victory.currentMargin.nva }  
       - { ref: feature.nvaMargin }

 projectedVcMargin:  
   type: number  
   expr:  
     coalesce:  
       - { ref: preview.victory.currentMargin.vc }  
       - { ref: feature.vcMargin }

 projectedSelfMarginDelta:  
   type: number  
   expr:  
     sub:  
       - { ref: feature.projectedSelfMargin }  
       - { ref: feature.selfMargin }

Add:

* projected leader-margin reduction;  
* projected ally-margin gain;  
* projected Aid/Econ/Trail deltas;  
* projected Support/Opposition deltas;  
* projected base-count deltas;  
* projected resource deltas;  
* projected availability deltas;  
* projected pre-Coup posture deltas.

Every preview-derived feature must either `coalesce` to current state when that is semantically safe or use explicit `previewFallback`/`noContribution` when absence of preview should not become a false zero. The current preview-integrity tests prove why this matters.

### **6.5 Strategic conditions**

Add or normalize these shared conditions:

strategicConditions:  
 selfCanWinNow:  
   target:  
     gte:  
       - { ref: feature.projectedSelfMargin }  
       - 0

 currentLeaderNearWin:  
   target:  
     gte:  
       - { ref: feature.projectedCurrentLeaderMargin }  
       - -2

 coupImminent:  
   target:  
     lte:  
       - { ref: feature.distanceToCoup }  
       - 1

 monsoonNow:  
   target:  
     eq:  
       - { ref: activeCard.tag.monsoon }  
       - true

 resourcesLow:  
   target:  
     lt:  
       - { ref: feature.selfResources }  
       - 2

Supported now in concept, but exact `activeCard.tag.monsoon` syntax must be verified against the active-card ref index. The observability file confirms active-card tag/annotation surfaces are exposed.

Faction-specific conditions:

* `usAvailabilityLow`  
* `usSupportEngineReady`  
* `arvnPoliticalEngineBehind`  
* `arvnRedeployRiskHigh`  
* `nvaTrailWeak`  
* `nvaBaseNetworkWeak`  
* `vcAgitationReady`  
* `vcUndergroundNetworkThin`  
* `allyNearWin`  
* `rivalAllyNearWin`

### **6.6 Relationships**

Use relationships instead of scattered faction-pair hacks.

Example pattern:

relationships:  
 us.arvnNominalAlly:  
   role: nominalAlly  
   seat: arvn  
   priority: 10  
   gainValue: { ref: victory.currentMargin.arvn }

 us.arvnKingmakerRisk:  
   role: kingmakerRisk  
   seat: arvn  
   condition: arvnNearWin  
   priority: 20  
   gainValue: { ref: victory.currentMargin.arvn }

 arvn.usNominalAlly:  
   role: nominalAlly  
   seat: us  
   priority: 10  
   gainValue: { ref: victory.currentMargin.us }

 arvn.usKingmakerRisk:  
   role: kingmakerRisk  
   seat: us  
   condition: usNearWin  
   priority: 20  
   gainValue: { ref: victory.currentMargin.us }

 nva.vcNominalAlly:  
   role: nominalAlly  
   seat: vc  
   priority: 10  
   gainValue: { ref: victory.currentMargin.vc }

 nva.vcKingmakerRisk:  
   role: kingmakerRisk  
   seat: vc  
   condition: vcNearWin  
   priority: 20  
   gainValue: { ref: victory.currentMargin.vc }

 vc.nvaNominalAlly:  
   role: nominalAlly  
   seat: nva  
   priority: 10  
   gainValue: { ref: victory.currentMargin.nva }

 vc.nvaKingmakerRisk:  
   role: kingmakerRisk  
   seat: nva  
   condition: nvaNearWin  
   priority: 20  
   gainValue: { ref: victory.currentMargin.nva }

This is supported now by the relationship compiler: each relationship binds through exactly one seat or standing role, can be gated by a strategic condition, has deterministic priority, and can expose a numeric `gainValue`.

### **6.7 Strategy modules**

Use modules as the doctrine layer. Each module should be traceable and should either enable plan templates or contribute scoring.

Shared modules:

* `shared.immediateWin`  
* `shared.blockCurrentLeader`  
* `shared.nearCoupConcreteSwing`  
* `shared.resourceLogistics`  
* `shared.eventDirectSwing`  
* `shared.allyRivalThrottle`

US modules:

* `us.buildSupport`  
* `us.preserveAvailability`  
* `us.forceMultiplier`  
* `us.surgicalRemoval`  
* `us.protectAidEcon`  
* `us.avoidArvnKingmaking`

ARVN modules:

* `arvn.buildPoliticalEngine`  
* `arvn.convertSupportToPatronage`  
* `arvn.preserveAidResources`  
* `arvn.controlPopulation`  
* `arvn.redeploySafety`  
* `arvn.usRivalRisk`

NVA modules:

* `nva.logisticsAndTrail`  
* `nva.baseNetwork`  
* `nva.takeControl`  
* `nva.conventionalPressure`  
* `nva.vcRivalRisk`

VC modules:

* `vc.oppositionEngine`  
* `vc.baseNetwork`  
* `vc.fundAndAmbushCarefully`  
* `vc.subvertPatronage`  
* `vc.agitationReadiness`  
* `vc.nvaRivalRisk`

This is supported now. Strategy modules compile `when`, `applies`, priority tier/value, selector bindings, score groups, guardrails, fallback, and plan-template enable/suppress lists.

### **6.8 Plan templates**

The plan-template library should be explicit and faction-parity oriented.

US:

planTemplates:  
 us.trainAdvise: preserve and strengthen  
 us.trainPacify: add/strengthen  
 us.patrolAdvise: add  
 us.sweepAirStrike: preserve and strengthen  
 us.airLiftAssault: add  
 us.airLiftControlOrWithdrawal: add  
 us.assaultHighValueInfrastructure: add  
 us.eventDirectSwing: add

ARVN:

planTemplates:  
 arvn.trainGovern: preserve and strengthen  
 arvn.patrolGovern: preserve/strengthen  
 arvn.sweepRaid: preserve/strengthen  
 arvn.transportControl: preserve/strengthen  
 arvn.assaultRaid: add/strengthen  
 arvn.trainPacifyCoupPrep: add  
 arvn.eventPoliticalSwing: add

NVA:

planTemplates:  
 nva.rallyTrail: add  
 nva.rallyInfiltrate: preserve/strengthen  
 nva.locOccupationBeforeCoup: preserve/strengthen  
 nva.marchControl: add  
 nva.marchInfiltrate: add/strengthen  
 nva.marchAmbush: add  
 nva.attackAmbush: add  
 nva.bombardCoinStack: add  
 nva.terrorSupportReduction: add

VC:

planTemplates:  
 vc.rallyBaseNetwork: add  
 vc.rallyTax: add  
 vc.terrorTax: add  
 vc.terrorSubvert: add  
 vc.marchSpread: add  
 vc.marchAmbushFromLoc: preserve/strengthen  
 vc.attackAmbush: add  
 vc.agitationPrep: add

This is YAML-only as long as each plan can be matched to existing action tags, compound special tags, decision paths, and role selectors. If a specific template cannot bind a role at the right microturn, treat that as a narrow authoring/runtime bug, not as evidence for broad architecture work.

### **6.9 Posture evaluators**

Posture should catch whole-turn “looks good locally, bad after resolution” failures.

Add/strengthen:

* `us.preserveSupportAndAvailability`  
* `us.airStrikePoliticalCost`  
* `us.aidEconFloor`  
* `us.avoidArvnKingmaking`  
* `arvn.preserveAidAndMargin`  
* `arvn.avoidRedeployUndo`  
* `arvn.preserveTransportOriginControl`  
* `arvn.avoidUsKingmaking`  
* `nva.protectLogisticsAndBases`  
* `nva.avoidVcKingmaking`  
* `nva.preserveTrail`  
* `vc.preserveUndergroundAndBases`  
* `vc.avoidNvaKingmaking`  
* `vc.preserveAgitationResources`

Posture evaluators are supported now and already enforce the most important preview-integrity contract: every `prefer` term must declare fallback contribution.

### **6.10 Guardrails**

Guardrails should demote or veto moves that are legal but strategically bad.

Preserve:

* `us.avoidPoliticalAirStrike`  
* `nva.preserveTrailAndBases`  
* `vc.avoidConventionalAttackWithoutAmbush`  
* current ARVN Transport/redeploy guardrails

Add/strengthen:

* `us.avoidOvercommitment`  
* `us.avoidArvnKingmaking`  
* `arvn.avoidGovernWhenSupportLossOutweighsPatronage`  
* `arvn.avoidResourceBurnWithoutMarginOrControl`  
* `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`  
* `nva.avoidLowYieldBombard`  
* `vc.avoidTaxWhenSupportShiftIsTooCostlyUnlessResourcesCritical`  
* `vc.protectBaseFromNvaInfiltrate`  
* `shared.noLowYieldBodyCount`

### **6.11 Preview/profile settings**

Keep preview bounded.

Recommended profile stance:

profiles:  
 us-baseline:  
   observer: currentPlayer  
   preview:  
     mode: bounded  
     grantFlowContinuation:  
       enabled: true  
       postGrantDepthCap: 4  
       postGrantCapClass: postGrant16  
       freeOperationDepthCap: 16  
       freeOperationCapClass: grantFlow16

Use `grantFlow32` only when a witness proves `grantFlow16` cannot differentiate a required plan family. Do not add a new cap class now.

The current preview runtime and cap machinery already distinguish depth caps, post-grant caps, free-operation caps, and partial grant flow.

---

## **7. Required generic architecture changes**

None should be proposed now.

Current generic architecture already supports the necessary abstractions:

* doctrine-gated modules;  
* plan templates;  
* root selection from published legal moves;  
* compound special-activity availability;  
* role-bound selectors;  
* role constraints including reachability and post-state checks;  
* posture evaluators;  
* relationships;  
* preview with typed unavailability;  
* observer-safe selector/trace behavior;  
* deterministic replay.

The Foundation-aligned move is to finish YAML authoring and prove it with tests. Adding new engine features before exhausting the current DSL would be churn.

Potential architecture work should be admitted only under one of these concrete failures:

1. A required plan cannot bind a legal role target because the current microturn decision context lacks enough generic decision-path metadata.  
2. A necessary post-state predicate cannot be expressed with existing `postState` role constraints and policy expressions.  
3. Preview evidence remains uniformly unavailable for a strategically essential decision even with existing `postGrant16` and `grantFlow16`/`grantFlow32`.  
4. A selector needs item-local state that is not available through `lookup`, `zoneProp`, token aggregation, projected-state lookup, or derived metrics.

If any of those occurs, the fix must be game-agnostic, generic, deterministic, observer-safe, cap-classed, and tested against at least one non-FITL surface where appropriate. The cross-family plan trace test already sets the right pattern by proving plan trace fields across generic-control, Fire in the Lake, and Texas Hold’em rather than only FITL.

---

## **8. Testing and witness plan**

### **8.1 Done standard**

The implementation is done only when all of the following are true:

1. Production FITL spec compiles with no parse, validation, or compilation diagnostics.  
2. All four baseline profiles bind: `us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`.  
3. Deterministic replay passes for curated seeds and policy-agent canaries.  
4. Every major competence requirement has at least one profile-quality witness.  
5. Plan traces prove doctrine → plan family → selected root → compound availability → role binding → microturn decision.  
6. Preview evidence is never silently coerced into false certainty.  
7. Observer safety tests still show no hidden information leaks.  
8. No agent selects illegal, non-constructible, or unpublished moves.  
9. Curated competence scenarios do not produce obviously stupid faction behavior.

### **8.2 Compile and deterministic replay**

Keep and extend:

* production spec compile tests;  
* byte-identical compile/determinism checks for agent library changes;  
* FITL PolicyAgent determinism canary over all four profiles. Current canary already proves same seed + same profiles produce identical bounded-prefix outcomes for known fragile seeds.

Add:

* four-faction deterministic replay with the expanded plan library enabled;  
* one deterministic replay per new plan-template family where root selection affects later microturn choices.

### **8.3 Profile-quality witnesses**

US witnesses:

* Immediate US win by Support/Available improvement.  
* Block VC near win by reducing Opposition or removing VC Base.  
* Block NVA near win by removing NVA Control/Base.  
* Train/Pacify high-pop Support target.  
* Train+Advise beats plain Train when indigenous removal/Aid matters.  
* Sweep+Air Strike chooses zero-pop/Trail-safe target.  
* Avoid Air Strike in populated Support unless denial is decisive.  
* Air Lift enables Assault/control without abandoning critical COIN Control.  
* Patrol protects high-Econ LoC over low-yield removal.  
* Avoid ARVN kingmaking.

ARVN witnesses:

* Train+Govern distinct-space binding remains.  
* Govern Active Support for Patronage only when Patronage/rank justifies support loss.  
* Patrol/Govern over Train when LoC/Econ threatened.  
* Sweep+Raid exposes before removal.  
* Transport rejects origin-control loss.  
* Transport rejects unreachable destination.  
* Pre-Coup posture avoids redeploy-undone move.  
* ARVN blocks US near-win.  
* ARVN chooses Patronage/control concrete swing before Coup.

NVA witnesses:

* Protect Trail before Coup.  
* Rally improves Trail/base logistics when resources allow.  
* March into population/control target when it changes NVA margin.  
* March+Infiltrate builds NVA control or force.  
* Infiltrate VC base only when NVA gain or VC denial is strategically justified.  
* Bombard targets concentrated COIN Troops/Bases.  
* Attack+Ambush beats conventional Attack when guerrilla attrition/exposure matters.  
* NVA blocks VC near-win.

VC witnesses:

* Terror high-pop non-COIN-controlled space toward Opposition.  
* Tax funds additional Terror/Rally/Agitation.  
* Subvert drops ARVN Patronage or control when ARVN near win.  
* March spreads Underground network without unnecessary exposure.  
* Attack only with Ambush unless direct win/block justifies exception.  
* Protect VC Base from NVA Infiltrate.  
* Prepare Agitation before Coup with resources and VC pieces.  
* VC blocks NVA near-win.

### **8.4 Traceability tests**

Add a common assertion helper for every new plan witness:

* selected profile id;  
* active doctrine module id;  
* selected template id;  
* selected root stable move key;  
* compound availability status if special activity exists;  
* role binding status for each required role;  
* selected target satisfies selector;  
* selected microturn option matches role binding;  
* fallback reason absent for normal exact matches;  
* fallback reason present and categorical for deviations.

The current plan trace architecture already records role statuses and microturn fallback reasons; extend test coverage rather than inventing a new trace surface.

### **8.5 Observer-safety tests**

FITL is mostly public-information, but that is not a license to weaken observer discipline. Preserve the generic observer-safety suite and add FITL-specific checks for:

* active-card lookahead visibility;  
* preview active-card annotation visibility;  
* no hidden sampled card/order leakage;  
* no hidden token ids in plan traces;  
* no hidden fallback reason containing concrete hidden identifiers.

Current observer tests already prove hidden-token filtering and hidden preview fallback discipline across selector sources and traces.

### **8.6 Preview-signal integrity tests**

For every new preview-driven posture or candidate feature:

* assert preview ref status is `ready` when used as scoring evidence;  
* assert unavailable preview uses explicit fallback/noContribution;  
* assert selection reason is `tiebreakAfterPreviewNoSignal` when preview cannot differentiate;  
* assert postGrant/freeOperation cap status is recorded when grant continuation truncates;  
* assert no score contribution is recorded for unavailable preview unless fallback contribution is explicit.

Current preview-integrity tests already provide the model.

### **8.7 Constructibility/legal-move tests**

For every new plan template:

* root must come from published legal action-selection frontier;  
* compound availability must be ready/provisional/unavailable and traced;  
* no template should choose an unpublished or illegal special activity;  
* plan controller must exact-match or fall back visibly;  
* candidate must remain constructible under current microturn protocol.

The current root-selection path chooses the selected root by stable move key from the published frontier and throws if the selected root is not present.

### **8.8 Regression and boundedness tests**

Keep existing fragile-seed tests and add any new authoring regression seeds to the policy-profile-quality corpus only when they represent a strategic invariant, not merely a one-off preference.

Regression classes to keep:

* ARVN seed 1000/deep recovery;  
* FITL seed 2057;  
* march dead-end recovery;  
* spec-143 cost/heap boundedness;  
* four-profile convergence;  
* guardrail uniformity;  
* preview opponent-margin visibility;  
* plan selected-root authority;  
* compound availability correspondence.

---

## **9. Risks, sequencing, and recommended implementation order**

### **Risk 1: Overfitting curated witnesses**

The largest risk is writing tests that merely assert the current favorite move in a single state. Avoid that. Witnesses should assert strategic properties: selected candidate has tag, selected target satisfies selector, margin/resource/control delta exists, guardrail fired or did not fire, role target matches doctrine, preview evidence was ready or explicitly unavailable.

### **Risk 2: Treating projected margin as a universal solvent**

Projected margin is valuable, but FITL competence needs local spatial facts: population, support/opposition, control, bases, underground guerrillas, LoCs, Econ, Trail, redeploy risk, and resource floors. A policy that only optimizes projected margin will miss setup, logistics, and future legality.

### **Risk 3: New preview budgets masking bad authoring**

Do not fix weak selectors with deeper preview. If a selector cannot tell why a target is good without deep preview, author the missing state feature or posture hook first.

### **Risk 4: ARVN remains the only mature faction**

ARVN has been the architecture proving ground. That is useful, but the final library must have four-faction parity. Do not treat ARVN as uniquely privileged now.

### **Recommended sequence**

1. **Shared primitives pass**: state features, candidate features, strategic conditions, relationships, and generic modules.  
2. **US completion pass**: Support/availability, safe force, Aid/Econ, Air Lift/Assault, ARVN rivalry.  
3. **ARVN cleanup pass**: preserve good structures, remove placeholders, strengthen Transport/redeploy/Govern posture.  
4. **NVA completion pass**: Trail/base/control/March/Infiltrate/Bombard/Ambush, VC rivalry.  
5. **VC completion pass**: Opposition/base/Tax/Subvert/Ambush/Agitation, NVA rivalry.  
6. **Four-faction integration pass**: universal win/block/near-Coup/event modules, convergence, deterministic replay, traceability matrix tests.  
7. **Only then reassess architecture** if a concrete authoring failure remains.

---

## **10. Explicit non-goals and exclusions**

This proposal excludes:

* solitaire flowchart reproduction;  
* printed non-player faction bot behavior;  
* Trưng bots;  
* expansions;  
* optional tournament variants unless already intentionally encoded as base-game behavior;  
* cloning the repository;  
* GitHub code search/snippet-based analysis;  
* broad external FITL strategy research;  
* implementation tickets;  
* code changes.

This proposal also rejects compatibility preservation for its own sake. Existing structures should survive only when they improve competence, clarity, testability, traceability, or Foundation alignment.

---

## **11. Final recommendation**

Proceed with a **four-faction authored competence-library completion** in `data/games/fire-in-the-lake/92-agents.md`.

Do not start with engine work. Do not increase preview depth as a first move. Do not preserve messy old structure merely because tests currently pass. Keep the architecture, keep the strong witnesses, keep the profile ids, and turn the current scaffold into a deliberate doctrine library.

The concrete success target is:

* US plays as a support-building, availability-preserving expeditionary stabilizer.  
* ARVN plays as a self-interested political/control engine, not just a US helper.  
* NVA plays as a logistics-backed conventional insurgent that uses Trail, bases, March, Infiltrate, Bombard, and Ambush coherently.  
* VC plays as an underground opposition/resource engine that avoids fair fights, protects bases, Taxes/Subverts/Terrors intelligently, and prepares Agitation.

The current generic architecture appears sufficient. The missing competence is mostly authored YAML plus rigorous witnesses.

