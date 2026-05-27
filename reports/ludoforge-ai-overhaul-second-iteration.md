# **1. Executive verdict**

The best next architecture for LudoForge AI agents is **not** “more scalar tuning” and not “MCTS, but optimized.” The right architecture is a **Doctrine–Intent–Plan–Target Contract architecture**: a bounded, declarative, observer-safe advisory layer in which doctrine selects an intent, intent selects explicit plan families, plans bind typed target roles through a first-class target algebra, feasibility is certified with bounded provenance, and execution still happens one microturn at a time through the kernel-published legal frontier.

My verdict on current `92247448b51d05bf1c2e1bc19f3ca91f02416633` is:

**Keep the kernel/microturn spine and the plan-controller execution contract. Partially replace the policy-authoring architecture.** The current landed layer is a real improvement over flat policy scoring. It has plan-selected root authority, role-bound continuation, route constraints, doctrine-gated eligibility, observer-safety tests, and conformance tests. But it is still not the best possible FITL-grade architecture. It has accumulated enough patch layers that the missing abstraction is now visible: **first-class intent and typed target semantics**.

The strongest parts should remain:

* The kernel-owned atomic microturn protocol.  
* Plan-selected root authority only over published legal actions.  
* Plan controller exact/reselected/fallback execution through published frontiers.  
* Deterministic traces, replay, cap classes, and observer-safe preview provenance.  
* Generic GameSpecDoc/YAML ownership of game semantics.

The weakest parts should be replaced or reframed:

* `strategyModules` as “scoring data plus `enablesPlanTemplates` / `suppressesPlanTemplates`” are not enough doctrine.  
* Role selectors still mostly rank string identities with weighted scalar components.  
* `routeGraph` is useful as a generic data asset, but it is not a route/path target model.  
* `postState` constraints are powerful but dangerously close to synthetic rule execution as a substitute for typed plan expectations.  
* Compound availability is useful trace hygiene, but it should be one field in a broader plan-feasibility certificate, not another local patch.  
* Cross-game conformance currently proves structural portability, not FITL-grade generality.

A deeper architecture change is warranted. It should **not** replace the kernel, legal-move publication, deterministic preview contracts, or plan-controller frontier authority. It should replace the authoring and advisory reasoning model above them.

I recommend one small FOUNDATIONS amendment: add an AI-specific principle that **human-plausible advisory intent traces are first-class audit artifacts and profile-quality success is not raw win rate alone**. Existing Foundations already cover determinism, boundedness, observer safety, preview integrity, and microturn legality, but they do not explicitly protect against alien optimizer behavior.

# **2. Current-main evidence base**

The user’s mission prompt required exact Git discipline and explicitly supplied expected current-main commit `92247448b51d05bf1c2e1bc19f3ca91f02416633`; it also required using the uploaded manifest as the file inventory only after repository verification. The uploaded prompt and manifest are the controlling instructions and inventory for this audit.

Repository discovery exposed `joeloverbeck/ludoforge-llm` in the connector’s repository list. However, the connector’s repo/branch/commit endpoint behavior was flaky: direct file URL fetches against the exact SHA worked, while branch-SHA and commit-fetch tooling misrouted or failed. I therefore **did not verify live `main` through the branch-SHA endpoint**. I analyzed the exact intended commit `92247448b51d05bf1c2e1bc19f3ca91f02416633` by targeted direct file fetches, not by GitHub search snippets, not by cloning, and not by stale local copies.

Material exact-SHA files fetched and used include:

* `docs/FOUNDATIONS.md`  
* `reports/fitl-competent-agent-ai.md`  
* `reports/ai-agent-policy-overhaul-second-iteration.md`  
* `docs/agent-dsl-cookbook.md`  
* `data/games/fire-in-the-lake/91-victory-standings.md`  
* `data/games/fire-in-the-lake/92-agents.md`  
* `data/games/fire-in-the-lake/93-observability.md`  
* `data/games/fire-in-the-lake/94-diagnostic-agents.md`  
* `data/games/texas-holdem/92-agents.md`  
* `data/games/generic-control/92-agents.md`  
* Current agent runtime files including `policy-agent.ts`, `policy-agent-plan-root.ts`, `plan-proposal.ts`, `plan-controller.ts`, `plan-execution.ts`, `plan-template-eligibility.ts`, `plan-role-constraint-eval.ts`, `plan-proposal-compound-availability.ts`, `policy-selector-eval.ts`, `policy-posture-eval.ts`, `policy-relationship-eval.ts`, and `policy-evaluation-core.ts`.  
* Current compiler/validator files including `compile-agent-strategy-modules.ts`, `compile-agent-plan-templates.ts`, `validate-agent-plan-templates.ts`, and `validate-agent-plan-route-constraints.ts`.  
* Current tests for plan root authority, controller frontier legality, doctrine gating, compound availability, conformance, observer safety, authoring-error negatives, and policy-quality witnesses.

I also read archived specs 196–199 for historical rationale only. They are lower-trust than active code/tests/data and are treated as prior art, not source of truth. The active code confirms those specs landed, but the audit does not inherit their conclusions merely because they landed.

The non-negotiable constitution is `docs/FOUNDATIONS.md`. It requires engine agnosticism and keeps rule-authoritative semantics in GameSpecDoc/data assets, not engine-specific game logic. It also establishes the one-rules-protocol, deterministic replay, bounded computation, compiler/kernel validation boundary, constructibility-as-legality, atomic microturns, and preview signal integrity contracts.

# **3. Requirements extracted from `fitl-competent-agent-ai.md`**

The FITL competence report is explicit that it is **behavioral requirements, not architecture advice**. It does not prescribe scoring formulas, target selectors, plan schemas, search algorithms, or bot flowcharts. It describes what competent faction behavior must understand.

The universal requirement is whole-composed-turn reasoning. A competent agent must reason over operation plus special activity, sequencing, selected spaces/pieces, and expected posture around Coup/Monsoon windows. The report’s examples are exactly the sequences the architecture must express: Sweep then removal, March then Ambush, March then Infiltrate, Train then Govern, Assault then mobility special then continued Assault, Tax during Terror, and Air Lift before Training to make a Pacification target legal.

## **US requirements**

US competence requires a doctrine that is not “kill insurgents.” The US must balance Support with Available US Troops/Bases, use force surgically, preserve Aid/Econ, avoid support-damaging Air Strikes, and prevent VC/NVA wins without handing ARVN the game. The architecture must express:

* Train + Advise as a state-building turn.  
* Air Lift before Train or Assault as a force multiplier and legality setup.  
* Air Strike target caution, especially populated Support/Opposition implications.  
* Pacification legality distinctions between US Train, ARVN Train, and Coup support phase.  
* Availability-aware doctrine: do not overcommit US pieces just because local removal is positive.  
* Ally-as-rival posture: ARVN can be useful and dangerous.

## **ARVN requirements**

ARVN is the hardest and most revealing faction for the architecture. ARVN must optimize COIN-Controlled Population + Patronage, but its actions often overlap with US Support goals. Competence requires:

* Train + Govern and Patrol + Govern sequencing.  
* Transport origin/destination reasoning.  
* Origin-control preservation after Transport.  
* Sweep + Raid to expose and remove before insurgents recover.  
* Assault + Transport + continued Assault.  
* Coup/redeploy awareness: ARVN Troops in Provinces without COIN Bases may redeploy away.  
* Resource/Aid awareness.  
* US-as-rival flips when US victory margin becomes dangerous.  
* Avoiding moves that merely serve US Support while not improving ARVN’s own standing.

This is where the current architecture remains underpowered. ARVN does not merely need a target selector; it needs typed movement intent, origin/destination/piece-bundle reasoning, post-turn posture, and a trace that can explain “I refused this Transport because it abandons origin control and helps US more than ARVN.”

## **NVA requirements**

NVA competence requires logistics, bases, Trail posture, and positional pressure:

* Rally to build bases and troops.  
* March + Infiltrate for logistics and rival-ally exploitation.  
* March + Ambush or Attack when it converts control/removes high-value COIN pieces.  
* Trail and Laos/Cambodia route awareness.  
* Protection of NVA Bases and NVA-Controlled Population near Coup.  
* NVA/VC rivalry: VC is nominally aligned but can be a victory rival and Infiltrate target.  
* Route reasoning that is not hardcoded as “Trail,” but can express authored map semantics.

## **VC requirements**

VC competence is about hidden posture, Opposition, resources, and survivability:

* Rally + Subvert when it preserves or expands underground infrastructure.  
* Terror + Tax as a coherent resource/opposition turn.  
* March + Ambush for plausible guerrilla warfare.  
* Avoid conventional attacks without Ambush or favorable conditions.  
* Protect VC Bases from NVA Infiltrate and COIN Assault/Air Strike.  
* Maintain hidden guerrillas and avoid exposure unless the benefit is worth it.  
* Coup/Agitation awareness: build Opposition and resources before the window.

## **Generic expressive requirements implied**

The architecture must support:

* Whole-turn sequencing.  
* First-class action-family intent.  
* Target roles over spaces, tokens, cards, action variants, origin/destination pairs, routes/paths, and subsets.  
* Piece-bundle selection, not only space selection.  
* Future-legality setup.  
* Bounded post-state expectations.  
* Coup/Monsoon horizon signals.  
* Relationship/ally-rival posture.  
* Hidden/partial information provenance.  
* Human-plausible doctrine traces.

# **4. Research synthesis**

External research strongly supports a hybrid architecture, not a pure paradigm transplant.

**HTN planning** is relevant because FITL competence is hierarchical: “build political engine” decomposes into “Train then Govern,” which decomposes into target roles and microturn choices. HTN planning’s core idea is decomposing tasks into subtasks using domain knowledge, which is exactly what LudoForge needs authoring-wise. But LudoForge should not use open-ended HTN search as runtime authority; decomposition should be authored, bounded, and advisory.

**Behavior trees** are useful for fallback and priority structure. BTs are modular, reactive, and widely used in games/robotics for structuring task switching; research also emphasizes modularity and formal safety/robustness analysis. LudoForge should borrow behavior-tree-like fallback/deviation semantics, not a tick-driven runtime controller that competes with the kernel.

**BDI-style separation** is conceptually right even if no literal BDI engine is needed. LudoForge needs an observer-scoped belief/projection layer, doctrine/desire layer, selected intention/plan layer, and execution-monitoring layer. The current implementation has pieces of that, but the “intention” is underformalized and `strategyModules` are still mostly scoring carriers.

**GOAP** is relevant only as a warning and a source of vocabulary. The F.E.A.R. architecture used STRIPS-like goals, actions, preconditions, and effects to dynamically produce plans. That is attractive for tactical games, but for FITL it risks becoming an unbounded or expensive second rules engine unless heavily constrained. LudoForge should borrow precondition/effect expectation language, but keep plan families authored and bounded.

**Utility AI** remains useful locally. Numeric scoring over candidates is fine for selecting among already-authored, already-typed targets or alternatives. But pure utility scoring tends to become scalar soup. Utility AI systems rank actions by formulas; that is exactly why they are insufficient as the primary policy abstraction for human-seeming FITL doctrine.

**Game-description languages** support the LudoForge premise: general game systems can be declarative and cross-game. GDL is logic-programming based, and GDL-II adds `sees` and `random` for incomplete information and chance; Ludii similarly targets declarative descriptions of finite games and has been extended beyond deterministic perfect-information games. LudoForge’s GameSpecDoc should remain the rule authority, while agent policy becomes a parallel declarative advisory layer, not a second rule language.

**Tabletop solo bot and COIN bot practice** is directly relevant to human plausibility. COIN games are asymmetric, faction-specific, and often use flowchart/action-card non-player systems to create recognizable faction doctrine. Those bots are not general AI, but their strength is legibility: priorities, target rules, and fallback order are visible. LudoForge should borrow readable doctrine/priority traces, not rigid printed-bot reproduction.

**MCTS/search should not be primary.** Search can work in some games, but branching factor and horizon effects are real. MCTS and online planning face search-tree blowup under high branching, and shallow search can miss deep trap states. FITL already experienced MCTS as too slow. LudoForge should use bounded local comparison, offline witnesses, or diagnostic tools only; runtime competence must not depend on rollouts.

**LLM-authored policy DSLs need grammar and validation.** Recent work on LLM-generated GDL emphasizes grammar-guided iterative generation to produce valid game descriptions. That maps directly to LudoForge: LLM authorability requires typed declarative schemas, strong diagnostics, and traceable examples, not opaque scalar tuning.

What to borrow:

* HTN: authored decomposition.  
* BT: fallback/deviation structure.  
* BDI: belief/doctrine/intent/execution separation.  
* GOAP: symbolic expectations, not open-ended planning.  
* Utility AI: local target ranking only.  
* COIN bots: legible doctrine priority and human-like rationale.  
* GDL/Ludii: declarative, game-agnostic semantics.

What to reject:

* MCTS or Monte Carlo rollouts as normal runtime.  
* Flat weighted scoring as the primary abstraction.  
* Game-specific engine bots.  
* Unbounded GOAP/HTN planning.  
* Black-box learned policies without contrastive traces.  
* Rigid printed flowcharts that cannot adapt to arbitrary games.

# **5. Current architecture audit**

## **What current `main` represents well**

The plan-root authority is a major architectural win. The selected plan root must be found in the published action frontier; if it is not present, the policy agent throws rather than synthesizing a move. The architectural test explicitly asserts that plan-selected roots do not invoke the scalar root scorer and that the selected root is a published legal action.

The plan controller is also well aligned with Foundations. It tries exact role-value matching, then reselection within the same decision surface, then primitive policy fallback, then stable frontier fallback. Every branch chooses from the published legal frontier. This preserves the kernel’s atomic microturn contract.

Plan execution state is deterministic and serializable: it stores selected template, intent, role bindings, next step index, fallback history, deviations, turn id, and seat id; serialization sorts role-binding records. That is the right execution substrate.

The new role-constraint registry is real. It now supports `notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`, and `postState`. This is a meaningful expansion over plain target ranking.

The `routeGraph` provider is genuinely generic: it exposes `adjacent`, `reachable`, `defaultMaxHops`, and deterministic serialization, and validates route classes and edges without knowing FITL concepts like Trail or LoCs.

Doctrine gating is implemented as a deterministic eligibility filter. Active modules can enable or suppress plan templates; suppress wins; if any active module declares enablement, non-enabled templates are filtered out. Tests prove enabled-only behavior, suppression provenance, suppression precedence, and the no-eligible-template case.

Compound availability improves trace integrity. The current code introduces plan cap classes and compares compound availability as ready/provisional/unavailable. A FITL witness records an unavailable ARVN Train+Govern compound before controller fallback, which is precisely the kind of honest trace the architecture needs.

Observer-safety testing is far stronger than before. The architecture test checks hidden-token filtering across selector sources, Texas hidden deck cards, typed unavailable preview status with explicit fallback, posture hidden fallback, and trace hidden-evidence absence. Authoring-error negative tests now cover malformed role constraints, target-kind mismatch, out-of-range stage index, ungrantable compound metadata, unknown doctrine-template references, unbounded subset selectors, observer-policy errors, and hidden preview fallback omissions.

## **What current `main` still cannot represent cleanly**

The architecture still lacks a first-class **target algebra**. Current selector sources materialize products, `routePairs`, subsets, candidate params, and microturn options mostly as string keys. Product and route-pair identities are joined with `|`; subsets are `keys.join('|')`. That is tolerable as a stable serialization trick, but it is a poor semantic substrate for ARVN Transport, NVA route logistics, VC underground posture, or choose-N piece-bundle tactics.

The architecture lacks first-class **movement intent**. `routeGraph.reachable(origin, destination)` can say that two zones connect, but it does not represent “move this piece bundle from this origin to that destination while preserving origin control, maintaining future Pacification legality, and avoiding exposure.” That intent is currently distributed across selectors, constraints, guardrails, and post-state probes.

The architecture lacks first-class **intent objects**. `strategyModules` still compile `when`, `applies`, priority, selectors, score groups, guardrails, fallback, and the two plan-template gating arrays. That is better than flat considerations, but it is still a scoring module with two gating fields, not a doctrine/intent contract.

The cookbook’s own current explanation admits the problem: strategy modules are “still scoring data” and never generate actions or add runtime logic; plan templates are declarative and do not create legal moves. That is correct for Foundations, but it also reveals that doctrine is not yet a first-class semantic layer. Doctrine should not generate legal actions, but it should own intent, target priority families, fallback policy, horizon policy, and trace contrast.

`postState` constraints are both powerful and dangerous. The role-constraint evaluator probes post-state by materializing a move, applying it, resolving continuations, and deterministic-choice-filling through planned steps. That may be bounded and tested, but architecturally it is close to using synthetic execution to recover missing semantic contracts. It should be narrowed into named, typed expectations with cap/provenance, not left as an expanding “simulate until predicate” escape hatch.

Current FITL authoring demonstrates capability but not maturity. The profile contains real plan templates and role selectors, but it also still includes scalar weights, constant-quality target components, zero-weight placeholders, and guardrail-style patches for problems that deserve typed plan semantics. This is not just “profile quality debt”; some of it is evidence that the authoring model still pushes authors toward scalar fillers when the desired semantic unit is missing.

The conformance corpus is valuable but not sufficient. It includes generic-control, FITL, and Texas Hold’em, and it checks compiler determinism, legality publication, plan-controller frontier authority where applicable, replay identity, and bounded fuzz. That proves important structural properties. It does not prove that the architecture can author competent agents for a hidden-information tactical game, a heavy route/path movement game, or a complex asymmetric game beyond FITL-specific authoring.

Texas Hold’em demonstrates hidden-info surfaces, but its current agent is a flat betting heuristic with preview disabled and simple considerations like prefer check, call, fold, bad pot odds, and raise. Generic-control is even simpler: one prefer-claim consideration over a perfect-information board game. These are conformance seeds, not evidence of general intelligent policy expressiveness.

## **Evaluation of newest landed pieces**

### **Role constraints and route semantics**

`notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, and `adjacent` are good generic primitives. `postState` is the risky one. The first five are declarative relational constraints over bound roles and authored data. `postState` crosses into bounded synthetic execution. It may be necessary, but it must be treated as a proof obligation surface, not a casual selector filter.

`routeGraph` solves the right low-level problem: generic authored connectivity. It does not solve the higher-level target problem. FITL needs route/path/movement-intent targets, not only reachability predicates.

### **Doctrine-gated plan-template eligibility**

`enablesPlanTemplates` and `suppressesPlanTemplates` are useful but insufficient. They make doctrine a filter, not merely a score influence. But doctrine still does not own target priority families, fallback/deviation policy, strategic horizon policy, relationship posture, or contrastive explanation. Gating arrays are a patch over strategy modules, not full doctrine.

### **Compound availability**

Compound availability is a good trace correction. It prevents the proposer from claiming too much coherence when a special activity is not currently grantable. But it is too narrow. It should generalize into a **plan feasibility certificate** containing root availability, compound availability, required role availability, expected decision surfaces, preview/probe status, hidden/unavailable reasons, and fallback policy. It must remain advisory, not legality.

### **Cross-game conformance and observer safety**

The observer-safety tests are strong and discriminating. The cross-game corpus is structurally useful. But the current corpus does not yet prove authoring generality for heavy target selection, route/path planning, or hidden-information strategic competence. It proves that the engine and agent layer do not fall apart across three families. That is necessary, not sufficient.

# **6. Architecture comparison**

| Architecture | FITL-grade expressiveness | Human plausibility | Target/route/subset reasoning | Foundations alignment | Authorability | Verdict |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Flat utility scoring | Low | Low-medium | Weak | Medium | Initially easy, then terrible | Reject as primary |
| Current landed architecture | Medium-high | Medium | Medium | High | Medium | Keep spine, replace authoring layer |
| Full MCTS / rollouts | Theoretically high | Often low | Emergent, opaque | Weak-medium due cost/trace | Poor | Reject as primary |
| Pure HTN planner | High | Medium-high | High if typed | Risky if unbounded | Medium | Borrow decomposition only |
| Behavior tree bot DSL | Medium-high | High | Medium | High if bounded | High | Borrow fallback/priority shape |
| GOAP symbolic planner | High | Medium | High | Risky second engine | Medium-low | Borrow expectations only |
| BDI doctrine/intent model | High | High | Depends on target algebra | High if advisory | High | Borrow conceptual separation |
| Recommended DIPT-C | High | High | High | High | Medium-high | Adopt |

The current landed architecture is the best existing substrate, but not the best final abstraction. Its core flaw is not runtime legality; it is **semantic compression**. Too much doctrine, target reasoning, and future-legality setup is compressed into scalar components, string keys, and local probes.

# **7. Recommended architecture: DIPT-C**

Name: **DIPT-C — Doctrine–Intent–Plan–Target Contracts**

DIPT-C is a declarative, bounded, observer-safe advisory architecture layered above the existing microturn protocol.

## **Conceptual layers**

### **1. Observer-scoped belief surface**

This layer is not probabilistic omniscience. It is the current player’s legal observer projection, plus explicit preview/probe statuses. Hidden, partial, stochastic, unresolved, depth-capped, and failed evidence remain distinct.

### **2. Doctrine layer**

A doctrine is a named strategic stance, not a score group. It owns:

* Activation condition.  
* Strategic priority tier.  
* Enabled and suppressed intent families.  
* Target priority families.  
* Relationship/rival posture.  
* Fallback/deviation policy.  
* Horizon policy.  
* Trace label and contrast text.

Examples:

* `arvn.buildPoliticalEngine`  
* `arvn.emergencyCounterinsurgency`  
* `us.supportAndWithdraw`  
* `nva.logisticsBeforeCoup`  
* `vc.undergroundOppositionEngine`

A doctrine still does not create legal moves. It narrows and explains advisory intent.

### **3. Intent layer**

An intent is the selected reason for the turn. It is a typed object, not just a template id. It can say:

* “Build Patronage without increasing US margin too much.”  
* “Block VC near-win by reducing Opposition and removing a base.”  
* “Preserve Trail/logistics before Coup.”  
* “Exploit Terror + Tax while remaining hidden.”

The intent selects plan families and target role contracts. This is the BDI-inspired missing layer.

### **4. Plan family layer**

Plan templates remain, but become plan families with explicit decomposition:

* Root action family.  
* Optional special activity family.  
* Sequencing contract.  
* Required and optional roles.  
* Expected decision surfaces.  
* Feasibility certificate requirements.  
* Deviation/fallback tree.  
* Posture expectations.

This is HTN-like, but bounded and authored.

### **5. Target algebra layer**

Replace string-key target semantics with typed target contracts:

* `ZoneTarget`  
* `TokenTarget`  
* `CardTarget`  
* `ActionVariantTarget`  
* `OriginDestinationTarget`  
* `RoutePathTarget`  
* `PieceBundleTarget`  
* `SubsetTarget`  
* `FutureLegalitySetupTarget`  
* `RelationshipSeatTarget`

Each target has:

* Stable canonical identity.  
* Human label.  
* Observer provenance.  
* Source selector.  
* Role type.  
* Quality components.  
* Constraints.  
* Optional projected-state expectations.  
* Trace rationale.

Pipe-delimited identities may remain as canonical serialized keys, but not as the semantic representation.

### **6. Feasibility certificate layer**

Replace ad hoc feasibility fragments with a single advisory certificate:

* Root published-frontier membership.  
* Compound availability.  
* Role target availability.  
* Expected decision-surface match.  
* Route/path reachability status.  
* Post-state expectation status.  
* Preview/probe budget status.  
* Hidden/partial/stochastic unavailable reasons.  
* Fallback/deviation readiness.

This certificate is **not legality**. It is advisory evidence and trace.

### **7. Execution monitor**

Keep the current plan controller. It should continue exact → reselected → primitive fallback → stable frontier fallback. But the trace should reference doctrine, intent, role contract, feasibility certificate, and deviation policy, not merely “fallback reason.”

## **Runtime model**

Runtime remains:

1. Kernel publishes finite atomic legal frontier.  
2. Agent evaluates observer-scoped belief.  
3. Active doctrines are evaluated.  
4. Doctrine selects or filters intents.  
5. Intent proposes bounded plan-family candidates.  
6. Plan candidates bind typed target roles.  
7. Feasibility certificates are computed under named caps.  
8. A selected root must be in the published frontier.  
9. Execution proceeds microturn by microturn through the kernel frontier.  
10. Deviations are traced against the selected intent and fallback policy.

## **Compiler validation model**

The compiler should validate:

* Doctrine references to intents, target families, plan families, posture evaluators, and relationship roles.  
* Plan-role target type compatibility.  
* Decision surface compatibility.  
* Route/path target source validity.  
* Subset bounds and beam widths.  
* All cap classes statically named.  
* Post-state expectation predicates limited to allowed bounded expectation classes.  
* Observer-safety of target and trace fields.  
* Fallback/deviation policy completeness.  
* No scalar-only doctrine without traceable intent.

## **Trace model**

A good trace should answer:

* Why this doctrine?  
* Why this intent?  
* Why this plan family?  
* Why these targets?  
* What alternatives were rejected?  
* Which constraints/expectations passed, failed, or were unavailable?  
* What hidden/partial/budget evidence was not available?  
* Did execution follow the plan?  
* If not, was the deviation expected, reselected, or a fallback?

Today’s traces have pieces of this. DIPT-C makes it the primary audit object.

## **Hidden-info model**

DIPT-C uses the existing observer model. No agent sees hidden state except in explicit omniscient analysis mode. Preview and feasibility certificates carry statuses, not guessed numbers. Exact-world preview is allowed only when the observer scope permits it or in named omniscient diagnostics.

## **Future evolution model**

Evolution should mutate meaningful structures:

* Doctrine activation thresholds.  
* Doctrine priority tiers.  
* Intent family enable/suppress links.  
* Target-family ordering.  
* Role constraints.  
* Fallback/deviation policy.  
* Posture expectations.  
* Horizon caps.  
* Trace labels.

It should not primarily mutate flat weights.

# **8. FITL expressiveness check**

## **ARVN**

DIPT-C expresses ARVN as competing doctrines:

* `buildPoliticalEngine`: enables Train+Govern and Patrol+Govern; suppresses low-value Assault/Raid unless emergency.  
* `protectControlBeforeCoup`: emphasizes Control, Patronage, redeploy-safe troop placement.  
* `emergencyCounterinsurgency`: enables Sweep+Raid or Assault+Transport when VC/NVA near-win.  
* `rivalUSNearWin`: flips US from nominal ally to kingmaker risk.

Train/Govern becomes an intent:

* Root: Train.  
* Special: Govern after Train.  
* Roles: train space, govern space, police/troop setup, patronage target.  
* Expectations: ARVN margin improves; US Support gain does not hand US the win; Pacification legality preserved; resource cost acceptable.  
* Fallback: if Govern unavailable, continue Train with political target; trace says why Govern failed.

Transport origin/destination becomes a typed `OriginDestinationTarget` plus `PieceBundleTarget`:

* Origin must contain movable ARVN pieces.  
* Destination must be reachable via authored route semantics.  
* Origin and destination distinct.  
* Origin-control preservation expectation must be evaluated on the intended piece bundle, not global projected margin.  
* Destination value includes continued Assault, COIN Control, Pacification setup, and redeploy risk.

Assault/Transport/continued Assault becomes explicit sequencing:

* Assault root.  
* Transport mobility insert.  
* Continued Assault target role.  
* Feasibility certificate records whether the continuation is ready/provisional/unavailable.

## **US**

US doctrine can express:

* `supportAndWithdraw`: Train+Advise, Air Lift to enable Train/Pacification, avoid overcommitment.  
* `surgicalStrike`: Assault/Air Strike only when removal changes control, kills bases, blocks victory, or protects Support.  
* `blockInsurgentNearWin`: target VC Opposition/Bases or NVA Control/Bases.  
* `containARVNRival`: avoid feeding ARVN Patronage when ARVN near victory.

US Air Lift/Advise/Air Strike become plan families with target contracts. Air Strike’s populated-space penalty is a posture expectation, not merely a scalar warning.

## **NVA**

NVA doctrine can express:

* `trailLogisticsBeforeCoup`  
* `buildBaseNetwork`  
* `marchInfiltratePressure`  
* `blockUSARVNControl`  
* `rivalVCBaseSteal`

March/Infiltrate uses route/path targets and piece-bundle roles. It can distinguish moving troops for control from moving pieces to create Infiltrate superiority, and it can explain when VC becomes a rival target.

## **VC**

VC doctrine can express:

* `undergroundOppositionEngine`  
* `terrorTaxResourceTurn`  
* `rallySubvertBaseDefense`  
* `ambushOnlyWhenFavorable`  
* `protectBasesFromNVA`

Terror/Tax is an explicit compound plan, not two unrelated action preferences. Rally/Subvert can bind base-defense, hidden-guerrilla, and target-piece roles. Conventional Attack can be suppressed unless Ambush or favorable posture is certified.

## **Coup/Monsoon and ally-as-rival**

DIPT-C should add a bounded strategic event horizon:

* Current turn.  
* Forced continuations.  
* Next known Coup/Monsoon/reset/eligibility/redeploy window when statically visible through schedule/phase/card policy.  
* No opponent rollouts.  
* No unbounded search.

This lets all four factions choose concrete near-Coup scoring over speculative setup while preserving Foundations.

# **9. Generalization check**

## **Perfect-information board game**

DIPT-C works for generic-control-like games by using simple doctrines and typed zone/token targets. The architecture should not require plan templates for every game; simple utility-like policies remain valid as degenerate cases. Current generic-control proves minimal conformance, not target-rich competence.

## **Hidden-information card game**

For Texas Hold’em-like games, doctrine might be betting posture, intent might be value bet/bluff/call/fold, and target algebra might be action variants rather than map targets. Hidden card evidence remains observer-scoped; traces must not leak deck/hand identities. The current Texas profile is intentionally simple and flat, but observer tests show the hidden-information boundary can be enforced.

## **Stochastic game**

DIPT-C treats stochastic outcomes as preview/feasibility statuses. It can use expected-value-like local scorers if the game provides observer-safe public probability surfaces, but it must not silently convert unknown random branches into ready scalar evidence.

## **Asymmetric/phase-heavy game**

FITL is the main proof target. DIPT-C is designed precisely for asymmetric, role-heavy, sequence-heavy games.

## **Tactical card/board game with heavy target selection**

Typed target algebra is the key. A tactical game needs card targets, piece targets, subset targets, route/path targets, and future-legality targets. Current selector machinery has the raw enumeration pieces; DIPT-C makes them semantic and traceable.

# **10. Validation and test strategy**

The validation strategy should be architectural, not merely campaign-statistical.

## **Compiler validation**

Prove:

* Doctrine/intent/plan references resolve.  
* Target type contracts match decision surfaces.  
* Route/path targets reference valid authored data.  
* Subset and product enumerations are capped.  
* Feasibility certificate cap classes are named.  
* Post-state expectations are bounded and typed.  
* Hidden target sources cannot leak into public traces.  
* Fallback/deviation policy is complete.

## **Runtime invariants**

Prove:

* Agents only choose from published legal frontiers.  
* Selected plan root is published.  
* Controller decisions are published.  
* Feasibility certificates never become legality authority.  
* Deviation/fallback remains deterministic.  
* No advisory probe mutates authoritative state.

## **Determinism and replay**

Keep existing replay identity tests and add trace-golden tests for doctrine, intent, target binding, feasibility, and deviation.

## **Policy-quality witnesses**

Do not rely on win rate. Add witnesses for:

* ARVN refuses Transport that loses origin control.  
* ARVN Train/Govern separates Patronage from US Support when US near-win.  
* US avoids Air Strike that creates Opposition unless high-value block.  
* NVA protects Trail before Coup.  
* VC avoids conventional Attack without Ambush.  
* VC protects bases from NVA Infiltrate.  
* All factions shift posture under Monsoon.

The repo already has policy-quality witnesses for several of these behaviors, such as ARVN transport origin-control refusal, US Air Strike caution, NVA Trail protection, VC attack caution, and ally/rival flips in the test inventory shown by the manifest.

## **Cross-game conformance**

Keep current conformance, but expand it:

* Perfect-info board game with plan/target roles.  
* Hidden-info card game with nontrivial policy traces.  
* Stochastic game with fallback/provenance.  
* Asymmetric phase-heavy FITL.  
* Heavy target-selection synthetic game focused on subsets, routes, piece bundles, and origin/destination pairs.

## **Human-plausibility witnesses**

Add trace-based checks:

* Selected doctrine matches visible board state.  
* Target rationale is non-empty and specific.  
* Rejected alternatives have contrastive reasons.  
* Ally-as-rival flips are state-triggered, not random.  
* Repeated turns do not oscillate doctrine implausibly.  
* High-win profiles that produce nonsensical traces fail quality review.

# **11. Migration strategy at architectural level**

This is a **partial replacement**, not a kernel rewrite.

## **Keep**

* GameSpecDoc rule authority.  
* Microturn publication and apply protocol.  
* Plan-selected root authority.  
* Plan controller.  
* Role-bound execution state.  
* Observer-safe preview/provenance.  
* Current conformance and observer-safety tests.

## **Replace or reframe**

* Reframe `strategyModules` as doctrine carriers only if they gain first-class doctrine responsibilities; otherwise introduce a new `doctrines` section and migrate modules into it.  
* Promote `planTemplates` into plan families with typed target-role contracts.  
* Replace pipe-delimited semantic target identities with typed target objects and canonical serialized keys.  
* Recast `routePairs` as one target-algebra source, not the route model itself.  
* Restrict `postState` into named bounded expectation classes.  
* Fold compound availability into a general feasibility certificate.  
* Update posture evaluators to consume intent/target roles, not only candidate scalar projections.

## **Current FITL agents**

Do not tune profile quality as part of the architecture migration. Instead:

* Classify existing selectors/components into target families.  
* Mark constant/zero-weight components as migration warnings.  
* Preserve behavior witnesses as regression checks.  
* Migrate ARVN first because it stresses Transport, Govern, Patronage, US rivalry, and Coup redeploy.  
* Then migrate US, NVA, VC.

## **Cookbook**

`docs/agent-dsl-cookbook.md` should be rewritten after the architecture decision. It should stop teaching “strategy modules are still scoring data” as the central doctrine model. That description is accurate for the current implementation, but it is exactly what needs to change.

## **Future improve-loop campaigns**

Future evolution should optimize doctrine/intent/target structures and traces. Campaign metrics should include:

* Win rate and margin.  
* Human-plausibility witness pass rate.  
* Doctrine stability.  
* Trace contrast quality.  
* Fallback/deviation rate.  
* Hidden-info unavailable evidence handling.  
* Target-role diversity.  
* Avoidance of Goodhart patterns.

# **12. FOUNDATIONS amendment proposal**

A small amendment is warranted because existing Foundations protect legality, determinism, observer safety, boundedness, and preview integrity, but they do not explicitly state that AI behavior quality is more than win rate or that advisory intent traces are first-class audit artifacts.

Recommended insertion after Foundation #20:

## **21. Advisory Intent Traceability and Human-Plausible Agent Quality**

AI agents MAY perform bounded advisory reasoning over observer-safe state, but advisory reasoning is never rule-authoritative and never bypasses the kernel-published microturn frontier. Every selected doctrine, intent, plan family, target role, feasibility certificate, fallback, and deviation MUST be traceable with deterministic contrast against rejected alternatives when trace level requests it.

Profile-quality success MUST NOT be measured by win rate alone. Human-plausibility witnesses, doctrine consistency, target rationale, hidden-information discipline, fallback/deviation transparency, and Goodhart/alien-optimizer guards are first-class AI-quality evidence. These quality witnesses are distinct from kernel determinism proofs: failures indicate profile or advisory-architecture regressions unless they expose a rules-protocol violation.

Why existing Foundations are insufficient: #9 covers event auditability, #16 covers testing as proof, and #20 covers preview provenance, but none explicitly protect against the high-win alien optimizer failure mode. The mission’s top priorities make that gap architectural.

Risk: this amendment introduces qualitative tests that can become brittle. Mitigation: keep human-plausibility witnesses in profile-quality lanes unless they prove a kernel/protocol violation, mirroring the existing distinction between determinism proofs and profile-quality witnesses.

# **13. Risks and rejected alternatives**

## **Why not MCTS as primary architecture**

MCTS was already tried and was too slow for FITL scale. Research also supports the concern: high branching factors and horizon effects are real problems. FITL’s competence needs doctrine, target rationale, and traceability, not opaque rollout statistics. Search can remain offline or tightly bounded local diagnostic tooling.

## **Why not more flat weights**

Flat weights hide intent. They are easy to mutate and hard to understand. They produce plausible-looking score tables while failing to explain why a human-like faction chose a plan. Current FITL profiles still show scalar and constant placeholders; adding more weights would deepen the problem, not solve it.

## **Why not hardcoded game-specific bots**

That violates the engine-agnostic and GameSpecDoc ownership principles. FITL semantics belong in authored data/policy artifacts, not engine branches.

## **Why not unbounded planners**

Unbounded HTN/GOAP/search risks becoming a second rules engine. It also harms determinism, performance, authorability, and replay.

## **Risks in current architecture**

* **Over-layering:** Each new patch solves a local gap while hiding the missing target/intent abstraction.  
* **`postState` overreach:** Synthetic post-state probing can drift into advisory rule execution.  
* **Weak doctrine:** Gating arrays do not equal doctrine.  
* **Shallow routes:** `reachable` is not route/path intent.  
* **Trace opacity:** Scalar score components do not explain human doctrine.  
* **Cross-game overclaiming:** Conformance proves portability, not competence.  
* **Authoring complexity:** Designers and LLMs can author examples, but complex behavior still requires understanding many interacting surfaces.  
* **Alien optimizer risk:** Win-rate pressure can reward implausible faction behavior.

## **Overfitting and underfitting risks**

Overfitting to FITL would hardcode COIN concepts into generic policy. Underfitting FITL would preserve abstract selectors too weak to express ARVN Transport or VC hidden posture. DIPT-C avoids both by making the engine generic but the authored semantics rich.

# **14. Final recommendation**

**Go for deeper architecture work. Do not declare the Specs 196–199 layer sufficient.**

The smallest coherent next architectural direction is:

**Keep the microturn kernel and plan-controller spine. Replace the authoring abstraction above it with Doctrine–Intent–Plan–Target Contracts.**

Before implementation decomposition proceeds, prove these architectural claims:

1. A doctrine can own intent, target families, fallback policy, relationship posture, and horizon policy without becoming rule-authoritative.  
2. Typed target algebra can represent zones, tokens, cards, action variants, origin/destination pairs, routes/paths, piece bundles, and subsets generically.  
3. Feasibility certificates can subsume compound availability and post-state expectations while remaining bounded, deterministic, observer-safe, and advisory.  
4. ARVN Transport origin-control preservation can be expressed cleanly without global scalar workaround logic.  
5. Texas-style hidden information still fails closed with no trace leaks.  
6. Cross-game conformance can include a heavy-target synthetic game, not only simple generic-control and flat Texas betting.  
7. Human-plausibility witnesses can fail bad traces even when campaign win rate improves.

Enough evidence to stop doing architecture iterations would be:

* ARVN, US, NVA, and VC all have readable doctrine/intent/target traces for the major FITL sequences.  
* FITL witnesses cover the major human-plausibility behaviors, not only convergence.  
* Cross-game conformance includes hidden, stochastic, perfect-information, phase-heavy, and heavy-target-selection games.  
* No advisory layer chooses outside the published frontier.  
* No post-state/feasibility probe becomes a second rules engine.  
* Profile evolution mutates doctrine/intent/target structures more than raw weights.  
* Designers or LLMs can author a new competent plan family with diagnostics catching the likely mistakes.

The current landed architecture earned the right to be the substrate. It has not earned the right to be the final AI architecture.

---

## Follow-up and supersession (added 2026-05-27)

Operationalized via `/brainstorm` on 2026-05-27 → one spec plus a companion triage memo. The brainstorm critically reassessed this audit against `docs/FOUNDATIONS.md`, `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md` (the prior-iteration triage), and three parallel codebase-verification investigations.

**Adopted (single spec, in corrected scope):**

- **Spec 200** — `specs/200-plan-proposal-trace-completeness.md` — the audit's §5/§7.6 "feasibility certificate" claim, **adopted with adjustment**: five concrete trace-observability gaps (role-target availability, decision-surface match, route reachability status, post-state verdict, hidden/partial unavailable reasons) are real and closed by generalising the Spec 199 `CompoundAvailability` status shape to additional surfaces. The certificate-as-container framing is rejected — each verdict lives on the trace surface where it is produced.

**Superseded — the "DIPT-C" reframe is rejected.** The Doctrine-Intent-Plan-Target shape is already realised by Specs 186/187/190/191/196/197/198/199. This report's recommendation for a "deeper architectural iteration" repeats the same framing IMPLEMENTATION-ORDER-2026-05-27 already corrected in the first iteration ("the closures are enforcement-level additions to a built architecture, not a new architecture"). Foundation #14 forbids the churn the reframe would impose. The proposed Foundation #21 amendment is rejected — Foundations #8, #9, #16, #20 + the Appendix's profile-quality-vs-determinism split already cover the "alien optimizer" concern.

**Stale citations corrected during triage:**

- "`postState` is dangerously close to synthetic rule execution" — overstated. The probe is bounded by per-constraint `maxSteps`, evaluates a single bound role's projected state, parallels Foundation #18's publication probe (Spec 144). Validating probe, not enumerative planner.
- "Strategy modules still look like weighted preferences with constant values" — overstated. Spec 197 §3 verification (on record) found ~69% of FITL modules carry conditional `when:` predicates; `enablesPlanTemplates`/`suppressesPlanTemplates` apply as a pre-scoring filter before scoring.
- Compound-availability stabilisation unacknowledged. Commit `3936e434a` (2026-05-27) capped the probe budget to `{ maxDecisionProbeSteps: 4, maxParamExpansions: 64, maxDeferredPredicates: 16 }` and memoized per-call. The audit's critique of "compound availability as another local patch" overlooks this.
- "First-class Intent is missing" — overstated. `SelectedPlanProposal.intent: string` exists at `plan-proposal.ts:190`; `PlanExecutionState.intent` at `plan-execution.ts:12–21`. Intent already carries the selected `templateId`. Promoting it to a structured object is observability refinement deferred until a witness need surfaces.

**Deferred — not currently actioned:**

- **Typed target algebra replacing pipe-strings** (audit §7.5) — already deferred by IMPLEMENTATION-ORDER-2026-05-27 disposition #2; verification confirms no code parses pipe-strings (`grep` for `.split('|')` on `selectedId` returned no matches). They are stable serialization keys. The new audit supplies no fresh concrete need.
- **Explicit typed Intent layer** (audit §7.3) — deferred until a doctrine-attribution trace witness names a concrete failing case.
- **Lexicographic plan-family selection refinement** (audit §7.4) — already deferred by IMPLEMENTATION-ORDER-2026-05-27 disposition #6.
- **Cookbook conceptual rewrite** (audit §11) — routed to the `reassess-agent-dsl-cookbook` skill, already on the deferred list from IMPLEMENTATION-ORDER-2026-05-27.

**Audit framing corrections:**

- The audit's framing that closure requires "a deeper architecture iteration" is rejected — closures are Foundation-#20-vocabulary extensions to existing trace surfaces, not architectural replacement (mirrors IMPLEMENTATION-ORDER-2026-05-27's correction of the first-iteration audit).
- The audit's "feasibility certificate" container abstraction is rejected; verdicts live on the trace surface where they are produced (consistent with Foundation #15 — root-cause, not paper over).

See `reports/ludoforge-ai-overhaul-second-iteration-triage.md` for the full per-proposal disposition table and cross-cutting framing corrections.
