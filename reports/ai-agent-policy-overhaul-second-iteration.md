# **Requirements-first AI architecture proposal for LudoForge agents**

## **1. Executive verdict**

**Best architecture:** keep the current plan-primary core, but reframe and strengthen it into a first-class **Doctrine–Plan–Role–Target–Posture architecture**. I will call it **DPRT-P**.

The landed architecture is no longer the weak “flat policy score happens to prefer an action” system criticized in the earlier iteration. Current `main` now has real advisory plan proposal, plan-selected root authority, committed plan execution state, role-bound microturn control, compound-witness validation, posture evaluation, relationship/rival modeling, bounded selector sources, and trace surfaces. The `PolicyAgent` proposes and commits a plan before scalar fallback at action selection, and then lets the plan controller consume later microturns from the published legal frontier. That is the right spine.

**Verdict on current landed architecture:** **keep the core, but partially replace/reframe major authoring subsystems.** Do not do a second blank-slate overhaul. Do not keep it as-is. The plan-primary runtime is good enough to preserve; the doctrine and target layers are not yet strong enough to declare the architecture complete for FITL-grade competence or hidden-information generality.

**Deeper architectural change is warranted, but it should be surgical:** formalize doctrine/intent and typed target roles around the existing plan-primary machinery. The biggest remaining weakness is not runtime legality or determinism; it is that the current “strategy module” layer still often behaves like named scalar scoring data, while FITL-grade agents need doctrine-like intent, target semantics, and explainable plan-family selection.

**The core recommendation:**

1. Keep advisory whole-turn planning.  
2. Keep atomic microturn execution through the kernel-published legal frontier.  
3. Keep explicit sequencing.  
4. Promote doctrine/intent to a first-class layer above plan templates.  
5. Promote target roles to typed, structured, composite objects rather than mostly string keys and local selectors.  
6. Keep utility/weights only as subordinate local scoring inside selectors, guardrails, and posture evaluators.  
7. Make validation prove semantic correspondence: doctrine → plan family → root → compound continuation witness → role target type → decision surface → microturn trace.

This is compatible with `docs/FOUNDATIONS.md`: game-specific meaning stays in GameSpecDoc/agent data, the kernel remains game-agnostic, execution remains deterministic and atomic, preview remains advisory, and testing remains proof.

---

## **2. Current-main evidence base**

The mission prompt and manifest were supplied as uploaded files. I followed the requested evidence discipline: repository metadata, live `main` verification, uploaded manifest as inventory, targeted file fetches from the exact current `main` SHA, then analysis.

**Repository metadata verified through the GitHub tool**

Repo: `joeloverbeck/ludoforge-llm`  
 Default branch: `main`  
 Live `main` verification: GitHub compare reported `main` identical to uploaded manifest commit:

`8d526b206d2c096a7550460d7b635377881b81be`

So I proceeded against that exact SHA.

**Active current-main files fetched**

Core constitution and requirements:

* `docs/FOUNDATIONS.md`  
* `reports/fitl-competent-agent-ai.md`  
* `reports/ai-agent-policy-overhaul-first-iteration.md`  
* `reports/ludoforge-ai-overhaul-first-iteration.md`  
* `reports/fitl-ai-agent-competence-remediation.md`  
* `reports/fitl-perf-baseline-2026-05-24.md`  
* `docs/agent-dsl-cookbook.md`

FITL active data:

* `data/games/fire-in-the-lake/91-victory-standings.md`  
* `data/games/fire-in-the-lake/92-agents.md`  
* `data/games/fire-in-the-lake/93-observability.md`  
* `data/games/fire-in-the-lake/94-diagnostic-agents.md`

Agent/compiler/runtime surfaces:

* `packages/engine/src/agents/policy-agent.ts`  
* `packages/engine/src/agents/policy-agent-plan-root.ts`  
* `packages/engine/src/agents/plan-proposal.ts`  
* `packages/engine/src/agents/plan-controller.ts`  
* `packages/engine/src/agents/plan-execution.ts`  
* `packages/engine/src/agents/plan-trace.ts`  
* `packages/engine/src/agents/policy-selector-eval.ts`  
* `packages/engine/src/agents/policy-posture-eval.ts`  
* `packages/engine/src/agents/policy-relationship-eval.ts`  
* `packages/engine/src/cnl/compile-agent-selector-sources.ts`  
* `packages/engine/src/cnl/compile-agent-plan-templates.ts`  
* `packages/engine/src/cnl/validate-agent-plan-templates.ts`  
* `packages/engine/src/kernel/types-plan-trace.ts`  
* `packages/engine/src/kernel/plan-role-constraints.ts`

Tests and witnesses:

* `packages/engine/test/architecture/spec-190-plan-selected-root-authority.test.ts`  
* `packages/engine/test/architecture/plan-controller-legality-frontier.test.ts`  
* `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`  
* `packages/engine/test/unit/agents/role-selector-routepairs-subset.test.ts`

I did not use GitHub code search or snippet search. I did not clone the repository. I did not execute the test suite; this is an architectural audit from targeted current-main file fetches plus external research.

**Archive policy**

No archive files were used as source of truth. I read active reports that summarize prior iteration context. The active `ludoforge-ai-overhaul-first-iteration.md` explicitly marks its earlier findings as reassessed and partly corrected by later specs; I treated it as prior-iteration context, not current evidence.

---

## **3. Requirements extracted from `fitl-competent-agent-ai.md`**

The FITL competence report is explicitly behavioral requirements evidence, not an architecture prescription. Its own framing rejects treating it as a preselected DSL, scoring model, search model, or plan-template prescription.

### **Shared FITL-grade requirements**

A competent agent must reason over the **current player’s whole composed turn**, not just the next atomic choice. It must evaluate operation + special activity, order, targets, target subsets, resource costs, posture, coup/monsoon timing, eligibility/card opportunity, victory margin, and ally-as-rival effects. The report repeatedly names composed turn shapes such as Sweep/removal, March/Ambush, March/Infiltrate, Train/Govern, Assault/mobility/continued Assault, Tax during Terror, and Air Lift before Training.

Generic expressive requirements implied by the report:

* Explicit current-turn plan horizon.  
* Explicit operation/special sequencing.  
* Role-bound targets.  
* Piece/space/card/route/subset target selection.  
* Resource floor and cost reasoning.  
* Coup and Monsoon posture.  
* Victory-margin/rank denial.  
* Nominal ally rival-risk modeling.  
* Future-legality setup without becoming a second rules engine.  
* Hidden/partial/unavailable signal discipline.  
* Human-plausible doctrine, not alien optimization.

### **US requirements**

The US needs to behave like a pressure-and-support manager: raise Support, preserve Aid and Available US, use force surgically, and exploit mobility. Required composed turns include Train + Advise, Patrol + Advise, Sweep + Air Strike, Assault + Air Lift + continued Assault, and Air Lift + Train. It must avoid high-collateral airstrikes into valuable support populations and distinguish military value from political damage.

Generic architecture requirement: US competence needs plan templates with target roles for training spaces, advisory spaces, sweep/strike targets, lift origins/destinations, and continuation targets. It also needs posture guardrails against political self-harm.

### **ARVN requirements**

ARVN is the hardest test because it is nominally COIN-aligned but strategically self-interested. It must maximize COIN-Control Pop + Patronage, exploit Govern, avoid simply serving US Support, protect Patronage and economic/resource floors, and reason about pre-Coup redeploy/commitment consequences. The report names Train + Govern, Patrol + Govern, Sweep + Raid, Assault + Raid, Train + Transport, and Assault + Transport + continued Assault as essential patterns.

ARVN requires especially rich target reasoning:

* Train space vs Govern space separation.  
* Govern spaces that improve Patronage or control without handing the US victory.  
* Patrol/Govern tradeoffs.  
* Sweep/Raid exposure and removal ordering.  
* Assault/Raid tactical target selection.  
* Transport origin/destination pairs.  
* Avoiding origin control loss after Transport.  
* Pre-Coup troop/base posture.  
* Ally-as-rival flips when US gains more than ARVN.

The current FITL victory data makes the ARVN objective explicit: ARVN margin depends on controlled population plus Patronage, while US margin depends on Support plus Available US pieces.

### **NVA requirements**

NVA needs to behave like a logistics-backed conventional insurgent army. It needs Trail, bases, infiltration, protected external sanctuaries, and military build-up before decisive offensives. Required turns include Rally + Infiltrate, March + Infiltrate, March + Ambush, Attack + Ambush, Terror as future Rally setup, and LoC occupation before Coup.

Generic architecture requirement: NVA needs route/origin/destination reasoning, base protection, trail/coup temporal posture, enemy-control target priority, and rival-risk posture against VC advantage.

### **VC requirements**

VC needs clandestine political warfare: Opposition, underground survival, bases, Terror/Agitate, Tax, Subvert, and surgical Ambush. Required turns include Rally + Subvert, March + Subvert, Terror + Subvert, Terror + Tax, March + Ambush from LoC, and Rally reset into future Terror. It must avoid conventional attacks without Ambush and protect VC bases from NVA Infiltrate.

Generic architecture requirement: VC needs hidden/underground-aware piece selection, future setup value, political target scoring, Tax restraint, and ally-as-rival reasoning against NVA.

### **Ally-as-rival requirement**

The report is unambiguous: US/ARVN and NVA/VC are friendly by rules but rivals by victory condition. The architecture must express nominal alliance, rival-risk thresholds, and posture flips when the ally nears victory or blocks own victory.

This should be game-authored and generic: not “US/ARVN” hardcoded, but relationship roles such as `nominalAlly`, `nearWin`, `blockingPartner`, and `beneficiaryOfMyMove`.

---

## **4. Research synthesis**

### **HTN planning: borrow decomposition, reject unbounded planning**

HTN systems such as SHOP2 show the power of decomposing high-level tasks into ordered lower-level tasks, including temporal and metric reasoning. That is highly relevant to FITL composed turns: “Train then Govern” is naturally a task decomposition. But general HTN planning is not the right runtime architecture here because unrestricted decomposition risks unbounded search and can become a second rules engine. The useful borrowing is **bounded authored decomposition**, not autonomous full planning.

### **Behavior trees: borrow fallback/reactivity, reject tick-tree control as primary**

Behavior trees became popular in games because they improve modularity and human authorability compared with flat FSMs; robotics literature also emphasizes modular, reactive task switching and formal analysis of safety/robustness. That maps well to LudoForge’s need for fallback, reselect, deviation, and guardrail behavior. But a behavior tree as the primary runtime controller would be a bad fit: the kernel already owns legal action publication, and a ticking behavior tree could drift into a parallel rules interpreter. Borrow the fallback shape; do not replace the microturn protocol.

### **BDI: borrow belief/intent/execution separation**

BDI’s most useful architectural lesson is the separation between selecting a plan and executing a committed plan. That is exactly what LudoForge needs: observer-safe belief/projection, doctrine/desire, selected intent, and microturn-by-microturn execution. The current code already resembles this in miniature: plan proposal commits `PlanExecutionState`, and the controller executes it through legal frontier choices. The architecture should lean into that separation, but without importing modal logic machinery or mutable private beliefs beyond observer-safe projections.

### **GOAP: borrow precondition/effect proof obligations, reject runtime goal search**

F.E.A.R.’s GOAP is a useful industrial precedent: goals and actions with preconditions/effects allow agents to choose plans dynamically rather than manually hardcoding every transition. But LudoForge cannot run general GOAP over GameSpecDoc effects at runtime without becoming a second rules engine and blowing boundedness. The right borrowing is compile-time and diagnostic: plan templates should carry symbolic expectations and compiler witnesses that the authored root can grant the intended continuation. Runtime should still choose only from kernel-published legal microturns.

### **GDL and Ludii: high-level declarative game concepts matter**

General Game Playing and GDL show the value of declarative, game-agnostic rule descriptions. Ludii goes further by emphasizing high-level, human-understandable ludemes, generality, extensibility, understandability, and efficiency; later Ludii work argues universality across finite deterministic, nondeterministic, and imperfect-information games. LudoForge should draw the same lesson for agents: the policy language should describe game-authored concepts and doctrine modules, not engine-hardcoded FITL semantics or opaque code.

### **Imperfect information: hidden leaks are architectural, not cosmetic**

Hanabi research is a useful warning. IS-MCTS variants can leak hidden information into opponent models; one Hanabi report explicitly introduced re-determinization to prevent such leakage, and another found weak IS-MCTS results until a predictor model was added. This does not imply LudoForge should use IS-MCTS. It implies that hidden-information discipline must be designed into state projection, preview provenance, opponent modeling, and trace visibility.

### **MCTS: not the primary architecture**

Modern MCTS surveys describe a powerful family of rollout/statistical tree-search methods, but also note that complex, high-branching, real-time, or practical domains often need problem-specific modifications and hybridization. LudoForge already hit the practical version of this problem: FITL-grade branching and multi-step turns are too expensive for MCTS as the normal runtime driver. Search may remain useful as bounded diagnostic tooling, offline witness generation, or local candidate comparison. It should not be the agent architecture.

### **Explainability: traces must answer “why this, not that?”**

Explainable AI research stresses that explanations should be designed for human understanding, not just raw introspection dumps. For LudoForge, a trace that lists scores is insufficient. The trace should expose active doctrine, selected intent, rejected alternatives, role bindings, guardrail/posture effects, preview availability, and deviations in a contrastive way: why Train + Govern here rather than Sweep + Raid or scalar fallback.

---

## **5. Current architecture audit**

### **What current `main` represents well**

**Plan-primary root selection is real.** At action selection, `PolicyAgent` calls `proposeAndCommitAdvisoryTurnPlan`, then `choosePlanSelectedRootDecision`, and only after that falls back to the old scalar move evaluator.

`choosePlanSelectedRootDecision` requires the selected plan root to be present in the published legal action frontier, and throws if not. That is exactly the right authority boundary.

**Plan execution stays inside the microturn frontier.** The plan controller selects an exact bound role value if available, reselects if allowed, falls back to the primitive guided decision if legal, then finally uses a stable legal-frontier fallback. It traces exact/reselected/fallback and advances plan state deterministically.

**The plan state is small, replayable, and deterministic.** `PlanExecutionState` records template, intent, role bindings, next step, fallback/deviation history, turn id, and seat id, with canonical serialization helpers.

**Compiler validation is much stronger than before.** It validates role selector references, stable role tie-break ordering, step role declarations, decision surface correspondence, compound operation/special-activity witnesses, named cap classes, max steps, fallback targets, and fallback cycles.

**Unsupported role constraints now fail closed.** `locatedIn` may be parsed, but the supported runtime constraint set is only `notEqual`, and validation rejects unsupported constraints. That is the right failure mode; the missing capability is architectural expressiveness, not a hidden runtime lie.

**Selectors have useful generic target sources.** Current selector machinery supports zones, tokens, players, cards, products, routePairs, subsets, candidate params, and microturn options, with deterministic caps for product pairs and subsets.

**The tests prove important invariants.** Spec 190 tests that plan-selected roots do not invoke scalar root scoring and must be a published legal action. Plan-controller tests prove exact binding, deterministic fallback inside the legal frontier, and mismatch fallback on wrong decision path/target kind/stage. The semantic correspondence golden pins FITL production plan steps against frontier contexts.

**FITL active data now includes all four faction profiles and explicit composed plans.** The production agent data includes ARVN, US, NVA, and VC plan templates for the major composed-turn patterns demanded by the competence report, plus relationships, posture evaluators, guardrails, and profile bindings.

### **Where current `main` is still weak**

**Doctrine is still not first-class enough.** The runtime calls active strategy modules “doctrines” in plan traces, but the underlying model is still mostly `strategyModules` with `when`, `applies`, `priority`, and score groups. Many FITL modules still look like weighted action preferences with constant values. That is not yet doctrine; it is named scalar bias.

**Plan proposal still has scalar scoring at the top.** It ranks alternatives by priority tier, role score, leaf consideration score, and posture score. This is better than old flat scoring, but still vulnerable to scalar soup unless doctrine precedence is lexicographic and semantically explained.

**Target reasoning is broad but shallow.** The selector source surface can enumerate route pairs and subsets, but current `routePairs` is just a bounded Cartesian product of selected origins and destinations; it does not by itself represent authored route semantics, path legality, movement cost, interdiction risk, or origin-control preservation. The unit test proves deterministic enumeration, not tactical route competence.

**Composite targets are not first-class enough.** Route pairs and subsets are represented as string keys like `origin|destination` or `a|b|c`. That is acceptable as a stable identity primitive, but not enough as an architecture for explainable target reasoning over origin/destination pairs, route semantics, selected subsets, and piece-level target choices.

**Role constraints are too thin.** `notEqual` is supported; `locatedIn` is rejected. Rejecting unsupported constraints is correct, but FITL-grade piece/space reasoning eventually needs generic typed constraints such as “token is in zone,” “origin differs from destination,” “destination adjacent/reachable from origin under authored route semantics,” and “subset elements satisfy pairwise property.” These must be game-agnostic constraints over authored collections, not FITL hardcodes.

**Plan root compound validation is good, but runtime root matching is still coarse.** The compiler validates compound witnesses against authored operation/special-activity continuation metadata, but runtime root matching in `plan-proposal.ts` checks action id/tags for root candidates. If the selected root later cannot realize the intended special activity in that state, the controller will legally fallback/deviate, but the proposal trace may still overstate intended coherence unless the architecture makes compound availability/status explicit at root proposal time.

**The plan expression surface is narrower than the policy evaluator surface.** `evaluatePlanExpr` in `plan-proposal.ts` implements a limited local evaluator. That may be intentional, but it is an authoring hazard unless the compiler explicitly prevents authors from using unsupported policy references in plan proposal contexts. Silent zero/undefined is poison for doctrine selection.

**Hidden-information discipline exists, but the plan/selector layer needs stronger proof.** FITL observability is mostly public, and the observability file declares current/preview surfaces for derived metrics, resources, victory, and active-card surfaces. Card selectors use observer visibility when an observer is supplied. For hidden-information card games, the architecture still needs explicit proof that every selector, preview, plan posture, and trace field is observer-safe.

**The cookbook is behind the architecture.** It still frames the mental model as move-scoped scoring and says strategy modules are scoring data, although it also documents newer plan templates, posture, relationships, and fallback concepts. That is stale enough to mislead future LLM/design authors.

---

## **6. Architecture comparison**

| Architecture | Verdict | Why |
| ----- | ----- | ----- |
| Keep current as-is | No | The plan-primary spine is good, but doctrine and target reasoning remain too scalar/string-keyed for FITL-grade authorability. |
| Return to flat utility scoring | Hard no | It is opaque, fragile, hard to author, weak at sequencing, and invites scalar soup. |
| Full HTN/GOAP runtime planner | No | Attractive expressiveness, but risks unbounded search and a second rules engine. Borrow bounded decomposition and proof obligations instead. |
| Behavior tree primary controller | No | Good fallback/reaction shape, but the kernel already owns legal frontier progression. A BT should not tick its own rule model. |
| MCTS/Monte Carlo search primary | Hard no | Too slow for FITL-grade branching; hidden-info leakage risks; prior project experience already rejected it. |
| Current plan-primary + first-class doctrine/target roles | Yes | Best balance of FITL expressiveness, game agnosticism, authorability, boundedness, deterministic traces, and Foundations alignment. |

The decisive point: FITL does not require “smarter scalar weights.” It requires **named doctrine choosing bounded composed intentions, with typed target roles and proof that every executed microturn comes from the same kernel frontier a human would use.**

---

## **7. Recommended architecture: DPRT-P**

### **Name**

**DPRT-P: Doctrine–Plan–Role–Target–Posture architecture**

This should be understood as an architecture, not a ticket plan.

### **Conceptual layers**

#### **1. Observer-safe belief/projection layer**

The agent’s “belief” is not omniscient state. It is the observer-safe policy projection plus explicit unavailable/hidden/stochastic statuses. Exact-world state may be used only where the observer contract allows it or in explicitly omniscient analysis modes. This directly follows Foundations’ authoritative state and observer-view discipline.

#### **2. Doctrine/intent layer**

Doctrine modules should become first-class authoring objects, not just strategy modules with score groups.

A doctrine should declare:

* Trigger conditions.  
* Strategic posture.  
* Relationship posture.  
* Plan families it enables or suppresses.  
* Target priority families.  
* Guardrails it activates.  
* Trace label and rationale.  
* Priority tier as a categorical/lexicographic concept, not just a scalar.

Example doctrine concepts:

* `arvn.regimePatronageBeforeCoup`  
* `arvn.governWithoutServingUsWin`  
* `us.surgicalSupportProtection`  
* `nva.trailAndBaseLogistics`  
* `vc.undergroundPoliticalPressure`

A doctrine should not directly pick an illegal or synthetic move. It only constrains and ranks plan families, target role policies, and posture evaluators.

#### **3. Plan template layer**

Plan templates remain explicit and bounded. They represent current-turn advisory intentions such as Train → Govern, Sweep → Raid, March → Ambush, Terror → Tax, or Assault → Transport → continued Assault.

A plan template should declare:

* Root action ids/tags.  
* Compound continuation requirements.  
* Ordered expected microturn steps.  
* Role bindings.  
* Typed target-role schemas.  
* Required and optional roles.  
* Fallback/deviation policy.  
* Caps and named budget class.  
* Trace label.  
* Doctrine families that may select it.

This is already close to current `planTemplates`; the missing part is stronger doctrine linkage and target role typing.

#### **4. Role/target layer**

Every plan role should have a typed target schema. The current architecture has selectors; the next architecture needs **target roles**.

Target role kinds should include:

* `space` / `zone`  
* `token` / `piece`  
* `card`  
* `actionVariant`  
* `origin`  
* `destination`  
* `originDestinationPair`  
* `route`  
* `subset`  
* `pieceSubset`  
* `microturnOption`  
* `candidateParam`  
* `authoredFinite`

Composite targets should be structured, not only stable string keys. A route target should be `{ origin, destination, routeClass?, path?, constraints?, authoredSemantics? }`, not just `origin|destination`.

This remains engine-generic: “LoC” is not an engine kind. It is a game-authored map/route semantic attached to zones/routes and then consumed by generic target selectors.

#### **5. Local target scoring layer**

Weights are allowed here, but only as local, explainable components. A selector can score candidate spaces by “adds Patronage,” “denies US win,” “keeps origin controlled,” or “threatens enemy base.” The key rule: **weights must not be the primary architecture.**

Use lexicographic/tiered structures wherever possible:

1. Hard legality/constructibility.  
2. Hard guardrails.  
3. Doctrine tier.  
4. Plan family priority.  
5. Role target feasibility.  
6. Local target quality.  
7. Stable tie-break.

#### **6. Posture/guardrail layer**

Posture evaluators and guardrails should remain first class. Current `policy-posture-eval.ts` already supports must violations, demote/veto, prefer contributions, fallback reasons, score deltas, and ally-weight context.

This should be extended conceptually into:

* Resource floor posture.  
* Coup/Monsoon posture.  
* Ally-as-rival posture.  
* Hidden-info risk posture.  
* Human-plausibility guardrails.  
* Future-legality setup posture.

#### **7. Microturn execution layer**

Execution should remain exactly current in principle:

* Plan root selected only from published legal action frontier.  
* Later plan steps matched only against published legal microturn decisions.  
* If exact target is unavailable, reselect within role if allowed.  
* If role target is unavailable, follow explicit fallback/deviation.  
* Never synthesize a legal action.  
* Never bypass the kernel.

This is the part of current `main` I would keep most aggressively.

#### **8. Trace/explanation layer**

A trace should answer:

* Which doctrines were active?  
* Which intent was selected?  
* Which plans were considered and rejected?  
* Which root was selected and why?  
* Which role targets were bound and why?  
* Which guardrails/posture contributions mattered?  
* Which preview refs were ready, hidden, unavailable, capped, or fallbacked?  
* Which microturns matched exactly, reselected, or deviated?  
* Why not the nearest alternative?

Current plan traces expose many of these fields, but the doctrine and target rationale need to become more semantic.

---

## **8. FITL expressiveness check**

### **US**

DPRT-P can express US as:

* Doctrine: `surgicalSupportProtection`, `mobilityForceMultiplier`, `avoidPoliticalAirstrike`.  
* Plans: Train → Advise, Patrol → Advise, Sweep → Air Strike, Assault → Air Lift → continued Assault.  
* Roles: train space, advise support space, sweep exposure space, airstrike target, lift origin, lift destination, assault continuation target.  
* Guardrails: avoid populated Support airstrikes, avoid helping ARVN win, preserve Aid/Available US.  
* Trace: “selected Sweep + Air Strike because target removes threat with acceptable political collateral; rejected Assault because no continuation target.”

The current FITL data already contains US plan templates and guardrails, so the architecture is close. The remaining work is making target-role explanations and doctrine selection less scalar.

### **ARVN**

DPRT-P should express ARVN as the primary stress test:

* Doctrine: `patronageGovern`, `selfInterestedCoinControl`, `avoidServingUsNearWin`, `preCoupRedeployDiscipline`.  
* Plans: Train → Govern, Patrol → Govern, Sweep → Raid, Assault → Raid, Train → Transport, Assault → Transport → Assault.  
* Roles:  
  * `trainSpace`  
  * `governSpace`  
  * `raidTarget`  
  * `transportOrigin`  
  * `transportDestination`  
  * `transportRoute`  
  * `assaultTarget`  
  * `continuedAssaultTarget`  
* Hard constraints:  
  * Govern target not equal Train target where required.  
  * Transport origin must retain control or satisfy authored exception.  
  * Destination must support future legality or coup posture.  
  * Do not convert Support in a way that hands US victory unless ARVN still benefits more.  
* Posture:  
  * Patronage and resource floor.  
  * Coup proximity.  
  * US near-win ally flip.  
  * Origin-control preservation.  
* Trace:  
  * “Train + Govern selected under patronage doctrine; Govern target improves ARVN margin and does not push US over threshold; Transport rejected because origin-control guardrail fired.”

Current `main` already has ARVN plan templates, relationship posture, and quality tests such as Train/Govern separation, Govern priority, transport origin-control risk, and US-rival flip in the manifest. The current architecture has the skeleton. It still needs stronger target-role typing and less constant-score selector data to make ARVN authoring robust.

### **NVA**

DPRT-P can express NVA as:

* Doctrine: `trailLogistics`, `baseExpansion`, `pressureBeforeCoup`, `avoidServingVcNearWin`.  
* Plans: Rally → Infiltrate, March → Infiltrate, March → Ambush, Attack → Ambush, LoC occupation before Coup.  
* Roles: rally space, base target, infiltration source/target, march origin/destination, LoC route/space, ambush target.  
* Constraints: Trail/resource posture, external sanctuary preference, protect NVA bases, rival-risk against VC.  
* Trace: “March + Infiltrate selected because it builds NVA base/control margin and denies VC base advantage; Ambush rejected because target quality below doctrine threshold.”

Current data already includes NVA plan templates and guardrails, but target semantics for routes and LoC occupation should become more structured.

### **VC**

DPRT-P can express VC as:

* Doctrine: `undergroundPoliticalPressure`, `taxOnlyWhenSafe`, `ambushAvoidsConventionalAttrition`, `protectBasesFromNva`.  
* Plans: Rally → Subvert, March → Subvert, Terror → Subvert, Terror → Tax, March → Ambush from LoC.  
* Roles: underground source, terror space, tax space, subvert target, ambush origin/destination, VC base at risk.  
* Hidden-info posture: underground status and partial information must be observer-safe in hidden games.  
* Trace: “Terror + Tax selected because Opposition gain plus resource gain exceeds exposure risk; conventional Attack rejected by guardrail.”

Current VC data has the plan skeleton and guardrails; it needs stronger piece-level and hidden/underground target semantics.

---

## **9. Generalization check**

### **Perfect-information board game**

DPRT-P works well. Doctrine chooses plan families; roles bind spaces/pieces; execution uses legal moves. Examples: chess-like “develop kingside,” “attack weak pawn,” “trade when ahead.” It remains bounded by current-turn or move-sequence templates.

### **Hidden-information card game**

The architecture works only if observer-safe projections are mandatory. Card selectors, preview refs, and traces must distinguish known, unknown, sampled, and unavailable. The current code has observer-aware card collection in selector evaluation, but the architecture should require all target sources and preview surfaces to carry visibility proof, not just card collections.

### **Stochastic game**

DPRT-P can support stochastic games if preview exposes stochastic status/provenance rather than pretending exact values. Doctrine and posture should allow risk bands, but runtime should not require rollouts. Stochastic decisions remain kernel decisions.

### **Asymmetric/phase-heavy game**

This is a strong fit. Doctrine/plan templates map naturally to asymmetric objectives and phase-specific plan families, while validation binds plan steps to actual decision surfaces. FITL is the proof case.

### **Tactical card/board game with heavy target selection**

This is where typed target roles matter most. Spaces, cards, tokens, origin/destination pairs, routes, and subsets must be first-class structured targets with local scorers, guardrails, and traceable marginal values. Current selector machinery is close, but not sufficient as the final abstraction.

---

## **10. Validation and test strategy**

### **Compiler validation**

Required compiler proof obligations:

* Every plan template has caps and bounded max steps.  
* Every role selector exists and has stable tie-break ordering.  
* Every role target type matches the decision surface it will bind.  
* Composite target roles have typed components.  
* Route roles reference game-authored route/map semantics, not engine-specific LoC hardcodes.  
* Every compound root has an authored operation/special-activity witness.  
* Unsupported constraints fail at compile time.  
* Fallback graph is acyclic or bounded by explicit fallback-attempt metadata.  
* Preview refs declare fallback behavior.  
* Hidden-info surfaces cannot be read without observer permission.  
* Plan expressions cannot use unsupported policy refs silently.

Current validation already covers many of these, including stable tie-breakers, step decision surfaces, compound witnesses, caps, and fallback cycles.

### **Runtime invariants**

Required runtime invariants:

* Plan-selected root must be in published legal action frontier.  
* Every later plan-controlled microturn decision must be in published legal frontier.  
* Exact/reselected/fallback/deviation must be traced.  
* No hidden state reads outside observer scope.  
* Preview unavailable must not become silent zero.  
* Cap class and budget must be recorded.  
* Fallback must be deterministic.  
* Plan state must clear on turn end/retirement.

Current tests already cover root authority and plan controller frontier legality.

### **Determinism and replay**

Keep and expand:

* Plan trace replay.  
* Plan-v2 equivalence.  
* Semantic correspondence golden.  
* Hidden-info replay identity.  
* Zobrist/digest determinism where preview surfaces affect policy.

The current semantic correspondence golden is especially valuable because it pins authored plan step semantics to the actual decision contexts consumed by the controller.

### **Trace golden tests**

Trace golden tests should verify:

* Active doctrines.  
* Selected intent.  
* Rejected doctrines and reason.  
* Alternative plan ranking.  
* Role bindings and component rationale.  
* Guardrail/posture effects.  
* Preview ready/unavailable/fallback status.  
* Microturn exact/reselected/fallback.  
* Contrastive explanation for the nearest rejected plan.

### **Policy-quality witness tests**

Campaign metrics alone are insufficient. Keep scenario-level witnesses for:

* ARVN Train/Govern separation.  
* ARVN avoids helping US win.  
* ARVN Transport origin-control preservation.  
* US avoids political Air Strike.  
* NVA protects Trail/base before Coup.  
* VC avoids conventional Attack without Ambush.  
* VC protects bases from NVA Infiltrate.  
* Route-pair and subset target binding.  
* Hidden card target non-leak.

### **Cross-game conformance**

The architecture should be tested on at least:

* One simple perfect-information board game.  
* One hidden-information card game.  
* One stochastic game.  
* One phase-heavy asymmetric game.  
* One target-heavy tactical game.

The point is not to tune those agents to expert quality. The point is to prove the architecture is not FITL-hardcoded.

### **Authoring-error tests**

Add negative tests for:

* Missing stable role tie-break.  
* Role target type mismatch.  
* Unsupported role constraint.  
* Unbounded subset/route pair.  
* Hidden ref without fallback.  
* Unsupported plan expression ref.  
* Compound metadata without witness.  
* Fallback cycle.  
* Doctrine with no plan family.  
* Plan template with untraceable root.

---

## **11. Migration strategy at architectural level**

### **Keep**

Keep these current-main concepts:

* Plan-primary root selection.  
* Plan execution state.  
* Plan controller exact/reselected/fallback logic.  
* Plan traces.  
* Plan template caps.  
* Compound witness validation.  
* Relationship roles.  
* Posture evaluators.  
* Guardrails.  
* Selector source caps.  
* Existing FITL plan templates as migration seed.

### **Reframe**

Reframe `strategyModules` into doctrine modules.

A doctrine module should stop being “a named bundle of score groups” and become “a named strategic intent gate that activates plan families, target priorities, posture, and guardrails.” Existing score groups can survive only as subordinate local target scorers or temporary migration material.

No production backwards-compatibility shims should be added. If the authoring schema changes, migrate the current FITL profiles cleanly. Foundations explicitly rejects production compatibility shims as a design goal.

### **Strengthen**

Strengthen target roles:

* Replace pipe-string composite targets with structured identities internally.  
* Add typed target-role declarations.  
* Add route/origin/destination semantics via authored map data.  
* Add subset marginal scoring and trace.  
* Add piece-level constraints and visibility handling.

### **Update docs**

`docs/agent-dsl-cookbook.md` needs a conceptual rewrite. It should no longer lead with “move-scoped scoring” as the primary mental model. It should teach:

1. Doctrine first.  
2. Plan template second.  
3. Role/target binding third.  
4. Guardrails/posture fourth.  
5. Local scoring last.  
6. Preview provenance always.  
7. Trace expectations.

The current cookbook can be mined for examples, but it should not constrain the architecture.

### **Future evolution implications**

Evolution should eventually mutate:

* Doctrine triggers.  
* Plan family membership.  
* Plan template variants.  
* Role selectors.  
* Target scorers.  
* Guardrail thresholds.  
* Posture preferences.  
* Relationship thresholds.  
* Fallback policies.  
* Trace labels.  
* Priority tiers.

Evolution should not primarily mutate flat numeric weights. It will Goodhart campaign metrics unless traces and witness tests measure human-plausible doctrine, target rationale, safety guardrails, and cross-game conformance.

---

## **12. Risks and rejected alternatives**

### **Why not MCTS as primary architecture**

MCTS depends on many simulations/rollouts or hybrid evaluation. FITL has large branching, multi-step composed turns, and expensive preview surfaces. It already failed as LudoForge’s primary AI direction. Hidden-information variants also create leakage hazards unless carefully re-determinized. Use search only as bounded subordinate tooling.

### **Why not more flat weights**

Flat weights are the wrong abstraction for doctrine. They make authoring brittle, traces opaque, and competence accidental. They also push LLM authors toward knob tuning rather than game reasoning.

### **Why not hardcoded game-specific bots**

Hardcoding FITL concepts in the engine violates the design constitution. Engine/compiler/runtime must remain game-agnostic; game-specific semantics belong in GameSpecDoc and declarative agent data.

### **Why not unbounded HTN/GOAP**

Unbounded planners are too costly and risk becoming a second rules engine. LudoForge should use bounded authored plan decomposition and compiler/kernel witnesses, not freeform runtime planning.

### **Performance risks**

DPRT-P increases semantic richness. Route/subset target scoring and preview posture can be expensive. The mitigation is named cap classes, bounded enumeration, deterministic truncation, caches, and traceable budget status. Recent performance work shows the project has already made meaningful reductions in dispatch and allocation costs, so performance should remain a proof obligation rather than the dominant architecture veto.

### **Overfitting-to-FITL risk**

FITL can tempt the architecture toward COIN-specific concepts. The antidote is typed generic roles: route, origin, destination, token, card, subset, relationship role, posture. “LoC,” “Patronage,” “Trail,” and “Support” stay game-authored.

### **Underfitting-to-FITL risk**

The opposite failure is generic-but-toothless selectors and scalar preferences. FITL demands explicit sequencing, target roles, rival-risk posture, and current-turn tactical setup. DPRT-P should be judged harshly on ARVN and VC, not just simple games.

### **Authoring complexity risk**

A richer architecture can overwhelm designers. The answer is not to collapse back into weights; it is to provide doctrine modules, readable templates, reusable target-role patterns, validation diagnostics, and trace examples.

### **Trace opacity risk**

If traces expose only numeric scores, DPRT-P fails. Traces must expose intent and contrastive reasons.

---

## **13. Final recommendation**

**Go forward with DPRT-P.**

Current `main` has earned preservation of the plan-primary runtime core. It should not be thrown away. But the architecture is not finished. The next capability leap is not another scalar tuning pass and not a return to MCTS. It is a formal doctrine/intent and typed target-role layer built around the current plan-primary spine.

**Deeper architecture work is needed, but it should be focused:**

* First-class doctrine/intent.  
* Typed structured target roles.  
* Stronger route/subset/piece constraints.  
* Lexicographic/tiered plan-family selection.  
* Explicit compound availability/status at root proposal.  
* Observer-safe target and preview validation.  
* Human-readable contrastive traces.

**Smallest coherent next architectural step:** define the DPRT-P contract as an architectural design: doctrine activates plan families; plan templates bind typed roles; target selectors produce structured, observer-safe target objects; posture/guardrails constrain and explain; the plan controller executes only published legal microturn decisions.

**Must be proven before implementation proceeds:**

1. Doctrine selection is not scalar soup.  
2. Plan roots are still legal-frontier authoritative.  
3. Compound plan templates have compiler witnesses and runtime availability status.  
4. Role target types correspond to actual decision surfaces.  
5. Route/pair/subset targets are structured and bounded.  
6. Hidden information cannot leak through selectors, preview, posture, or trace.  
7. Traces explain why the selected plan beat the nearest rejected plan.  
8. ARVN Train/Govern, Transport, Govern-vs-US-rival, and pre-Coup behavior are expressible without FITL engine hardcodes.  
9. The same architecture works on at least one hidden-information card game and one non-FITL board game.

The landed architecture is no longer fundamentally wrong. It is a strong scaffold that now needs a sharper doctrine and target semantics layer. That is the right next architectural direction.

---

## Follow-up and supersession (added 2026-05-26)

Operationalized via `/brainstorm` on 2026-05-26 → four specs now archived under `archive/specs/` plus `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md`. The brainstorm critically reassessed this audit against `docs/FOUNDATIONS.md` and the prior triage in `archive/specs/191-plan-role-semantic-integrity.md` §11.

**Adopted in corrected scope:**

- **Spec 196** — `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` — proposal #4 (richer role constraints: `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`) and proposal #5 (authored route/map semantics via engine-generic `dataAssets` graph data; "LoC"/"Trail" remain authored labels per Foundation #1).
- **Spec 197** — `archive/specs/197-doctrine-gated-plan-template-eligibility.md` — proposal #1's *load-bearing core* (strategy modules gain optional `enablesPlanTemplates` / `suppressesPlanTemplates` and the plan proposer filters candidates before scoring), without the strategy-module → "doctrine" type reframe.
- **Spec 198** — `archive/specs/198-cross-game-conformance-corpus-and-observer-safety-proofs.md` — proposals #8 (observer-safety architectural-invariant proofs), #10 (cross-game conformance corpus per Foundation #16's literal mandate), and #11 (authoring-error negative tests; folded into Spec 198's P4 deliverable).
- **Spec 199** — `archive/specs/199-compound-availability-at-root-proposal.md` — proposal #7 (compound availability surfaced at root proposal time via a bounded probe; the controller fallback remains the runtime safety net per Foundation #18). Promoted from ticket-sized to standalone spec at user request.

**Superseded — the "DPRT-P" reframe is rejected.** The Doctrine-Plan-Role-Target shape is already realized by the landed Spec 186/187/190/191 series; this report's recommendation for a "second major architectural iteration" repeats the same framing Spec 191 §11 already corrected in the first iteration. The follow-up specs above are targeted decoupling and constraint-expressiveness additions to a built architecture, not architectural replacement. Foundation #14 forbids the churn the reframe would impose.

**Stale citations corrected during operationalization:**

- "`locatedIn` may be parsed but rejected" — stale. Spec 191 P1 (COMPLETED 2026-05-23) compile-rejected `locatedIn`; Spec 196 adds it back as a *supported* runtime-implemented kind. The audit cites pre-Spec-191 code (`plan-proposal.ts:438` no-op behavior no longer exists).
- "Fallback path is a scalar move evaluator" — understated. The fallback is full `evaluatePolicyMove` (`policy-agent-plan-root.ts:65-89`), not a degraded scalar variant.
- "Doctrine is still scalar bias … modules look like weighted preferences with constant values" — overstated. Verification (parallel Explore-agent dispatch, 2026-05-26) found ~60% of FITL strategy modules are condition-bearing with nested AND/OR/NOT and state references; ~40% are `when:true` weighted preferences. The real architectural gap is *decoupling* — doctrines adjust scoring tier via `highestDoctrineTier` (`plan-proposal.ts:474-487`) but do NOT gate plan-template candidacy. Spec 197 closes this gap directly.

**Deferred — not currently actioned:**

- **Proposal #2** (structured composite target identity, replacing pipe-strings) — trace-quality concern rather than legality gap; pipe-string identities (`policy-selector-eval.ts:173, 221`) remain stable. Deferred until a concrete trace-explainability requirement surfaces.
- **Proposal #6** (lexicographic plan-family selection refinement) — `priorityTier` is *already* the first lexicographic key via `compareAlternatives` (`plan-proposal.ts:588-592`); within-tier scalar summation is preserved by Spec 197. Finer-grained tiering is uncommitted until post-eligibility-gating evidence shows scalar-soup harm.
- **Proposal #9** (cookbook conceptual rewrite of `docs/agent-dsl-cookbook.md`) — NOT a spec. Routed to the `reassess-agent-dsl-cookbook` skill per Spec 191 §11's deferral, which is now triggered post-Spec-190.

**Audit framing corrections:**

- The audit's five-axis game-family taxonomy (perfect-info board, hidden-info card, stochastic, phase-heavy asymmetric, tactical target-heavy) is reduced to Foundation #16's authoritative four axes by Spec 198; "tactical target-heavy" is a property FITL already proves, not a separate corpus axis.
- The audit's framing that closure requires a "second major architectural iteration" is rejected; the closures are enforcement-level additions to a built architecture, not a new architecture.

See `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md` §"Source proposal disposition reference" for the per-proposal disposition table covering all 11 DPRT-P proposals.
