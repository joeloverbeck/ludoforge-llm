# **Requirements-First AI Architecture Audit for LudoForge Agents**

> **Reassessed via `/brainstorm` on 2026-05-22 — operationalized + dispositioned.** Every load-bearing codebase claim below was verified against `main`. The audit's central architectural framing ("the architecture is not yet the architecture; perform a second major iteration") was **corrected**: the Doctrine–Plan–Role–Target shape this audit re-derives was already landed by the completed Specs 186–188, and Spec 186 §11 had already rejected two of this audit's re-proposals on Foundations merits (new doctrine layer; "weights have failed"). The genuinely-unaddressed residue was operationalized as two specs — **`archive/specs/190-plan-primary-root-selection.md`** (claim #1, the verified root-authority gap) and **`archive/specs/191-plan-role-semantic-integrity.md`** (claims #4/#5/#6/#9, the accept-but-don't-enforce gaps) — sequenced in **`specs/IMPLEMENTATION-ORDER.md`**. Per-recommendation dispositions (adopted / corrected / deferred / rejected, including the refuted claim #7 and the rejected doctrine-layer/hidden-info-mode/game-specific-target-kind items) live in each spec's §11 Reassessment. The `value:1` "scalar soup" critique (claims #2/#3) was found to describe the demoted-by-design leaf scorers Spec 186 §11 deliberately kept; Spec 190's root-authority fix relocates them without a profile rewrite.

Evidence discipline used here: I used the uploaded manifest as the file inventory, not as code evidence, and fetched current-main files directly from `joeloverbeck/ludoforge-llm` at `main` SHA `39dc4f288644cd2553d6802bf6e70ef4cc7657e1`. The uploaded FITL report copy was superseded by the current-main fetch and is not treated as repository truth.

## **1. Executive verdict**

**Best architecture:** a **Doctrine–Plan–Role–Target Architecture**: declarative doctrine modules select a bounded whole-turn intent; explicit plan templates represent composed operation/special sequencing; first-class typed role/target binders select spaces, pieces, origins, destinations, routes, cards, action variants, and subsets; posture and relationship evaluators apply strategic guardrails; a microturn execution controller realizes the plan only through kernel-published atomic legal decisions; traces record every doctrine, role binding, fallback, preview signal, and deviation.

**Does the landed architecture achieve that?** Not yet. It has many of the right surfaces: plan templates, strategy modules, selectors, posture evaluators, relationship roles, guardrails, bounded caps, plan traces, and policy-quality probes. The current FITL file includes all four base-game factions and explicit plan templates for Train→Govern, Patrol→Govern, Sweep→Raid, Assault→Transport→Assault, Train→Advise, Assault→Air Lift→Assault, March→Infiltrate, Terror→Tax, and more.

**But the current architecture is still not the primary decision architecture.** In `PolicyAgent`, root action selection is still made by the old scalar policy evaluation path; advisory plan proposal is appended afterward and committed as trace/state. The plan controller then influences later microturns, but the selected plan is not yet the authoritative root chooser. That is the main architectural break.

**Verdict:** keep the landed core, but perform a **second major architectural iteration**, not a blank-slate replacement. The core surfaces are directionally correct and worth preserving. The next iteration must replace the root-selection integration, strengthen the target-role model, remove the remaining scalar-soup dominance, and make validation prove plan/frontier/target semantics rather than merely checking YAML shape.

The landed architecture is a promising prototype of the right architecture. It is not yet the architecture.

---

## **2. Requirements extracted from `fitl-competent-agent-ai.md`**

The current-main `fitl-competent-agent-ai.md` explicitly says it is **not** architecture advice: it does not prescribe scoring formulas, a policy DSL, target selectors, plan-template schemas, search algorithms, or bot flowcharts. It is behavioral competence evidence only.

### **Shared FITL-grade requirements**

The report proves that a competent agent must reason over whole composed turns, not independent action labels. It names patterns such as Sweep then removal, March→Ambush, March→Infiltrate, Train→Govern, Assault→mobility→continued Assault, Tax during Terror, and Air Lift before Train. It also requires current victory margins, Coup/Monsoon timing, eligibility and next-card opportunity, legality/resource costs, operation plus special-activity combinations, target-space value, ally-rival risk, and whether a move improves the faction’s own margin or only helps a nominal partner.

Generic expressive requirements implied:

| Requirement | Why FITL proves it |
| ----- | ----- |
| **Whole-turn horizon** | Many strong turns are only strong because the operation and special activity compound. |
| **Explicit sequencing** | Assault→Air Lift→Assault and Assault→Transport→Assault require ordered interruption semantics, not a flat preference for Assault or Air Lift. |
| **First-class targets** | Competence depends on selected spaces, pieces, origins, destinations, routes, LoCs, and subsets. |
| **Future legality/setup** | Train can create Pacification legality; Terror can open Rally; March can set up Infiltrate. |
| **Resource and logistics reasoning** | Aid/Econ/LoCs, Trail, bases, and resources are recurring strategic constraints. |
| **Coup/Monsoon horizon** | Monsoon suppresses Sweep/March and restricts air actions; Coup changes scoring, redeploy, markers, resources, Trail, and underground status. |
| **Ally-as-rival** | US/ARVN and NVA/VC are friendly by rules but opposed by victory conditions. |
| **Risk/exposure** | Underground/active status, Air Strike political cost, Bombard vulnerability, origin-control loss, and redeploy traps all matter. |
| **Observer discipline** | Hidden/active status and visible future-card information must be handled through observer-safe surfaces, not omniscience. |

### **US requirements**

US competence is a balance between **Support** and **Available US pieces**. The US must not behave as a pure military optimizer. It should build Support, preserve Aid/Econ, use force surgically, avoid overcommitting troops, avoid casual Air Strikes in populated Support spaces, and avoid handing ARVN a Patronage win. It must express Train→Advise, Patrol→Advise, Sweep→Air Strike, Assault→Air Lift→Assault, and Air Lift→Train as possible tactical patterns.

Generic requirements: support-value target scoring, available-piece opportunity cost, political collateral damage, ally-rival risk against ARVN, force-multiplier plans, and target differentiation between populated spaces, zero-pop spaces, Bases, LoCs, Active guerrillas, and NVA control spaces.

### **ARVN requirements**

ARVN is the hardest current design target. It must behave as a **self-interested regime-security faction**, not a US helper. It scores COIN-Controlled Population plus Patronage, so it must Govern aggressively but not blindly, hold cities and high-pop provinces, protect Aid/Econ, train Troop/Police pairs, build province bases where redeploy matters, use Transport and Rangers/Raid surgically, and fight only where Control, Patronage, Aid, or victory margins are at stake. Its key combinations include Train→Govern, Patrol→Govern, Sweep→Raid, Assault→Raid, Train→Transport, and Assault→Transport→Assault.

Generic requirements: role separation constraints such as “Govern elsewhere than Train,” origin/destination reasoning, piece-pair construction, future redeploy safety, Patronage-vs-US-Support tradeoffs, resource floors, and near-Coup posture.

### **NVA requirements**

NVA is a logistics-backed conventional insurgent army. It wins through NVA-Controlled Population plus NVA Bases, not Opposition. It must build Trail, build and protect Bases, use Laos/Cambodia routes, mass for Control, exploit or steal VC infrastructure, and avoid helping VC win. Key combinations include Rally→Infiltrate, March→Infiltrate, March→Ambush, Attack→Ambush, Terror→future Rally, and LoC occupation before Coup.

Generic requirements: route/logistics reasoning, base-network reasoning, ally-as-rival conversion, control-blocking by nominal allies, future Rally setup, Trail value, LoC disruption, and massing without overexposing to counterstrikes.

### **VC requirements**

VC is a clandestine political network. It wins with Opposition plus VC Bases, not conventional Control. It must stay Underground, create Opposition, build and protect Bases, use Terror/Agitation as the main scoring engine, Tax carefully, Subvert ARVN cubes and Patronage, Ambush surgically, avoid conventional fights, and protect Bases from both COIN removal and NVA Infiltrate. Key combinations include Rally→Subvert, March→Subvert, Terror→Subvert, Terror→Tax, March→Ambush from LoC, and Rally reset→future Terror.

Generic requirements: hidden/active status value, political target selection, resource-with-collateral reasoning, anti-ARVN piece selection, base vulnerability to multiple enemies, LoC platform reasoning, and “small hidden cell creates large political swing” doctrine.

---

## **3. Research synthesis**

No single external paradigm should be imported wholesale. LudoForge needs a hybrid, but the hybrid has to be principled.

### **HTN planning: borrow decomposition, reject unbounded planning**

HTN planning is a strong fit at the **authoring abstraction** level: high-level tasks decompose through a method library into lower-level steps, introducing domain knowledge that cuts search space. HATP describes HTN as using hierarchical domain control knowledge to reduce classical planning search while preserving flexibility in lower-level ordering; a 2026 paper also frames HTN as decomposition of higher-level tasks into executable actions and reports LLM-generated heuristics reducing search effort in standard HTN domains.

What to borrow: named doctrine, plan templates, bounded decomposition, explicit methods, authorable intent.

What to reject: general recursive HTN search or a planner that invents action legality from authored preconditions. LudoForge’s kernel is the rules engine; a plan library may advise, but legality must come only from the microturn frontier.

### **Behavior trees: borrow fallback/deviation structure, reject ticked runtime trees**

Behavior trees were invented for modular game AI and became popular because FSM-style transition logic scaled poorly; their hierarchy improves modularity, reuse, human analysis, and synthesis.

What to borrow: explicit fallback nodes, “try this then degrade gracefully,” traceable reactive repair, and designer-legible composition.

What to reject: a continuously ticking behavior tree as the runtime controller. LudoForge turns are discrete, legal-frontier microturns. BT-style fallback belongs inside plan execution and doctrine selection, not as a parallel action executor.

### **Utility AI: keep as local scoring only**

Utility AI is useful for comparing many local alternatives by numeric scores and response curves; it became a recognized game-AI architecture alongside FSMs, BTs, and planners.

What to borrow: bounded local ranking among targets or legal options after doctrine and role context are already chosen.

What to reject: flat scalar soups as the primary architecture. FITL-grade play cannot be authored sanely as “+300 margin, +700 govern, -350 tax risk.” The current FITL agents still contain many tunable weights and action-preference considerations, which is exactly the residue to demote.

### **BDI: borrow belief/intent/execution separation**

BDI separates plan selection from execution of currently active plans, balancing deliberation with committed execution.

What to borrow: observer-scoped belief projection, explicit desires/doctrine, committed intention/plan, and execution/deviation trace.

What to reject: over-formal mental-state ontology. LudoForge does not need “belief/desire/intention” ceremony; it needs observer-safe policy state, selected intent, and microturn plan realization.

### **GOAP / symbolic planning: borrow expectations, reject as primary runtime planner**

F.E.A.R.’s GOAP-style design is an influential industry example of goals, preconditions, effects, and runtime planning replacing manually coded state transitions.

What to borrow: symbolic expectations such as “this step is intended to create Control” or “this role is a future Pacification target.”

What to reject: a GOAP planner that models rules through authored preconditions/effects. That becomes a second rules engine. LudoForge plans should never decide that a move is legal because a policy effect model says so.

### **General game systems: borrow declarative game concepts and generality**

Ludii’s ludemic game system models games as high-level, understandable “ludemes” and emphasizes generality, extensibility, understandability, and efficiency.

What to borrow: game-specific concepts live as declarative authored data; engine machinery stays generic.

What to reject: assuming a game-description language automatically yields competent agents. LudoForge needs a policy-description layer, not only a rules-description layer.

### **Imperfect information planning: borrow discipline, not runtime Monte Carlo**

Hidden-information research repeatedly shows that omniscient determinization can become cheating. For Scopone, plain MCTS over complete information is explicitly a “cheating player,” while ISMCTS is the fair incomplete-information alternative; Hanabi work on re-determinizing IS-MCTS exists specifically to prevent hidden-information leakage into opponent models.

What to borrow: information-set discipline, observer-scoped projections, explicit hidden/unavailable statuses, and traceable uncertainty.

What to reject: expensive hidden-information search as normal runtime. It can be diagnostic or offline proof tooling, but not the primary player.

### **Explainable planning: traces must compare intent, alternatives, and deviations**

Explainable planning research stresses that humans need to know what an AI is trying to achieve and why; explanation can compare chosen plans against user-suggested alternatives, and visualization can externalize progressively higher-order planner decisions.

What to borrow: traces should show doctrine activation, selected intent, rejected alternatives, role bindings, preview status, fallback, and “why not” facts.

What to reject: post-hoc rationalization. If a trace says “Train→Govern” but the root action was actually selected by scalar policy first, the trace is weaker than it looks.

### **MCTS boundary**

MCTS is successful in many board-game domains but relies on repeated selection, expansion, simulation/playout, and backpropagation over many sampled trajectories. LudoForge’s own archived FITL MCTS analysis reported MCTS about 4,600× too slow for interactive FITL, with a 200-iteration “fast” preset extrapolated to about 46 minutes per decision; that archive is historical/lower-trust than active code, but it supports the current mission constraint that MCTS should not be primary runtime architecture.

MCTS should remain limited to bounded diagnostics, offline witnesses, or tiny local comparisons.

---

## **4. Current architecture audit**

### **Foundations alignment**

`docs/FOUNDATIONS.md` is clear: engine/compiler/runtime must remain game-agnostic; semantics-affecting game behavior belongs in GameSpecDoc; agents, runner, and simulator must use one legal protocol; non-omniscient agents must not inspect full state; all computation must be bounded, deterministic, replayable, and auditable; constructibility is part of legality; kernel-visible decisions are atomic microturns; preview signals must expose observer scope, resolution, budget, and fallback; no production backwards-compatibility shims.

The landed architecture aligns with this direction. Plan traces include cap class and cap limit, selected templates, intents, active and rejected doctrines, role bindings, alternatives, posture, microturn matches, fallback, and deviations.

### **What the current architecture represents well**

The type system now has the raw materials for a good architecture: strategy modules, guardrails, turn-shape evaluators, posture evaluators, relationships, selectors, plan templates, preview refs, lookup refs, standing roles, and typed selector sources. Selector sources include collections, products, route pairs, subsets, microturn options, and candidate params; plan templates include root tags/ids, compound metadata, roles, role constraints, step matches, fallback, and caps.

The compiler validates useful static structure: role selectors must exist, constraints must reference already bound roles, selector result ordering must include stable-key ordering, steps must reference declared roles, cap classes are checked, max steps cannot exceed the cap, fallback references must be valid, and cycles are rejected.

The plan proposal implementation is bounded and deterministic. It enumerates legal root action decisions, matches templates, binds roles, applies active strategy modules, computes role and posture scores, sorts deterministically, truncates alternatives by named cap class, and emits a selected/no-template/no-root/no-role status.

The plan controller respects the legal frontier: it selects an exact planned legal decision when present, can reselect a legal option, and otherwise falls back deterministically inside the published legal frontier. The architecture test proves exact and fallback decisions are selected from the published legal actions.

The current FITL production agents genuinely include all four factions, with profiles bound to `us`, `arvn`, `nva`, and `vc`, and explicit plan-template lists per faction.

### **Where it remains weak**

**1. Root selection is not plan-primary.** The biggest issue: `chooseActionSelectionDecision` evaluates the old move-scoring path first, then proposes and commits a plan. Later microturns can be plan-controlled, but the plan did not authoritatively choose the root. That is backwards.

**2. Strategy modules are still score groups, not doctrine.** The active “doctrines” in plan proposal are strategy modules whose bodies still look like score-group terms and selector references. The FITL file has readable labels such as “ARVN harvest Patronage,” but many terms are constant `value: 1` with weights.

**3. Target reasoning is surfaced but shallow.** Selectors support zones, tokens, cards, players, product pairs, route pairs, subsets, microturn options, and candidate params. That is a good generic substrate. But the active FITL authored selectors often rank by constant values or global projected margins rather than target-local consequences. For example, several ARVN/NVA/VC selectors use `value: 1` or a global `feature.projectedSelfMargin`; some route-pair components have weight `0`, so stable ordering dominates.

**4. Role constraints are underpowered.** Runtime role constraints implement `notEqual`, while `locatedIn` currently returns true. That means the compiler accepts richer-looking role constraints than runtime actually enforces.

**5. Plan step matching is too weak.** Plan steps carry `decisionKind`, `targetKind`, `decisionPath`, `actionTag`, and `stageIndex`; controller matching mostly checks decision kind, action tag, and selected value. It does not fully prove path/stage/target-kind correspondence against actual current decision semantics.

**6. Compound sequencing metadata is descriptive, not proven.** Templates compile root compound data such as special tags, timing, and interrupt stage, but the available evidence does not show validation that the root legal action actually grants the described special activity timing and continuation path.

**7. Posture preview can be absent in the normal path.** Plan proposal supports preview-plan refs, and tests show posture can score ready preview refs and fallback when absent. But the normal `PolicyAgent` root-selection flow proposes after scalar selection; current evidence shows plan proposal can operate without preview refs, yielding `noPreviewDecision` posture fallback.

**8. The cookbook is partly behind the code.** The cookbook still frames the mental model as move-scoped scoring plus one-step preview, with plan templates added later; it also documents the current microturn discipline correctly, but it has drift relative to the architecture’s intended plan-primary direction.

**9. Validation proves structure, not enough semantics.** The test suite has valuable architectural and convergence witnesses: deterministic plan traces, frontier legality, ARVN Train/Govern separation, ally-rival flip witnesses, and policy probe runners. But the tests do not yet prove that authored plan roots, compound special availability, role target kinds, decision paths, and stage indices are semantically aligned with the kernel-published continuation frontier.

### **Does it generalize beyond FITL?**

The type surfaces are game-agnostic. The FITL victory file expresses faction-specific scoring declaratively, not as engine code. The observability file defines observer visibility through data, and the currentPlayer observer exposes public FITL surfaces declaratively.

However, active authoring still leans heavily on FITL-specific selector names and action tags. That is acceptable for game-authored policy data, but the engine-level abstractions must be renamed and documented around generic roles: target, actor, origin, destination, route, subset, resource posture, relationship posture, phase horizon. The current machinery can generalize, but the authoring model is still too FITL-shaped in examples.

---

## **5. Architecture comparison**

| Architecture | Foundations fit | FITL expressiveness | Target reasoning | Sequencing | Authorability | Verdict |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Flat utility/scalar scoring | Medium | Low | Low | Low | Initially easy, later awful | Reject as primary |
| Full MCTS / Monte Carlo search | Low | Medium in theory, poor runtime | Medium | Emergent | Poor traceability | Reject as primary |
| Hardcoded FITL bots | Very low | High for FITL | High for FITL only | High | Low outside programmers | Reject |
| Full GOAP planner | Medium-low | Medium | Medium | Emergent | Hard; risks second rules engine | Reject as primary |
| Classic HTN planner | Medium | High | Medium | High | Good if bounded | Borrow, but constrain |
| Behavior tree primary runtime | Medium | Medium | Low-medium | Medium | Good | Borrow fallback, not runtime |
| BDI architecture | Medium | Medium-high | Medium | Medium | Medium | Borrow belief/intent/execution separation |
| Current landed architecture | High directionally | Medium-high | Medium | Medium-high | Medium | Keep core, fix major gaps |
| Recommended Doctrine–Plan–Role–Target | High | High | High | High | High | Adopt |

---

## **6. Recommended architecture: Doctrine–Plan–Role–Target Architecture**

### **Conceptual layers**

**Layer 1 — Observer-safe policy projection.**  
 The policy sees only an observer-scoped view: visible state, visible preview refs, visible schedule refs, hidden/unavailable statuses, and explicit fallback metadata. No plan, selector, or posture evaluator may reach omniscient state unless running in a named analysis mode.

**Layer 2 — Doctrine modules.**  
 Doctrine modules are not score groups. They are named, authorable strategic clauses:

doctrine:  
 arvn.harvestPatronage:  
   intent: "Convert controlled Supported population into Patronage without handing US the win."  
   activatesWhen:  
     - self.notWinningYet  
     - governTargets.available  
   priority:  
     tier: 80  
   prefersPlans:  
     - arvn.trainGovern  
     - arvn.patrolGovern  
   guardrails:  
     - arvn.doNotServeUSWin  
     - arvn.resourceFloor

A doctrine may set priority tiers, allowed plan families, strategic conditions, relationship posture, and fallback behavior. It should not directly score every move.

**Layer 3 — Plan templates.**  
 A plan template is an HTN-lite method: bounded, explicit, non-recursive, and executable only through the kernel frontier. It may represent sequences like Train→Govern, Sweep→Raid, March→Ambush, or Assault→Transport→Assault, but it must not model rules effects itself.

**Layer 4 — Role/target binding graph.**  
 Every plan has named roles. Roles have typed targets: zone, token, card, player, action variant, origin, destination, route, origin/destination pair, LoC, subset, or tuple. Selectors bind roles under constraints. This becomes the core target-selection abstraction.

**Layer 5 — Posture and relationship evaluation.**  
 Posture evaluates plan-level consequences: own margin, enemy denial, resource floor, Coup readiness, ally-rival risk, hidden-info confidence, and risk/exposure. Utility scoring lives here and inside selectors as subordinate local ranking.

**Layer 6 — Plan-primary root selection.**  
 At action-selection microturns, plan proposal must choose the root action. The old scalar policy can remain only as a primitive fallback or local tie-breaker. The selected root and selected plan must be consistent by construction.

**Layer 7 — Microturn execution controller.**  
 The controller consumes one step at a time. It matches the current legal frontier against the selected plan’s next role. It may select exact, reselect among legal role candidates, skip optional steps, replan within cap, or fall back to primitive policy. It never fabricates legality.

**Layer 8 — Trace and replay.**  
 Every decision trace should explain doctrine activation, plan alternatives, selected template, root decision, role bindings, posture values, preview signal status, relationship flips, microturn matches, deviations, and fallback reasons.

### **Runtime model**

At each action-selection frontier:

1. Build observer-safe policy context.  
2. Enumerate legal root actions from the kernel.  
3. Activate doctrine modules.  
4. Generate bounded candidate plans only from legal roots.  
5. Bind role targets using typed selectors and constraints.  
6. Evaluate plan posture with available preview refs.  
7. Select the plan/root pair lexicographically: hard guardrails, doctrine priority tier, posture viability, role quality, local utility, stable tie-break.  
8. Commit plan execution state.  
9. Return the selected root legal action.

At each subsequent microturn:

1. Load committed plan state for the current turn/seat.  
2. Match the current frontier to the next expected step.  
3. Choose exact role target if legal.  
4. If exact target is absent, reselect from the same role selector against the current frontier.  
5. If optional step fails, skip with trace.  
6. If required step fails, replan within the same doctrine/turn budget or fall back to primitive policy.  
7. Record deviation; never hide it.

### **Compiler validation model**

The compiler should validate:

* every plan root action tag/id exists;  
* every compound special tag/timing is possible for at least one legal continuation witness in authored conformance fixtures;  
* every role selector returns a type compatible with each consuming step;  
* every `decisionPath`, `targetKind`, and `stageIndex` is a declared decision-surface path, not an arbitrary string;  
* every role constraint has runtime implementation;  
* every cap class is named and budgeted;  
* every preview ref has declared fallback or hard unavailability semantics;  
* every doctrine references existing plan templates, relationships, guardrails, and posture evaluators;  
* every authored finite collection either has a declared source or is rejected.

### **Trace model**

The trace must be a proof object, not a story. It should include:

* active doctrine modules and rejected modules with condition status;  
* selected plan and root legal action key;  
* top rejected alternatives with rejection reasons;  
* role bindings with target type, selected id, selector quality, component breakdown, visibility status, and fallback status;  
* posture must/prefer contributions;  
* relationship roles and flips;  
* preview refs with ready/unavailable/hidden/unsupported and cap-class status;  
* microturn execution: exact/reselected/skipped/fallback/replanned;  
* whether a fallback preserved plan intent or abandoned it.

### **Hidden-info model**

The default policy mode is **observer-world**, not exact-world. Exact-world may exist only when all referenced surfaces are public or in explicit omniscient analysis mode. Preview values must carry provenance: current-state, exact-world preview, stochastic sample, hidden-sampled, unavailable, or unsupported. Agents may use partial signals only if the policy declares how to treat missingness. Silent zero is forbidden by Foundations preview signal integrity.

### **Performance and boundedness model**

* No recursion.  
* Plan template count is bounded.  
* Candidate roots are kernel legal roots only.  
* Selectors have named caps: `top8Targets`, `route64`, `subset32`, `plan256`, etc.  
* Every cap class is reported in trace.  
* Preview and turn-shape evaluation cannot widen silently.  
* Expensive local comparison is opt-in, named, and capped.  
* MCTS-like rollouts are not part of normal runtime.

---

## **7. FITL expressiveness check**

### **ARVN concrete check**

A mature architecture should express ARVN as:

doctrine:  
 arvn.harvestPatronage:  
   intent: "Score Patronage while preserving regime viability."  
   priority: 80  
   prefersPlans: [arvn.trainGovern, arvn.patrolGovern]  
   relationshipPosture:  
     nominalAlly: us  
     flipWhen: us.nearWin

plans:  
 arvn.trainGovern:  
   sequence:  
     - operation: train  
       bind:  
         trainSpace: zone where training creates control, troopPolicePair, pacificationSetup, or provinceBaseRedeploySafety  
     - special: govern  
       timing: after  
       bind:  
         governSpace: zone where supported, coinControlled, highPopulation, not trainSpace  
   posture:  
     must:  
       - resources.after >= arvn.resourceFloor  
     prefer:  
       - arvn.margin.delta  
       - patronage.delta  
       - not us.margin.delta when us.nearWin  
       - coupReadiness

This needs typed target roles, not just scalar “prefer govern.” It also needs distinct role constraints, high-pop support markers, Patronage mode, Aid mode, Support damage risk, resource floor, and Coup redeploy posture.

The current architecture has a production witness that ARVN Train and Govern roles bind to distinct spaces, and a separate witness that the US nominal ally becomes a negative posture term when US is near victory. Those are excellent signs, but they are witnesses for pieces of the architecture, not proof that ARVN’s whole root choice is plan-primary.

### **US**

US needs doctrine like “stabilize support without overcommitment,” “surgical strike,” and “block insurgent win.” It should express Train→Advise, Patrol→Advise, Sweep→Air Strike, Assault→Air Lift→Assault, and Air Lift→Train as explicit plan families. Target roles must include Pacification target, indigenous force target, air-lift origin, air-lift destination, assault first/second target, air-strike political-risk target, and withdrawal/control-preservation origin.

The current FITL file has plan templates for these patterns, which is the right authoring shape.

### **NVA**

NVA needs doctrine like “build logistics,” “seize population control,” “exploit VC infrastructure,” and “deny COIN/VC win.” Plans should explicitly include Rally→Infiltrate, March→Infiltrate, March→Ambush, Attack→Ambush, Terror→future Rally, and LoC occupation before Coup. Target roles must include route/logistics spaces, high-pop control targets, VC Base takeover targets, LoC disruption spaces, and Ambush key-piece targets.

The current FITL file includes these NVA plan templates and generic relationship entries for VC nominal ally and near-win.

### **VC**

VC needs doctrine like “spread hidden political network,” “subvert regime security,” “fund carefully,” and “protect Bases from NVA.” Plans should include Rally→Subvert, March→Subvert, Terror→Subvert, Terror→Tax, March→Ambush from LoC, and Rally reset→Terror. Target roles must include Underground cell, Opposition target, Tax target, ARVN cube target, LoC platform, NVA-Infiltrate-risk Base, and Ambush victim.

The current FITL file includes VC plans and guardrails for avoiding conventional attack, protecting Bases from NVA Infiltrate, and avoiding high-pop Tax without a political plan.

---

## **8. Generalization check**

**Perfect-information board game.** Doctrine modules become opening/middlegame/endgame priorities; plan templates can represent tactical motifs; target roles bind pieces, squares, routes, captures, and threats. Hidden-info discipline is trivial because all relevant surfaces are public.

**Hidden-information card game.** Observer projection is central. Roles bind own cards, public cards, bids, discard candidates, bluff actions, and opponent-visible signals. Exact-world preview is forbidden unless analysis mode is explicit. Policy traces must distinguish “known,” “inferred,” “sampled,” and “unavailable.”

**Stochastic game.** Preview refs carry stochastic provenance and cap class. Plans can express risk posture, but cannot assume sampled outcomes are truth. The normal policy should use robust local comparisons, not rollout-heavy search.

**Asymmetric/phase-heavy game.** Doctrine modules activate by phase horizon, role, relationship, and victory margin. Plan templates model phase-specific compound turns. The engine stays agnostic because all phase semantics remain in GameSpecDoc and kernel legal frontier.

**Tactical card/board game with heavy target selection.** The first-class target role model becomes the main win: origin/destination pairs, routes, subsets, card choices, target pieces, and action variants all share one typed binding and trace framework.

---

## **9. Whole-turn advisory reasoning**

Whole-turn advisory planning **should exist**, but only as bounded advice.

Plans are proposed from kernel-published legal root actions. A plan template never creates a root candidate that the kernel did not publish. Role selectors bind targets before execution, but those bindings are advisory until the matching microturn frontier appears. The plan’s future legality/setup is represented through preview/probe refs and expected role constraints, not by duplicating rules.

A selected plan is executed one microturn at a time. When the frontier differs, the controller should classify the mismatch:

* **exact:** expected role target is legal;  
* **reselected:** same role, different legal target;  
* **optionalSkipped:** optional step absent;  
* **deviation:** required step absent but plan can continue;  
* **replanned:** bounded replan under same doctrine;  
* **abandoned:** primitive fallback.

Each case must be trace-visible. No hidden “it probably worked” fallback.

---

## **10. Target selection representation**

The next architecture needs a formal **Target Role Binding IR**.

A role binding should have:

role:  
 id: assaultTarget  
 targetKind: zone  
 source:  
   collection: zones  
 legalityAnchor:  
   step: assault.targetSpaces  
 visibility:  
   require: visibleOrPublic  
 constraints:  
   - notEqual: firstAssaultSpace  
   - reachableFrom: assaultOrigin  
 quality:  
   tiers:  
     - baseRemoval  
     - controlSwing  
     - enemyNearWinDenial  
     - population  
     - exposureRisk  
 projection:  
   compare:  
     - self.margin.delta  
     - enemy.margin.delta  
     - resource.delta  
     - futureLegality.pacification

Target kinds should include:

* `zone`  
* `token`  
* `card`  
* `player/seat`  
* `actionVariant`  
* `origin`  
* `destination`  
* `originDestinationPair`  
* `route`  
* `lineOfCommunication`  
* `subset`  
* `tuple`  
* `numericChoice`  
* `microturnOption`

Each role binding should carry selected id, stable key, target type, visibility status, selector cap class, quality component breakdown, projected-state values, and fallback status.

This should remain engine-generic. “LoC,” “Support,” “Trail,” and “Patronage” are authored semantics; “route target,” “marker lookup,” “global variable,” and “zone property” are generic machinery.

---

## **11. Should sequencing be explicit?**

Yes. Firmly.

Explicit sequencing is required because FITL competence depends on order-sensitive legality and payoff. Sweep→Raid is not just “prefer Sweep and prefer Raid.” Assault→Transport→Assault and Assault→Air Lift→Assault are impossible to express honestly as independent action preferences. Train→Govern requires target separation. Terror→Tax requires understanding political offset. March→Infiltrate requires post-March board posture.

Sequencing should be generic and bounded:

sequence:  
 - step: op.primary  
   actionTag: assault  
   role: firstAssaultSpace  
 - step: special.interrupt  
   actionTag: transport  
   timing: during  
   afterStage: 1  
   role: transportRoute  
 - step: op.continuation  
   actionTag: assault  
   role: secondAssaultSpace

No recursion. No arbitrary looping. No hidden effect model. Every step waits for the kernel frontier.

---

## **12. Should ally-as-rival be first-class?**

Yes. Firmly.

Victory-margin refs alone are not enough. Ally-as-rival is a doctrine concept, a trace concept, and an authoring concept. The architecture needs first-class generic relationships such as `nominalAlly`, `sharedEnemy`, `rivalAlly`, `leader`, `nearWin`, and `kingmakerRisk`.

The current architecture already has a good generic start: relationship definitions are role-based, can bind by seat or standing role, can have conditions and priorities, and runtime chooses active relationships by role.

But it should be strengthened into a relationship matrix:

* multiple active relationships per role where useful;  
* explicit direction: “I tolerate ally gain until threshold”;  
* risk reason: near-win, blocks-control, steals-base, consumes-resource, opens-opponent-win;  
* trace-visible flip;  
* posture integration without relying on pattern detection in a `when` expression.

Keep this generic. The engine should know “relationship role,” not “US/ARVN” or “NVA/VC.”

---

## **13. Hidden-information discipline**

The architecture should define four modes:

1. **Observer mode:** normal runtime; uses only observer-visible state and declared preview refs.  
2. **Public exact mode:** allowed when all referenced surfaces are public.  
3. **Sampled/uncertain preview mode:** allowed only with explicit provenance and fallback.  
4. **Omniscient analysis mode:** diagnostic/offline only; trace must mark it.

Unavailable or hidden signals are values, not bugs to paper over. A selector or posture term must declare whether hidden means no contribution, fallback contribution, demotion, veto, or reselect.

The current FITL observability file exposes many FITL surfaces as public for `currentPlayer`, which is fine for FITL’s mostly public state, but the architecture must not bake in that assumption for card games or hidden-piece games.

---

## **14. Authoring by designers and LLMs**

Good authoring should look like doctrine, not algebra.

A designer or LLM should be able to read and edit:

* “ARVN harvest Patronage”  
* “VC avoid high-pop Tax without political offset”  
* “US avoid political Air Strike”  
* “NVA exploit VC without serving VC win”  
* “Train space must differ from Govern space”  
* “Transport origin must not lose control”  
* “Coup is near; prefer concrete scoring”

The current FITL file has the labels, but too many internals are still scalar placeholders. The next cookbook should teach authors to write:

1. doctrine intent;  
2. activation conditions;  
3. plan families;  
4. typed roles;  
5. target selectors;  
6. posture must/prefer;  
7. guardrails;  
8. fallback semantics;  
9. trace expectations;  
10. quality witnesses.

Compiler errors should say things like:

* “Role `transportRoute` returns route-pair but step `airLiftDestination` expects zone.”  
* “Constraint `locatedIn` is declared but has no runtime implementation.”  
* “Plan `assaultTransportAssault` names stageIndex 2, but no compiled continuation path exposes that stage.”  
* “Preview ref has no fallback and may be unavailable under observer `currentPlayer`.”  
* “Selector source `authoredFinite` has no declared finite collection.”

---

## **15. Evolution model**

The improve loop should mutate meaningful structures:

* doctrine activation thresholds;  
* plan-template priority tiers;  
* role selector component tiers;  
* guardrail severity;  
* posture must/prefer clauses;  
* relationship threshold rules;  
* fallback/deviation policies;  
* target-role constraints;  
* named cap classes;  
* trace labels;  
* scenario-specific witness coverage.

It should not primarily mutate flat weights.

Metrics should resist Goodharting. Track not only win rate and campaign score, but:

* selected plan diversity;  
* doctrine activation distribution;  
* root-plan consistency;  
* role binding quality;  
* fallback/deviation rate;  
* preview unavailable rate;  
* hidden-info fallback rate;  
* plan abandonment rate;  
* near-win block success;  
* human-plausibility witness pass rate;  
* cross-game conformance;  
* per-decision runtime cap usage;  
* trace explainability coverage.

Campaign metrics are useful only after architectural invariants and witness tests pass.

---

## **16. Validation and test strategy**

Ranked success criteria:

1. Foundation alignment.  
2. Game-agnostic suitability.  
3. FITL-grade expressiveness.  
4. Human-plausible competence.  
5. Whole-turn coherence.  
6. First-class target reasoning.  
7. Hidden-information discipline.  
8. Explainable traces.  
9. Authorability by designers and LLMs.  
10. Evolution readiness.  
11. Implementation feasibility.  
12. Runtime performance.  
13. Campaign metrics.

Required tests:

**Compiler validation**

* role type compatibility;  
* stage/path/action surface validation;  
* compound timing witness validation;  
* selector cap validation;  
* unsupported role constraint rejection;  
* hidden preview fallback validation;  
* no legacy scalar-only policy profiles for production agents.

**Runtime invariants**

* selected plan root equals selected root legal action;  
* every plan-controlled decision is from published frontier;  
* fallback never leaves frontier;  
* plan state clears on turn/seat boundary;  
* no omniscient surface in observer mode.

**Determinism/replay**

* byte-identical plan traces;  
* deterministic role binding order;  
* deterministic fallback;  
* deterministic preview cap behavior.

**Trace golden tests**

* Train→Govern with distinct roles;  
* Assault→Transport→Assault with stage trace;  
* March→Infiltrate with ally-rival conversion trace;  
* Terror→Tax with political-offset trace;  
* hidden-info unavailable fallback trace.

**Policy-quality witnesses**

* ARVN does not serve US near-win.  
* US avoids political Air Strike without payoff.  
* NVA steals VC Base only when correct.  
* VC protects Bases from NVA Infiltrate.  
* ARVN refuses Transport that loses origin control.  
* Current-turn impact present without extra unbounded preview.

**Cross-game conformance**

* perfect-info board game;  
* hidden-info card game;  
* stochastic game;  
* asymmetric phase-heavy game;  
* route/subset-heavy tactical game.

---

## **17. Migration strategy**

Do not preserve production backwards-compatibility shims. Foundations explicitly reject them.

Migration should be conceptual, not ticketized here:

1. **Make plan proposal root-primary.** At action-selection, the selected plan/root pair must choose the root decision. Scalar move evaluation becomes primitive fallback.  
2. **Promote strategy modules into doctrine modules.** Keep names and conditions where useful; remove dummy score terms.  
3. **Introduce Target Role Binding IR.** Migrate current selectors into typed role selectors.  
4. **Strengthen role constraints.** Implement or reject every constraint; no accepted no-op constraints.  
5. **Validate plan step surfaces.** `decisionPath`, `targetKind`, and `stageIndex` must be tied to compiled decision metadata.  
6. **Wire posture preview into root plan evaluation.** A plan selected without preview must explicitly say why preview was unavailable and whether fallback was acceptable.  
7. **Rewrite `docs/agent-dsl-cookbook.md`.** Center it around doctrine → plan → role → posture → trace, not move-scoped scalar scoring.  
8. **Migrate FITL agents.** Preserve current plan templates as seed material, but rewrite selectors to target-local semantics.  
9. **Adapt improve-loop campaigns.** Evolution mutates doctrine/plan/role/guardrail structures and emits trace metrics, not just weights.

---

## **18. Risks and rejected alternatives**

**Why not MCTS as primary architecture:** too slow for FITL, difficult to explain, and dangerous for hidden information unless carefully information-set constrained. LudoForge’s archived analysis already found it non-interactive for FITL.

**Why not more weights:** the current FITL file still shows many weighted action preferences and constant-valued modules. That may improve campaign numbers, but it does not produce human-plausible doctrine or target reasoning.

**Why not hardcoded FITL bots:** they would violate engine agnosticism and fail the arbitrary-game goal.

**Why not unbounded planners:** they violate bounded computation and risk becoming second rules engines.

**Performance risk:** richer target roles could explode enumeration. The answer is named cap classes, selector tiers, and trace-visible truncation, not implicit pruning.

**Overfitting-to-FITL risk:** the architecture must describe generic target kinds and relationship roles. FITL words like Patronage, Trail, Support, and Monsoon belong only in game-authored data.

**Authoring complexity risk:** doctrine/plan/role YAML can become verbose. The cure is examples, validation, and reusable modules, not flattening back to weights.

---

## **19. Final recommendation**

**Go.** Proceed with a second major architectural iteration that keeps the landed plan/selector/posture/relationship core but makes it real.

**Smallest coherent next architectural step:** prove **plan-primary root selection plus typed target-role binding** in one narrow vertical slice. The slice should demonstrate ARVN Train→Govern because ARVN is the best stress test: distinct roles, Patronage, Support damage, ally-as-rival, resource floor, and Coup posture all matter.

Before implementation proceeds broadly, prove these three things:

1. A selected plan/root pair, not scalar policy, chooses the action-selection root.  
2. Role bindings are typed, frontier-compatible, and trace-visible.  
3. The selected plan executes through microturns with exact/reselect/fallback/deviation traces and never leaves the kernel-published legal frontier.

The current architecture is too good to throw away and too incomplete to bless. Keep the skeleton. Replace the decision authority. Strengthen targets. Make traces prove intent rather than narrate it.
