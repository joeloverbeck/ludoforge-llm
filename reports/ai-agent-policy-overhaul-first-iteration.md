# **Requirements-first proposal: Doctrine–Plan–Selector Architecture for LudoForge agents**

## **1. Executive verdict**

**Replace the current agent policy architecture as the primary architecture. Do not merely repair it. Do not keep evolving ARVN through scalar tuning.**

The current microturn protocol should stay. It is one of the best parts of the system. It aligns with the Foundations: the kernel publishes finite atomic decisions; agents consume the same legal frontier as humans; compound turns emerge from bounded microturn sequences, not from a second legality layer. The Foundations explicitly require engine agnosticism, declarative specs, deterministic execution, replayability, bounded computation, compiler/kernel validation boundaries, observer discipline, constructibility, atomic microturns, and preview signal integrity. Any replacement must preserve those constraints.

The architecture that should replace the current policy DSL is:

**Doctrine–Plan–Selector Architecture**, or **DPSA**.

DPSA is a doctrine-first, plan-shaped, selector-driven advisory policy architecture. It sits above the kernel’s atomic microturn protocol. It proposes bounded, explainable, whole-turn advisory plans, then executes them one published microturn decision at a time. It never becomes a second rules engine.

**Flat weighted considerations should remain only as a subordinate local mechanism.** They are still useful inside named target scorers, local tie-breakers, and bounded fallback policies. They should not be the primary expression of faction personality, tactical plans, or composed-turn intent.

The central design change is this:

The policy author should write “ARVN is pursuing Train + Govern to build Patronage while preserving COIN control and not helping a near-winning US,” not “add 700 to Govern, 300 to Train, 800 to projected margin, and hope the microturn chooser accidentally coheres.”

The current system can score moves, rank finite selectors, apply guardrails, and inspect bounded preview outcomes. It cannot naturally represent a **turn intention** with roles, sequencing, target dependencies, special-activity timing, fallback behavior, and final posture. The FITL competence report demands exactly that: candidate turns with operation type, special activity type, special timing, target spaces, target pieces, legality constraints, and expected resulting board state.

So the verdict is firm:

| Question | Verdict |
| ----- | ----- |
| Replace, layer, or repair? | **Architectural replacement of the policy layer**, implemented as a new doctrine/plan layer above the preserved microturn kernel. |
| Keep current microturn contract? | **Yes. Non-negotiable.** |
| Keep current flat considerations? | **Only as subordinate local scoring inside named modules/selectors/fallbacks.** |
| Primary runtime search? | **No MCTS, no full-game search, no expensive Monte Carlo.** |
| Primary competency horizon? | **Current player whole turn.** |
| Primary policy object? | **AdvisoryTurnPlan**, not a scalar score. |

No archive material was relied on for this proposal.

---

## **2. Diagnosis of the current system**

### **2.1 What the current architecture is good at**

The current architecture is not useless. It has several strong pieces that should be preserved or generalized.

It already honors the legal frontier. `PolicyAgent` chooses from `input.microturn.legalActions`, delegates action-selection scoring to `evaluatePolicyMove`, and for `chooseOne`/`chooseNStep` matches guided selections back against the kernel-published legal actions.

It already has deterministic trace machinery for candidate order, score contributions, preview refs, unknown preview refs, fallbacks, and selected stable move keys.

It already respects bounded preview integrity better than most hobby board-game AI systems. Preview status distinguishes ready, stochastic, hidden, unresolved, failed, depth-capped, and partial outcomes, and `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` exists when preview supplies no usable signal.

It already has finite selectors over zones, tokens, cards, players, candidate params, products, and microturn options; card selectors respect observer projections.

It already has named modules, guardrails, turn-shape evaluators, strategic conditions, tie-breakers, parameters, state features, candidate features, and profile bindings in `agents:`.

Those are valuable building blocks. They are not enough.

### **2.2 What the current DSL can express**

The current agent schema can express:

* scalar state and candidate features;  
* scalar candidate aggregates;  
* finite selectors with bounded ranking;  
* strategy modules that contribute named score groups;  
* guardrails that prune or penalize candidates;  
* turn-shape evaluators over bounded current preview drives;  
* tie-breakers and sampling modes;  
* move-scoped and microturn-scoped considerations;  
* observer-bound profile configuration;  
* preview budget caps and inner microturn preview options.

The cookbook describes the current mental model plainly: the kernel publishes an atomic decision frontier, and the policy scores the current legal actions or microturn options. It also explicitly warns against client-side completion search or multi-step speculative execution as legality machinery.

That warning is correct for legality. But it has been over-learned as a policy limitation. The right answer is not to make the kernel expose compound turns. The right answer is to let the agent build an **advisory plan** whose execution still goes through atomic kernel decisions.

### **2.3 What the current DSL cannot express naturally**

The current system cannot naturally express:

1. **Named whole-turn intent.**  
    It can say “prefer Govern” and “prefer projected margin.” It cannot naturally say “this is a Train + Govern political-engine turn whose Govern target must not be the trained space and whose final posture must preserve high-pop COIN control.”  
2. **Plan roles that persist across microturns.**  
    Selectors can rank targets, but there is no first-class `trainSpace`, `governSpace`, `origin`, `destination`, `pieceToRemove`, `route`, or `specialBeforeOperation` binding that remains visible throughout the turn.  
3. **Composed sequencing.**  
    FITL needs patterns such as Train + Govern, Patrol + Govern, Sweep + Raid, Assault + Transport + continued Assault, March + Infiltrate, Rally + Tax, and Terror + Tax. The current architecture can score the first atomic action and then hope downstream microturn scoring remains coherent.  
4. **Target selection as policy structure rather than score side effect.**  
    Current selectors rank items, but target choice is still subordinate to candidate scoring. There is no robust plan-binding model where selector output fills typed roles and subsequent microturns match legal options to those roles.  
5. **Human-plausible doctrine.**  
    Strategy modules are named, but they are still score wrappers. The evaluator computes module activation, applies scope/action-tag filters, and sums score groups into a contribution.  
6. **Final turn posture as a plan-level contract.**  
    Turn-shape evaluators inspect bounded preview outcomes and can demote candidates when objectives are not met, but they do not define a plan. The source is only `currentPreviewDrive`, bounded by depth and synthetic decision count.  
7. **Ally-as-rival as a reusable doctrine pattern.**  
    FITL requires US/ARVN and NVA/VC to be modeled as nominal allies with individual victory incentives. The current system has margin refs and standing roles, but the relationship concept is not first-class enough for authoring.

### **2.4 Why ARVN evolution got stuck**

The ARVN campaign is optimizing the wrong abstraction.

The campaign objective is metric-driven: maximize ARVN composite score against baselines. The mutable Tier 1 surface is `data/games/fire-in-the-lake/92-agents.md`; Tier 2 allows DSL extension only after proving the existing DSL cannot express the needed strategy. The seeded root causes are mostly “add/tune weights/features/preview/parameters.”

The current ARVN evolved profile confirms the trap. It uses projected margin, projected rank, normalized margin, opponent margin penalties, leader-denial terms, weighted Govern/Train terms, a module contribution, and microturn projected-margin scoring.

The `buildPoliticalEngine` module sounds like doctrine, but operationally it is still a train-tag module with selectors and fixed score groups. It does not represent Train + Govern as a composed plan with mutually constrained targets.

The existing FITL policy file contains many action-tag preferences and numeric weights: prefer Train, Patrol, Assault, Sweep, Govern, Rally, March, Attack, Terror, Tax, Subvert, Infiltrate, Bombard, plus weighted variants and projected-margin terms.

That is exactly the “weight soup” failure mode.

The problem is not that the current scores are badly tuned. The problem is that the current architecture makes **composed human tactical reasoning** unnatural. The evolution loop can mutate knobs forever and still not create a policy object equivalent to “Train in X, Govern in Y, preserve Z, avoid helping US, and adapt if Govern is unavailable.”

### **2.5 Distinguishing the gaps**

**Authoring gap:**  
 Policy authors need doctrine, plan templates, typed roles, selectors, guardrails, and trace labels. They currently get features, score terms, modules-as-score-groups, and action tags.

**Runtime gap:**  
 The runtime lacks a persistent advisory plan execution state across microturns. It evaluates the current frontier, optionally with inner preview, but it does not carry a selected whole-turn plan and bind later microturns to that plan.

**Preview gap:**  
 Preview is doing too much work as a substitute for plan reasoning. Deepening preview can estimate outcomes, but it cannot itself explain why a target pair or sequence is doctrinally right.

**Metric/evolution-loop gap:**  
 The campaign rewards ARVN score. It does not sufficiently gate on trace plausibility, plan coherence, human-like faction personality, or target reasoning. A metric-only loop will Goodhart the policy even when the trace looks bizarre.

---

## **3. Research synthesis**

No single academic/game-AI paradigm should be cargo-culted. DPSA should borrow specific ideas and reject their bad fit.

### **3.1 Behavior trees**

Behavior trees were developed largely because finite-state-machine game AI became hard to modularize and maintain; their transition logic lives in a tree hierarchy, making them modular and reactive. They are also widely used as task-switching structures in robotics and game AI.

**Borrow:** readable hierarchy, named fallback nodes, guard conditions, traceable execution, modular authoring.

**Reject:** raw BTs as the primary architecture. A behavior tree chooses behavior, but it does not by itself solve target binding, plan roles, composed turn posture, or microturn-by-microturn legal execution.

### **3.2 Hierarchical task networks**

HTN planning decomposes high-level tasks into lower-level tasks using authored methods until executable actions are reached. Recent work with LLM-generated heuristics still frames HTN around a domain model and a method library that guides decomposition.

**Borrow:** doctrine-to-plan decomposition, method/template libraries, explicit task roles, authorable tactical patterns.

**Reject:** full HTN search as runtime core. The project needs bounded deterministic current-turn planning, not an open-ended planner. HTN-style decomposition should be constrained to authored one-turn templates and finite role selectors.

### **3.3 GOAP / symbolic planning**

GOAP, famously used in *F.E.A.R.*, used STRIPS-style actions with goals, preconditions, effects, and dynamic planning to build action sequences.

**Borrow:** preconditions, effects-as-expectations, goal-driven plan construction, plan invalidation/adaptation when world state differs.

**Reject:** general symbolic planning over a full game state as the default. LudoForge already has a kernel rules protocol. The agent must not duplicate effects or legality. DPSA may use **expected effects and posture evaluators** as advisory scoring, but not as authoritative rules.

### **3.4 Utility AI**

Utility AI scores possible actions with numeric formulas and selects high-utility options; it is common in games and can be hybridized with behavior trees.

**Borrow:** local scoring, tradeoff resolution, target ranking, bounded tie-breaking.

**Reject:** utility as the top-level policy abstraction. FITL has already shown that “prefer action X with weight Y” is too weak. Utility belongs inside selectors and plan evaluators, not as the whole architecture.

### **3.5 BDI agents**

BDI architectures distinguish beliefs, desires, and intentions; plan selection is separate from plan execution, and systems may use plan libraries or external planners.

**Borrow:** the separation between current observable belief/projection, selected intent, and executing intention. This maps well to hidden-information discipline and microturn plan execution.

**Reject:** heavyweight agent mental-state machinery. The project needs declarative authoring and deterministic replay, not a general autonomous-agent framework.

### **3.6 GDL, Ludii, and general game systems**

Ludii’s ludemes are high-level, understandable units intended to be general, extensible, and efficient. Its game description language has expanded to finite deterministic, nondeterministic, and imperfect-information games.

**Borrow:** authorable game-agnostic language constructs that stay understandable and finite.

**Reject:** making LudoForge agent policies a separate general-game-playing language. The policy layer must consume existing GameSpecDoc/GameDef semantics and the kernel legal frontier; it should not become a parallel game-description system.

### **3.7 Explainable AI**

Miller’s XAI survey emphasizes that explanation must account for human explanation needs, not merely expose internal model data.

**Borrow:** traces should be organized around human-relevant reasons: doctrine, intent, target, risk, guardrail, fallback, deviation.

**Reject:** dumping raw score contributions as “explanation.” Score tables are diagnostics, not human-quality explanations.

### **3.8 Hidden information and POMDP-style reasoning**

POMDP research shows that belief-space planning under uncertainty can explode in complexity, motivating bounded and goal-constrained synthesis methods.

**Borrow:** explicit observer-safe projections, hidden/unavailable signal states, and bounded belief-like summaries.

**Reject:** full POMDP belief planning as normal runtime. Agents should use observer-safe projections and game-authored hidden-info fallbacks, not omniscient state or huge belief search.

### **3.9 MCTS**

MCTS is a heuristic search over game trees using playouts and tree expansion, often effective in board games but computationally heavy and vulnerable to pathologies such as trap-state weaknesses.

**Borrow:** bounded diagnostic use only: compare candidate plan templates, validate a tactical witness, or stress-test a selector offline.

**Reject:** MCTS as primary runtime. The project already observed multi-minute AI turns. The desired architecture must be bounded, authorable, and explainable without Monte Carlo.

---

## **4. Proposed replacement architecture: DPSA**

### **4.1 Name**

**Doctrine–Plan–Selector Architecture** (**DPSA**).

The core policy object is:

AdvisoryTurnPlan

Not:

score: number

The policy still ultimately returns exactly one kernel-published atomic decision at each microturn.

### **4.2 Conceptual layers**

DPSA has six layers.

#### **Layer 1: Observer-safe policy projection**

Before any doctrine, selector, or plan runs, the agent receives only the observer-authorized projection for its profile.

This projection exposes:

* visible state facts;  
* public or observer-visible metrics;  
* hidden/unavailable/partial signal statuses;  
* schedule lower bounds or visible prefixes where appropriate;  
* preview provenance;  
* no hidden omniscient state unless the profile is explicitly marked as analysis-only.

This is mandatory for Foundations #4 and #20.

#### **Layer 2: Doctrine modules**

A doctrine module is a named, authorable policy stance.

Examples:

* `arvn.regimePreservation`  
* `arvn.harvestPatronage`  
* `arvn.preventMilitaryCollapse`  
* `us.reluctantOccupier`  
* `nva.logisticsAndControl`  
* `vc.hiddenPoliticalNetwork`  
* `generic.blockImmediateWin`  
* `generic.preserveResourceFloor`

A doctrine module contains:

* human-readable intent;  
* activation conditions;  
* priority tier;  
* strategic thresholds;  
* plan templates it may propose;  
* guardrails;  
* relationship/rival-risk stance;  
* explanation labels.

A doctrine module should not be “a bundle of score terms.” It should be a named reason for proposing plan shapes.

#### **Layer 3: Plan templates**

A plan template is an authorable pattern for a whole-turn or current-turn tactical intention.

It defines:

* root legal action match;  
* optional special/compound action match;  
* timing: before, during, after, interrupt-after-stage;  
* ordered or partially ordered step roles;  
* role selectors;  
* constraints among roles;  
* resource/cost guardrails;  
* preview/posture evaluators;  
* fallback/deviation rules.

Examples:

* `operationThenSpecial`  
* `specialThenOperation`  
* `interruptOperationWithSpecial`  
* `moveThenAttack`  
* `exposeThenRemove`  
* `buildThenHarvest`  
* `taxThenOffsetPolitics`  
* `claimRouteWithCards`  
* `playComboCardThenAttack`

The template is generic. FITL-specific names live in the game-authored YAML through action tags, selectors, doctrine labels, and feature refs.

#### **Layer 4: First-class role selectors**

Selectors become role binders, not just ranking helpers.

A selector can bind:

* spaces/zones;  
* pieces/tokens;  
* origin spaces;  
* destination spaces;  
* origin/destination pairs;  
* routes;  
* lines of communication;  
* cards/events;  
* action variants;  
* target subsets for choose-N;  
* plan role combinations.

Selectors are generic engine machinery. Game-specific meaning comes from authored filters, attributes, token props, metrics, tags, and derived refs.

A selector has:

* source;  
* item type;  
* filters;  
* vetoes;  
* priority tiers;  
* quality components;  
* deterministic ordering;  
* caps;  
* hidden-info fallback policy;  
* trace label.

#### **Layer 5: Bounded plan proposer/evaluator**

At the start of a player’s decision horizon, usually action selection, the agent:

1. evaluates active doctrines;  
2. enumerates plan templates from those doctrines;  
3. matches each template against kernel-published legal root actions;  
4. binds role selectors with bounded top-K expansion;  
5. evaluates plan posture using observer-safe current state and bounded preview;  
6. selects a plan by priority tier, guardrails, posture, and local score;  
7. records selected plan state.

This must be bounded by explicit caps:

planBudget:  
 maxActiveDoctrines: 4  
 maxTemplatesPerDoctrine: 4  
 maxRootCandidates: 8  
 maxBindingsPerRole: 4  
 maxPlanInstances: 64  
 maxMicroturns: 24  
 previewCapClass: standard256

Those caps must be compiled, named, traced, and replayable.

#### **Layer 6: Microturn execution controller**

The execution controller persists the selected `PlanExecutionState` across microturns.

At each microturn, it:

1. reads the kernel-published legal frontier;  
2. identifies the next expected plan step or open role;  
3. matches legal options to the plan role;  
4. selects the legal option that best satisfies the role;  
5. adapts if the frontier differs;  
6. emits a deterministic trace entry.

It never constructs a move outside the legal frontier. It never declares an action legal. It never simulates legality itself.

---

## **5. Direct answers to the required architectural questions**

### **5.1 What is the right policy abstraction?**

The right abstraction is a **hybrid**:

* doctrine modules for personality and strategic stance;  
* HTN-like plan templates for composed tactical intent;  
* behavior-tree-like fallback/deviation control;  
* BDI-like separation of belief/projection, intent, and execution;  
* utility scoring only inside selectors and local plan evaluators;  
* guardrails as first-class safety/doctrine constraints;  
* bounded preview as evidence, not authority.

The current flat utility layer becomes a leaf-level tool.

### **5.2 How does the architecture represent whole-turn intent?**

Whole-turn intent is represented as an `AdvisoryTurnPlan`:

intent: arvn.buildPoliticalEngine  
doctrine: arvn.regimePreservation  
template: arvn.trainGovern  
rootActionRole: trainOperation  
specialRole: governActivity  
timing: after  
roles:  
 trainSpace: Hue  
 governSpace: DaNang  
 governMode: patronage  
posture:  
 ownMarginDelta: +2  
 usRivalRisk: acceptable  
 militaryCollapseRisk: low  
 resourceFloor: satisfied

This is not scattered across score terms. It is the traceable object driving downstream microturn choices.

### **5.3 How does the architecture bridge composed plans to microturns?**

The bridge is a **plan execution state machine over kernel-published frontiers**.

Plan proposal:

* active doctrines propose plan templates;  
* templates match legal root actions by generic tags/action IDs/compound shape;  
* selectors bind role candidates;  
* bounded preview/posture checks rank plans.

Step binding:

* each plan step declares a role and a frontier match pattern:  
  * decision kind;  
  * decision key;  
  * target kind;  
  * decision path;  
  * action tag;  
  * optional stage index;  
  * selector role.

Legal matching:

* the runtime compares each published legal option to the current role binding;  
* if exact match exists, choose it;  
* if not, re-run the role selector over actual legal options;  
* if still no match, apply fallback.

Fallback ladder:

1. rebind uncommitted role;  
2. choose next-best selector candidate;  
3. skip optional step;  
4. downgrade to alternate plan from same doctrine;  
5. downgrade to fallback doctrine;  
6. use primitive policy fallback;  
7. deterministic stable tie-break/pass guardrail if all else fails.

Trace records:

* selected doctrine;  
* selected plan template;  
* role bindings;  
* expected step;  
* actual frontier;  
* selected legal option;  
* match quality;  
* adaptation;  
* fallback;  
* deviation reason;  
* preview status.

Determinism is preserved because every enumeration is finite, sorted, capped, and replayed from recorded seeds and compiled policy fingerprints.

### **5.4 How does target selection become first-class?**

Selectors must be upgraded into **role selectors**.

Current selectors can rank finite items, but DPSA selectors bind typed plan roles and can reason over combinations. Current compiler support is already close for zones/tokens/cards/players/microturnOptions, but it lacks registered finite collections, routes, role references, subset selection, and multi-role composition.

DPSA should add:

source:  
 kind: routePairs  
 origin: { selector: arvn.safeOrigins }  
 destination: { selector: arvn.threatenedDestinations }  
 maxPairs: 24

and:

source:  
 kind: subset  
 of: selector.vc.terrorTargets  
 min: 1  
 max: 3  
 beamWidth: 6

Role selectors become the normal way to author target priorities.

### **5.5 Should sequencing be explicit?**

**Yes. Sequencing must be explicit.**

Not every sequence should be enumerated, but valuable human tactical patterns must be authorable as templates.

`Sweep -> Raid`, `Train -> Govern`, `Air Lift -> Train`, `March -> Ambush`, `March -> Infiltrate`, `Terror -> Tax`, and `Rally -> Subvert` should not be expected to emerge from unrelated scalar terms.

Sequencing remains engine-agnostic if templates use generic concepts:

timing: before | during | after  
interrupt:  
 insertAfterStage: 2  
steps:  
 - role: exposeTarget  
 - role: removeTarget

The engine does not know “Sweep” or “Raid.” The game-authored policy maps those names through action tags and role selectors.

### **5.6 Should ally-as-rival modeling be first-class?**

**Yes, but as generic policy metadata, not engine semantics.**

The engine should not know US/ARVN/NVA/VC. But the policy DSL should support relationship roles such as:

* `nominalAlly`;  
* `sharedEnemy`;  
* `rivalAlly`;  
* `leader`;  
* `nearWin`;  
* `kingmakerRisk`;  
* `cooperativeUntilThreshold`.

FITL’s report is explicit that permanent ally utility is wrong: US and ARVN, and NVA and VC, are rules-friendly but strategically misaligned.

This generalizes beyond FITL:

* semi-cooperative games;  
* team games with individual victory;  
* negotiation games;  
* multiplayer euros with kingmaking risk;  
* asymmetric war games.

### **5.7 How does the architecture preserve hidden-information discipline?**

DPSA must treat policy state as an observer projection.

Modes:

observerMode:  
 normal: currentPlayer  
 preview:  
   exactVisible: true  
   stochasticVisible: true  
   hiddenSampling: false  
 analysis:  
   omniscient: false

Normal agents:

* cannot inspect hidden full state;  
* cannot use hidden card identities;  
* cannot silently coerce hidden preview into numeric values;  
* must declare fallback for unavailable signals;  
* trace hidden-sensitive details only as hidden/unavailable statuses.

Analysis agents:

* may run omniscient diagnostics only when explicitly marked;  
* traces must be labeled `omniscientAnalysis`;  
* such profiles are not legal default playing agents.

### **5.8 How does authoring work for designers and LLMs?**

Authors should write named doctrine and plan structures, not anonymous weight lists.

Good authoring objects:

* `doctrine`;  
* `planTemplate`;  
* `role`;  
* `selector`;  
* `guardrail`;  
* `fallback`;  
* `postureEvaluator`;  
* `traceLabel`;  
* `example`.

Compiler errors should say:

`arvn.trainGovern.roles.governSpace` references role `trainSpace`, but `trainSpace` is not bound before this constraint.

not:

Unknown ref in expression.

LLMs are much better at editing named modules than mutating hundreds of numeric weights. Game designers can review doctrine like a solo-bot flowchart.

### **5.9 How does evolution work after the overhaul?**

The improve loop should mutate:

* doctrine activation conditions;  
* plan priority ordering;  
* plan templates;  
* selector filters;  
* selector quality components;  
* guardrails;  
* strategic thresholds;  
* fallback rules;  
* trace labels;  
* plan examples;  
* bounded caps within allowed classes.

It should not primarily mutate flat consideration weights.

Every experiment should classify the edit:

{  
 "mutationKind": "selector-filter",  
 "target": "arvn.governPatronageSpace",  
 "hypothesis": "avoid Passive Support -> Neutral unless ARVN near win or US near win",  
 "expectedTraceChange": "govern targets shift from Passive Support to Active Support except emergency"  
}

Campaign acceptance should require both metric improvement and trace plausibility.

### **5.10 How is success measured?**

Success must be measured in this order:

1. **General architecture suitability** across game families.  
2. **FITL expressiveness** for all four factions.  
3. **Human-plausible competence**.  
4. **Whole-turn coherence**.  
5. **First-class target reasoning**.  
6. **Explainable traces**.  
7. **Evolution readiness**.  
8. **Campaign metrics**.  
9. **Implementation feasibility**.  
10. **Performance**.

Metric-only success is not success. A bizarre ARVN that wins by loophole behavior should fail policy-quality review.

---

## **6. Authoring model**

The syntax below is illustrative, not a final schema commitment. The requirements are the important part.

### **6.1 ARVN example: Train + Govern**

agents:  
 schemaVersion: 3

 library:  
   doctrines:  
     arvn.regimePreservation:  
       label: "ARVN regime preservation"  
       intent: >  
         Hold cities, control high-pop provinces, harvest Patronage,  
         protect Aid/Econ, and cooperate with US only when it advances ARVN.  
       when:  
         not: { ref: condition.arvnImmediateMilitaryCollapse }  
       priority:  
         tier: 40  
       guardrails:  
         - arvn.doNotServeUSWin  
         - arvn.preserveAidEconFloor  
         - arvn.avoidPreCoupProvinceOvercommit  
       proposes:  
         - arvn.trainGovern  
         - arvn.patrolGovern  
         - arvn.sweepRaid  
         - arvn.assaultTransportAssault

   planTemplates:  
     arvn.trainGovern:  
       label: "Train + Govern"  
       intent: arvn.buildPoliticalEngine  
       root:  
         actionTags: [train]  
         compound:  
           specialTags: [govern]  
           timing: after

       roles:  
         trainSpace:  
           selector: arvn.trainSpaceForControlOrPacification  
           required: true

         governSpace:  
           selector: arvn.governPatronageSpace  
           required: true  
           constraints:  
             - notEqual: role.trainSpace

         governMode:  
           selector: arvn.governMode  
           required: true

       steps:  
         - label: "Select Train space"  
           role: trainSpace  
           match:  
             decisionKind: chooseNStep  
             targetKind: zone  
             decisionPath: main

         - label: "Select Govern space"  
           role: governSpace  
           match:  
             decisionKind: chooseNStep  
             targetKind: zone  
             decisionPath: compound.specialActivity

         - label: "Select Govern mode"  
           role: governMode  
           match:  
             decisionKind: chooseOne  
             decisionPath: compound.specialActivity

       posture:  
         must:  
           - { ref: posture.arvnResourceFloorAfterTurn.satisfied }  
         prefer:  
           - id: ownMargin  
             value: { ref: preview.plan.delta.victoryMargin.self }  
           - id: denyUSIfClose  
             when: { ref: standing.us.nearWin }  
             value:  
               neg: { ref: preview.plan.delta.victoryMargin.us }

       fallback:  
         ifSpecialUnavailable: tryPlan arvn.trainForControlOnly  
         ifGovernTargetUnavailable: tryPlan arvn.patrolGovern  
         ifPreviewUnavailable: traceAndUseSelectorOnly

### **6.2 ARVN selector example: Govern target**

selectors:  
 arvn.governPatronageSpace:  
   label: "ARVN Govern Patronage target"  
   source: { kind: zones }  
   item: zone

   where:  
     and:  
       - { ref: item.zone.isCoinControlled }  
       - { ref: item.zone.isSupported }  
       - not: { ref: item.zone.tag.saigon }  
       - not:  
           eq:  
             - { ref: item.zone.id }  
             - { ref: role.trainSpace.id }

   vetoes:  
     - id: doNotHelpUSWin  
       when:  
         and:  
           - { ref: standing.us.nearWin }  
           - gt:  
               - { ref: item.zone.supportLossIfGovern }  
               - 0  
           - not: { ref: standing.arvn.canWinThisTurn }  
       severity: demote

   priorityTiers:  
     - id: winningGovern  
       when: { ref: selectorItem.pushesSelfToWin }  
     - id: highPopulationActiveSupport  
       when:  
         and:  
           - gt: [{ ref: item.zone.population }, 1]  
           - { ref: item.zone.activeSupport }

   quality:  
     components:  
       - id: populationPatronage  
         weight: 10  
         value: { ref: item.zone.population }

       - id: activeToPassiveStillSupported  
         weight: 8  
         value:  
           boolToNumber: { ref: item.zone.activeSupport }

       - id: arvnOverUsCubePatronageMode  
         weight: 6  
         value:  
           boolToNumber: { ref: item.zone.arvnCubesExceedUsCubes }

       - id: passiveToNeutralRallyRisk  
         weight: -7  
         value:  
           boolToNumber: { ref: item.zone.passiveSupport }

       - id: usRivalRisk  
         weight: -12  
         when: { ref: standing.us.nearWin }  
         value: { ref: item.zone.usSupportValueLostByGovern }

   result:  
     maxItems: 4  
     order: [priorityTierAsc, qualityDesc, stableKeyAsc]  
     onEmpty: traceAndNoContribution

This is a named target policy. A designer can read it. An LLM can safely refactor it.

### **6.3 ARVN example: Sweep + Raid**

planTemplates:  
 arvn.sweepRaid:  
   label: "Sweep + Raid"  
   intent: arvn.exposeThenRemoveHighValueThreat  
   root:  
     actionTags: [sweep]  
     compound:  
       specialTags: [raid]  
       timing: after

   roles:  
     sweepSpace:  
       selector: arvn.sweepToExposeSpace  
     raidTargetPiece:  
       selector: arvn.raidRemovalTarget  
       constraints:  
         - locatedIn: role.sweepSpace

   posture:  
     prefer:  
       - id: controlSwing  
         value: { ref: preview.plan.delta.coinControlledPopulation.self }  
       - id: baseRemoval  
         value: { ref: preview.plan.removesInsurgentBase }  
       - id: patronageProtection  
         value: { ref: preview.plan.protectsGovernTarget }

### **6.4 Non-FITL simple-game example**

Consider a simple route-claiming card/board game. The same architecture applies.

doctrines:  
 blue.completeNetwork:  
   label: "Complete network objective"  
   intent: "Claim routes that connect existing cities toward destination tickets."  
   when: { ref: condition.hasOpenDestinationTicket }  
   proposes:  
     - blue.claimCriticalRoute  
     - blue.drawNeededCards

planTemplates:  
 blue.claimCriticalRoute:  
   label: "Claim route with matching cards"  
   root:  
     actionTags: [claim-route]

   roles:  
     route:  
       selector: blue.criticalUnclaimedRoute

     paymentCards:  
       selector: blue.paymentCardSubset  
       constraints:  
         - paysFor: role.route

   steps:  
     - role: route  
       match:  
         decisionKind: chooseOne  
         targetKind: zone

     - role: paymentCards  
       match:  
         decisionKind: chooseNStep  
         targetKind: token

selectors:  
 blue.criticalUnclaimedRoute:  
   source: { kind: authoredFinite, collectionId: routes }  
   where:  
     and:  
       - not: { ref: item.route.claimed }  
       - { ref: item.route.visible }  
   quality:  
     components:  
       - id: connectsOpenTicket  
         weight: 10  
         value: { ref: item.route.destinationTicketProgress }  
       - id: blocksOpponent  
         weight: 3  
         value: { ref: item.route.opponentBlockValue }  
       - id: cardCost  
         weight: -2  
         value: { ref: item.route.requiredCardCount }

 blue.paymentCardSubset:  
   source:  
     kind: subset  
     of: collection.visibleHandCards  
     min: 1  
     max: 6  
     beamWidth: 12  
   where:  
     canPayFor: role.route  
   quality:  
     components:  
       - id: preserveWilds  
         weight: -5  
         value: { ref: item.subset.wildCardCount }  
       - id: exactPayment  
         weight: 4  
         value: { ref: item.subset.exactPayment }

This shows the architecture is not FITL-specific. It works for routes, cards, hidden hands, and choose-N payment decisions.

---

## **7. FITL expressiveness check**

### **7.1 ARVN**

ARVN is the stress test. The report describes ARVN as a self-interested regime-security faction that wants COIN-Controlled Population, Patronage, Aid/Resources, Support to harvest, and enough military force to prevent collapse. It must be selfish, not a US helper.

DPSA can encode ARVN through these doctrines:

arvn.blockImmediateWin  
arvn.harvestPatronage  
arvn.holdCitiesAndHighPop  
arvn.protectAidEcon  
arvn.selectiveViolence  
arvn.denyUSIfTooClose  
arvn.preCoupRedeployDiscipline

Plan templates:

arvn.trainGovern  
arvn.patrolGovern  
arvn.sweepRaid  
arvn.assaultRaid  
arvn.trainTransport  
arvn.assaultTransportAssault

First-class selectors:

arvn.governPatronageSpace  
arvn.trainSpaceForControlOrPacification  
arvn.patrolLocOrCity  
arvn.sweepToExposeSpace  
arvn.raidRemovalTarget  
arvn.transportOrigin  
arvn.transportDestination  
arvn.assaultTargetSpace  
arvn.pieceRemovalPriority

Guardrails:

arvn.doNotGovernAwaySupportEverywhere  
arvn.doNotServeUSWin  
arvn.preserveAidEconFloor  
arvn.doNotLoseOriginControlByTransport  
arvn.doNotOvercommitTroopsPreCoupWithoutBase  
arvn.doNotFightLowYieldHighlands

This is exactly the missing layer. Current ARVN can prefer Govern. DPSA can decide **where**, **why**, **with what operation carrier**, **with what special timing**, and **what posture after execution**.

### **7.2 US**

The US doctrine should encode:

* Support over territory;  
* Available US preservation;  
* pacification and stabilization;  
* use ARVN/Irregulars/Advise as force multipliers;  
* avoid Air Strike political poison unless payoff is decisive;  
* prevent VC political score and NVA control collapse;  
* keep ARVN strong but not winning.

Plan templates:

us.trainAdvise  
us.patrolAdvise  
us.sweepAirStrike  
us.assaultAirLiftAssault  
us.airLiftTrain  
us.pacificationSetupBeforeCoup

Selectors:

us.pacifySupportTarget  
us.irregularPlacement  
us.airStrikeTargetWithPoliticalCost  
us.advisePartnerSpace  
us.withdrawalCandidate  
us.nvaControlThreat  
us.vcPoliticalThreat

US becomes a reluctant occupying force, not a kill-maximizer.

### **7.3 NVA**

The NVA report describes a logistics-driven conventional insurgent army: Trail, Bases, Laos/Cambodia, high-pop NVA Control, Infiltrate, and direct force when it changes Control or protects Bases.

Plan templates:

nva.rallyInfiltrate  
nva.marchInfiltrate  
nva.marchAmbush  
nva.attackAmbush  
nva.terrorFutureRally  
nva.locOccupationBeforeCoup

Selectors:

nva.controlSwingDestination  
nva.baseBuildSite  
nva.trailImprovementTiming  
nva.vcBaseToInfiltrate  
nva.bombardTarget  
nva.ambushKeyPiece  
nva.originPreserveControl

Rival-ally doctrine handles VC pieces blocking NVA Control and VC Bases becoming Infiltrate targets when VC is near victory.

### **7.4 VC**

The VC report describes a clandestine political network: Opposition, Bases, Underground status, Terror, Agitation, Tax, Subvert, Ambush, and making COIN spend two actions to solve one-guerrilla problems.

Plan templates:

vc.rallySubvert  
vc.marchSubvert  
vc.terrorSubvert  
vc.terrorTax  
vc.marchAmbushFromLoc  
vc.rallyUndergroundResetThenTerror

Selectors:

vc.terrorPoliticalTarget  
vc.taxTarget  
vc.subvertArvnCubeTarget  
vc.ambushKeyPiece  
vc.baseSite  
vc.undergroundResetSpace  
vc.nvaInfiltrationRiskSpace

Guardrails:

vc.doNotFightLikeNVA  
vc.doNotExposeForLowValueAttack  
vc.doNotTaxHighPopWithoutPoliticalOffset  
vc.protectBaseFromNvaInfiltrate

The VC becomes a hidden political insurgency, not a generic insurgent combat bot.

---

## **8. Generalization check**

DPSA is not FITL-specific.

### **8.1 Perfect-information board game**

Example: chess-like or abstract strategy game.

* doctrines: material, king safety, territory, tempo;  
* plans: develop piece, attack weak piece, defend threat, force exchange;  
* selectors: pieces, squares, move targets, lines;  
* microturn bridge: choose legal move;  
* hidden info: none.

The plan horizon can be “one move plus local tactical posture,” not whole-game search.

### **8.2 Hidden-information card game**

Example: trick-taking or hand-management game.

* doctrines: preserve trump, void suit, force opponent, protect partner;  
* plans: play low, draw out trump, cash winner, discard safely;  
* selectors: visible cards, legal cards, inferred risk buckets;  
* hidden info: observer-safe hand/deck projections;  
* preview: unavailable/partial for hidden hands.

No omniscient card peeking.

### **8.3 Stochastic game**

Example: dice combat or event deck.

* doctrines: risk tolerance, expected value, preserve rerolls;  
* plans: attack now, build defense, fish for event, pass;  
* selectors: targets and probability buckets;  
* preview: stochastic status and bounded outcome summaries;  
* trace: risk reason, not fake certainty.

### **8.4 Asymmetric phase-heavy game**

Example: COIN, Twilight Struggle-like phase game, Root-like asymmetry.

* doctrines per faction;  
* plan templates per faction/action family;  
* phase and schedule refs;  
* guardrails around resource floors and timing windows;  
* relationship/standing roles.

This is DPSA’s home territory.

### **8.5 Tactical card/board game with target selection**

Example: a combat card game with board positions.

* doctrines: burst damage, board control, combo setup, defense;  
* plans: play card combo, move unit, attack target, protect unit;  
* selectors: cards, units, positions, routes, target subsets;  
* microturns: select card, choose target, pay costs, resolve optional effects.

DPSA handles target selection and sequencing without hardcoding game semantics.

---

## **9. Validation and test plan**

### **9.1 Compiler validation**

The compiler must validate everything statically knowable, consistent with Foundation #12.

Required compiler checks:

* doctrine IDs unique;  
* plan template IDs unique;  
* every plan role references an existing selector;  
* every role constraint references a previously bound or explicitly forward-declared role;  
* every selector source is finite and capped;  
* every subset/product selector has max bounds;  
* every plan template has max step count;  
* every fallback target exists;  
* no fallback cycle unless bounded by explicit max attempts;  
* every preview-derived component declares fallback;  
* hidden-info refs are disallowed unless observer-visible or explicitly fallback-handled;  
* every deterministic order has stable tie-breaker;  
* all cap classes are named and within allowed values;  
* all trace labels are deterministic strings;  
* no game-specific engine schema.

### **9.2 Runtime invariants**

Runtime must assert:

* selected microturn decision is always in published legal frontier;  
* plan never directly mutates state;  
* plan never declares legality;  
* every adaptation/deviation is traced;  
* every hidden/unavailable signal remains unavailable unless observer-visible;  
* plan execution state is serializable and deterministic;  
* plan execution terminates within cap;  
* fallback ladder cannot loop indefinitely.

### **9.3 Determinism and replay tests**

Tests should prove:

* same GameDef + state + seed + policy fingerprint yields byte-identical plan trace;  
* plan proposal order is stable;  
* selector rankings are stable;  
* role bindings are stable;  
* fallback decisions are stable;  
* preview unavailable paths are stable;  
* replay reconstructs the same selected plan and microturn decisions.

Existing tests already prove some score-module determinism and bounded turn-shape behavior; DPSA needs analogous tests for plan state and role binding.

### **9.4 Policy-quality witness tests**

These should be warning-class profile-quality tests, not engine determinism tests.

ARVN witnesses:

* **Train + Govern separation:** Train and Govern target different spaces when rules require it.  
* **Govern Patronage:** chooses high-pop Active Support Govern before low-pop Passive Support unless emergency.  
* **US rival risk:** when US is near victory, ARVN does not blindly preserve Support for US.  
* **Aid/Econ protection:** Patrol + Govern beats Train + Govern when LoCs/Econ are threatened.  
* **Sweep + Raid:** exposes Underground guerrillas before Raid when removal requires exposure.  
* **Transport origin discipline:** refuses Transport that loses critical origin control.  
* **Pre-Coup posture:** avoids placing Troops in provinces that Redeploy will undo unless a base/police posture justifies it.

US witnesses:

* avoids Air Strike in populated Support unless blocking a win or removing decisive threat;  
* uses Advise/Air Lift to multiply force;  
* does not let ARVN win through free Patronage.

NVA witnesses:

* March + Infiltrate when VC Base is stealable and VC is near win;  
* protects Trail before Coup;  
* avoids losing existing NVA Control by moving out.

VC witnesses:

* avoids conventional Attack unless Ambush/key-piece payoff;  
* uses Terror + Tax intelligently;  
* protects VC Bases from NVA Infiltrate.

### **9.5 Trace golden tests**

Golden traces should assert:

* selected doctrine;  
* selected plan;  
* selected roles;  
* selector top alternatives;  
* guardrails fired/skipped;  
* preview statuses;  
* fallback/deviation reason;  
* final selected microturn;  
* final posture summary.

### **9.6 FITL campaign checks**

The campaign harness should add plausibility gates:

hard gates:  
 compile passes  
 determinism passes  
 hidden-info discipline passes  
 plan trace present  
 no unbounded fallback  
 no preview-no-signal chosen as if scored

quality gates:  
 ARVN witness scenarios pass  
 trace plausibility score >= threshold  
 no bizarre-action regression  
 metric improves or near-miss retained

Composite score remains useful, but only after trace/plausibility gates pass.

### **9.7 Authoring-error tests**

Examples:

* selector lacks stable tie-breaker;  
* subset selector missing cap;  
* plan role references missing selector;  
* plan step references unbound role;  
* hidden card selector used by normal observer without fallback;  
* fallback cycle detected;  
* plan template exceeds step cap;  
* relationship role references unknown seat;  
* preview component lacks fallback.

---

## **10. Migration plan**

### **10.1 Replace `agents:` with schemaVersion 3, not a permanent sidecar**

Do not add a long-lived `agentsV2` or `agentsV3` production sidecar. Foundation #14 forbids compatibility shims in production.

During implementation, a branch can carry transitional code. The final merged state should migrate owned artifacts and delete obsolete primary paths.

Recommended final shape:

agents:  
 schemaVersion: 3  
 library:  
   doctrines: ...  
   planTemplates: ...  
   selectors: ...  
   guardrails: ...  
   postureEvaluators: ...  
   primitiveScorers: ...  
 profiles:  
   arvn:  
     doctrineSet: ...  
     fallbackPolicy: ...  
 bindings:  
   arvn: arvn

### **10.2 Preserve useful current features by demoting them**

| Current feature | DPSA fate |
| ----- | ----- |
| stateFeatures | Keep as measurement refs. |
| candidateFeatures | Keep as root-action and local option measurements. |
| selectors | Upgrade to role selectors and combination selectors. |
| strategyModules | Replace with doctrine modules. |
| guardrails | Keep and promote to doctrine/plan/selector guardrails. |
| turnShapeEvaluators | Replace/extend into posture evaluators. |
| considerations | Demote to primitive/local scorers. |
| tieBreakers | Keep. |
| strategicConditions | Keep and expand into doctrine activation/standing roles. |
| preview config | Keep but attach to plan/posture evaluation. |

### **10.3 Migrate FITL profiles**

Start with ARVN because the campaign is already focused there.

Migration sequence:

1. Convert `arvn-evolved` into doctrine modules:  
   * `arvn.blockImmediateWin`  
   * `arvn.buildPoliticalEngine`  
   * `arvn.holdHighPopControl`  
   * `arvn.protectAidEcon`  
   * `arvn.selectiveViolence`  
   * `arvn.denyUSRivalWin`  
2. Convert `buildPoliticalEngine` into `arvn.trainGovern` and `arvn.patrolGovern`.  
3. Convert `arvnPoliticalTargetOpportunity` into real target selectors:  
   * `arvn.governPatronageSpace`  
   * `arvn.trainSpaceForControlOrPacification`  
   * `arvn.patrolLocTarget`  
4. Convert microturn projected-margin selector into a fallback primitive scorer, not the primary target system.  
5. Add witness scenarios and trace goldens before running campaign evolution.

Then migrate US, NVA, VC at lower fidelity but with correct doctrine skeletons. All four need personalities from the FITL report.

### **10.4 Update cookbook**

The cookbook should be rewritten from “scoring legal frontiers” to “doctrine-first advisory planning over legal microturns.”

Candidate replacement section:

## Agent v3 mental model

An agent policy is doctrine first.

The kernel still publishes only atomic legal decisions. A policy may build an  
advisory whole-turn plan, but every step of that plan must be executed by  
selecting one of the kernel-published legal decisions. The plan is never  
authoritative legality.

Author policies in this order:

1. Doctrine: what kind of player is this seat?  
2. Plan templates: what composed turn shapes can this doctrine pursue?  
3. Role selectors: which spaces, pieces, cards, routes, or subsets fill the plan?  
4. Guardrails: what must not happen?  
5. Posture evaluators: what should be true after the turn?  
6. Fallbacks: how should the agent adapt if the frontier differs?  
7. Primitive scorers: local tie-breakers only.

### **10.5 Adapt `campaigns/fitl-arvn-agent-evolution`**

The campaign should stop treating weight mutation as the main search space.

New mutation categories:

doctrine-activation  
plan-template  
role-selector-filter  
role-selector-component  
guardrail-threshold  
posture-evaluator  
fallback-rule  
priority-tier  
trace-label  
primitive-scorer

The harness should collect:

* plan template frequency;  
* doctrine activation frequency;  
* role selector top choices;  
* fallback/deviation counts;  
* preview unavailable counts;  
* plausibility witness pass/fail;  
* ARVN metric score.

A candidate that improves score but increases bizarre deviations should be rejected.

---

## **11. Implementation requirements**

### **11.1 File-level areas likely to change**

Core schema/compiler:

* `packages/engine/src/cnl/game-spec-doc.ts`  
* `packages/engine/src/cnl/compile-agents.ts`  
* `packages/engine/src/cnl/validate-agents.ts`  
* new `compile-agent-doctrines.ts`  
* new `compile-agent-plan-templates.ts`  
* new `compile-agent-role-selectors.ts`  
* new `compile-agent-posture-evaluators.ts`

Runtime:

* `packages/engine/src/agents/policy-agent.ts`  
* `packages/engine/src/agents/policy-eval.ts`  
* `packages/engine/src/agents/policy-evaluation-core.ts`  
* `packages/engine/src/agents/policy-selector-eval.ts`  
* new `doctrine-plan-agent.ts`  
* new `plan-proposal.ts`  
* new `plan-execution.ts`  
* new `role-selector-eval.ts`  
* new `plan-trace.ts`

Types:

* agent-related types in `packages/engine/src/kernel/types-core.ts` or adjacent type modules;  
* trace types;  
* compiled policy catalog schema.

Tests:

* `packages/engine/test/unit/agents/`  
* `packages/engine/test/unit/cnl/`  
* `packages/engine/test/integration/agents/`  
* `packages/engine/test/policy-profile-quality/`  
* determinism tests for plan traces.

Docs/campaign:

* `docs/agent-dsl-cookbook.md`  
* `campaigns/fitl-arvn-agent-evolution/program.md`  
* `data/games/fire-in-the-lake/92-agents.md`

### **11.2 New compiled concepts**

CompiledDoctrineModule  
CompiledPlanTemplate  
CompiledPlanRole  
CompiledRoleSelector  
CompiledPlanGuardrail  
CompiledPostureEvaluator  
CompiledFallbackPolicy  
CompiledRelationshipRole  
CompiledAdvisoryPlanTrace

### **11.3 Runtime concepts**

AdvisoryTurnPlan  
PlanCandidate  
PlanRoleBinding  
PlanExecutionState  
PlanStepMatch  
PlanDeviation  
PlanFallbackEvent  
PlanTrace

### **11.4 Trace changes**

Trace should contain a new top-level plan section:

{  
 "agentDecision": {  
   "policyVersion": 3,  
   "doctrine": {  
     "selected": "arvn.regimePreservation",  
     "active": ["arvn.harvestPatronage", "arvn.holdHighPopControl"],  
     "rejected": [  
       {"id": "arvn.selectiveViolence", "reason": "noHighValueTargets"}  
     ]  
   },  
   "plan": {  
     "selectedTemplate": "arvn.trainGovern",  
     "intent": "arvn.buildPoliticalEngine",  
     "bindings": {  
       "trainSpace": "Hue",  
       "governSpace": "DaNang"  
     },  
     "posture": {  
       "ownMarginDelta": 2,  
       "usRivalRisk": "acceptable",  
       "previewStatus": "ready"  
     },  
     "alternatives": [  
       {"template": "arvn.patrolGovern", "reason": "lowerPatronageGain"}  
     ]  
   },  
   "microturn": {  
     "expectedStep": "Select Govern space",  
     "matchedRole": "governSpace",  
     "selectedLegalOption": "DaNang",  
     "match": "exact",  
     "deviation": null  
   }  
 }  
}

### **11.5 Smallest coherent first implementation slice**

The first implementation slice should not attempt all of DPSA.

Build:

1. schemaVersion 3 doctrine modules;  
2. one-turn plan templates with ordered steps;  
3. role selectors over existing selector sources plus role references;  
4. plan execution state across microturns;  
5. trace;  
6. ARVN `Train + Govern`;  
7. tests proving legality frontier compliance, determinism, trace, and fallback.

Do **not** start with all factions. Do **not** start with route selectors. Do **not** start with hidden-info belief modes beyond preserving current observer discipline.

Minimum ARVN slice:

Doctrine: arvn.buildPoliticalEngine  
Plan: Train + Govern  
Selectors: trainSpace, governSpace  
Guardrails: not same space, do not help near-winning US, resource floor  
Trace: doctrine, plan, roles, selected microturn, fallback  
Witness: chooses sensible Train + Govern in constructed scenario

If that slice cannot be implemented cleanly, the architecture is wrong. If it works, the rest follows.

---

## **12. Risks and rejected alternatives**

### **12.1 Why not MCTS?**

MCTS is too slow, too opaque, and too alien for the target. It can be a diagnostic/proof tool, not the primary agent. FITL turns are complex, microturn-heavy, and often involve hidden/stochastic/phase effects. The desired agent must be authorable and human-plausible.

### **12.2 Why not simply more weights?**

Because the failure is structural.

More weights cannot create persistent roles, explicit sequence intent, target dependencies, whole-turn posture, or deviation traces. They only make the soup thicker.

The current ARVN profile already has projected margins, rank, normalized margin, opponent penalties, leader denial, Govern/Train weights, modules, turn-shape evaluators, and microturn projected-margin scoring.

That is enough evidence. The primary abstraction has failed.

### **12.3 Why not game-specific hardcoded bots?**

Because that violates Foundation #1 and destroys LudoForge’s purpose. The engine must not contain FITL, ARVN, Patronage, COIN Control, Coup, Monsoon, or Trail logic.

Game-specific policy semantics belong in declarative GameSpecDoc/YAML artifacts.

### **12.4 Why not expose compound turns as legal actions?**

Because that violates the microturn contract and Foundations #18/#19. Every kernel-visible decision is atomic; compound turns emerge from decision sequences.

DPSA plans are advisory, not legal moves.

### **12.5 Performance risks**

Plan expansion can explode if selectors/products/subsets are careless.

Mitigation:

* top-K role caps;  
* product caps;  
* subset beam widths;  
* max plan instances;  
* max active doctrines;  
* max steps;  
* named preview cap classes;  
* deterministic early pruning by guardrails;  
* memoized selector evaluation;  
* no unbounded recursion.

### **12.6 Overfitting FITL**

The architecture could overfit if “operation + special activity” becomes baked into engine concepts.

Mitigation:

* define plans in generic terms: root action, optional companion action, timing, steps, roles;  
* support route/card/subset examples from day one;  
* conformance corpus across game families;  
* keep FITL words only in YAML.

---

## **13. Final recommendation**

**Go. Replace the primary policy architecture with DPSA.**

The current agent system should be treated as a useful v2 substrate, not a competent long-term policy architecture. It has good legality discipline, preview discipline, deterministic scoring, selectors, guardrails, and trace foundations. But it does not have the right policy abstraction.

The correct first implementation order is:

1. Write the v3 requirements/spec around DPSA and Foundations.  
2. Add compiled schema for doctrine modules, plan templates, role selectors, posture evaluators, fallback policies, and plan trace.  
3. Implement bounded plan proposal for actionSelection only.  
4. Implement persistent plan execution over `chooseOne`/`chooseNStep`.  
5. Implement first-class role selector references and role constraints.  
6. Add trace goldens and determinism tests.  
7. Migrate ARVN `Train + Govern` as the first real policy.  
8. Add ARVN witness tests.  
9. Extend to `Patrol + Govern`, `Sweep + Raid`, and `Train + Transport`.  
10. Update improve-loop to mutate doctrine/plan/selector structures.  
11. Migrate US/NVA/VC doctrine skeletons.  
12. Retire flat considerations as primary policy and keep them only as primitive fallback/local scoring.

The smallest coherent slice is:

**ARVN Train + Govern with doctrine, two role selectors, target constraints, posture evaluation, fallback, deterministic trace, and microturn execution through published legal decisions.**

That slice proves the architecture. Everything else is scaling.

The hard line: do not spend another campaign cycle tuning ARVN’s numeric weights as the main solution. That path has already produced exactly the pathology the FITL report warns against: marginal trace improvements, preview plumbing, and weight soup instead of competent human-like policy.

