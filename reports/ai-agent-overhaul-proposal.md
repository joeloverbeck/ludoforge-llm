# **1. Executive verdict**

**Augment flat weighted considerations; do not replace them.** The current model is a competent utility-AI leaf evaluator, but it is not a sufficient strategy authoring surface. It should become the bottom layer of a **game-agnostic structured strategy system**: strategic modules, selectors, guardrails, turn-shape evaluators, audit probes, and trace labels, all compiled into deterministic bounded IR. The engine must still know nothing about Govern, Patronage, COIN control, ARVN, Fire in the Lake, or any future game-specific concept.

The strongest recommendation is a **hybrid architecture**:

1. Keep the existing scoring, preview, fallback, tie-breaking, microturn, and compiler-validation machinery.  
2. Add a higher-level declarative policy layer that lets game data express strategy in named, inspectable units.  
3. Make target and microturn option selection first-class rather than treating them as subordinate to top-level action choice.  
4. Add guardrails and minimum-impact checks that are separate from positive scoring.  
5. Add a deterministic probe harness so policy quality can be tested on curated states before expensive tournaments.  
6. Change evolution so it mutates strategy structure first and numeric weights second.

The repo already has many of the hard foundations needed: the policy DSL is deterministic, finite, microturn-aware, preview-aware, and compiler-validated; profiles already expose state/candidate features, aggregates, pruning rules, considerations, tie breakers, strategic conditions, preview refs, inner preview, and trace metadata. The problem is that the current authoring shape still pushes intelligence into a long list of flat terms. That encourages numeric sludge. The FITL/ARVN profile is already visibly at that point: it has sophisticated preview settings and standing-role terms, but its strategy still largely appears as action-tag weights and scalar considerations.

# **2. Diagnosis of the current architecture and failure mode**

The current architecture is not naive. It already satisfies many of the most important foundations: game behavior lives in specs rather than game-specific engine code; agents consume the same microturn/legal-action protocol as human clients; execution is deterministic and bounded; preview has status/provenance/fallback; and compiler validation catches many invalid refs, unbounded preview costs, missing fallbacks, hidden-state misuse, bad scopes, and dependency cycles.

The current DSL also already supports many tactical ingredients: state features, candidate features, aggregates, pruning rules, weighted considerations, tie breakers, strategic conditions, preview refs, lookup refs, microturn-scoped considerations, chooseOne and chooseNStep inner preview, bounded cap classes, and trace diagnostics.

The failure mode is more specific:

**The model has sensors, but not strategy structure.** ARVN can now read self margin, opponent margin, standing roles, preview option deltas, action tags, candidate params, and microturn option refs. But the profile still mostly says “add this number if action has tag X” or “multiply projected margin by Y.” That is too flat to represent “I am trying to rebuild board position, therefore Train in this target only if it improves presence/control and does not worsen leader pressure.”

**Preview can be honest yet strategically low-information.** The May 17 report found that ARVN selected Govern about 75% of the time over 15 seeds, while NVA projected margin was ready for many candidates but uniformly non-differentiating; VC margin was also mostly uniform. That means the policy can have available preview refs without those refs actually helping choose among actions.

**Action choice, target choice, mode choice, and turn shape are mixed together.** The current system can score top-level moves and microturn options, and chooseNStep inner preview already does per-option differentiation. But there is no first-class concept of “target quality,” “origin safety,” “destination value,” “set-level target diversity,” or “this whole turn accomplished the intended objective.” The chooseNStep tests prove that inner preview can differentiate options, but the policy surface still lacks an authoring layer for saying what a good target set means.

**Guardrails are underdeveloped.** Pruning rules exist, but the architecture needs a richer distinction between “hard illegal/pointless,” “strategically suspicious,” “probably bad but sometimes acceptable,” and “audit-only warning.” Without that separation, evolution either over-prunes or buries anti-blunder logic inside positive weights.

**Tournament margin is too sparse and too terminal.** The ARVN campaign objective is mainly average margin plus win-rate bonus, with 15-seed tournaments explicitly expensive. The campaign notes already warn about trace review, suboptimal moves, and the danger of merely tuning action weights.

**Current trace is excellent at policy mechanics but weak at strategic explanation.** The trace can show candidates, scores, preview usage, pruning, tie breaks, advisories, and fallback, but not “active intent,” “target selector rationale,” “guardrail reason,” or “turn-shape objective.”

# **3. Research synthesis: what fits, what does not**

**Utility AI fits as the leaf evaluator.** Utility systems are good at deterministic arbitration among finite candidates: score each candidate, combine considerations, pick the best. That is essentially what the current model does. The weakness is not utility scoring itself; the weakness is using utility scoring as the entire strategy language. Flat utility terms are easy to mutate but hard to audit.

**Behavior trees fit as a modularity lesson, not as a literal runtime tree.** Behavior trees were invented in game AI to improve modularity when finite-state-machine logic became hard to extend, and the literature emphasizes hierarchical organization and human/analyzer-friendly decomposition. That maps well to named strategic modules and guardrails. It does not require ticking a runtime BT that bypasses the legal action frontier.

**HTN planning fits as an authoring metaphor, not as unbounded planning.** HTN decomposes high-level tasks into primitive tasks using domain knowledge, which is close to how competent players reason: “restore mobility,” “deny leader,” “consolidate position,” then pick actions/targets. But full HTN planning searches over decompositions and executable sequences, which conflicts with bounded runtime and the microturn protocol unless heavily restricted. The useful import is hierarchical decomposition and method libraries; the rejected part is runtime search over arbitrary plans.

**GOAP is attractive but should be rejected at runtime.** F.E.A.R.-style GOAP plans sequences by searching over preconditions/effects. That worked for reactive NPCs with cached sensors, but it is still a planner. In this repo, the legal frontier and microturn protocol already define the only choices an agent may make. A GOAP-like “goal/effect” vocabulary can inspire audit labels and turn-shape evaluators, but runtime planning over authored action effects should remain a non-goal.

**MCTS, rollouts, and neural policy search should be non-goals for runtime.** MCTS depends on playouts/rollouts and repeated search-tree expansion, which directly threatens bounded deterministic performance and trace simplicity. It can be useful as an offline research comparator, but not as policy execution machinery under these foundations.

**Influence maps and tactical fields are useful if generalized.** Strategy-game research often separates high-level abstractions from low-level tactical evaluation; RTS work shows that high-level abstraction can help strategy but lose tactical details, while tactical search can recover details at extra cost. For this repo, the right analogue is not tactical search but bounded, declarative influence/field primitives over finite game collections: zones, graph nodes, pieces, markets, cards, workers, slots.

**General-game systems reinforce the need for game-agnostic primitives.** OpenSpiel supports many game families—n-player, zero-sum, cooperative, general-sum, sequential, simultaneous, perfect and imperfect information—and Ludii’s GDL work shows that finite deterministic, nondeterministic, and imperfect-information games can be represented declaratively. That argues against any COIN-shaped AI layer and for generic finite selectors, state surfaces, visibility rules, and standing vectors.

**Quality-diversity search is a better evolution lens than “best average margin only.”** MAP-Elites explicitly maps high-performing solutions across behavior dimensions chosen by the user, returning diverse elites rather than one global winner. That maps directly to policy evolution: action mix, module mix, target-quality pass rate, denial/self-help ratio, preview usage, fallback/no-signal rate, and complexity can be behavior dimensions.

**Human-plausibility testing should be scenario/probe based.** Automated game-testing research uses synthetic and human-like agents, scenario-derived goals, trajectories, and oracles to test behavior. The relevant translation here is not “imitate humans with ML”; it is “test agent choices on strategically meaningful states with explicit assertions and readable diagnostics.”

# **4. Recommended architecture**

Call the new layer the **Structured Strategy Policy Layer**.

It should sit above the existing policy DSL and compile down to generic policy IR. The engine should see only generic data structures: expressions, scopes, finite selectors, bounded collections, priorities, fallback policies, trace labels, and preview refs.

The stack should look like this:

1. **Signals**  
    Existing state features, candidate features, aggregates, strategic conditions, standing refs, lookup refs, preview refs, and microturn refs.  
2. **Selectors**  
    Named, bounded rankers over finite collections: legal candidates, microturn options, zones, tokens, cards, players, candidate params, or declared finite products such as origin/destination pairs.  
3. **Strategic modules / intents**  
    Named modules that activate under conditions and contribute grouped scoring, target preferences, and guardrails. They do not execute actions. They only score/prune/demote published legal choices.  
4. **Guardrails / anti-blunder rules**  
    Separate negative layer with severity: prune, demote, warn, audit-only.  
5. **Turn-shape evaluators**  
    Bounded checks over the current action/microturn chain and existing preview evidence: “does this sequence improve any declared objective,” “does it help the leader,” “does it leave the target set empty,” “did completion fall back.”  
6. **Audit probes**  
    External deterministic tests over curated board states/scenarios.  
7. **Trace/explanation contract**  
    Bounded, deterministic, grouped explanation of selected and rejected candidates.

This is not a new game engine, not a FITL subsystem, not a planner, and not an LLM runtime. It is a structured authoring and diagnostics layer over the existing deterministic evaluator.

# **5. Alternative architectures considered and rejected**

| Alternative | Verdict | Reason |
| ----- | ----- | ----- |
| Keep flat considerations and improve tooling only | Reject as insufficient | Better linting would expose weight soup but not provide an authoring language for intent, target quality, guardrails, or turn-shape rationale. |
| Replace utility with behavior trees | Reject literal replacement | BT modularity is valuable, but a ticking BT can fight the legal frontier. Use BT-style modularity as compiled strategy modules instead. |
| Add HTN planning | Reject runtime planning | HTN decomposition is useful for authoring, but runtime decomposition/search violates boundedness unless so restricted that it becomes modules/selectors anyway. |
| Add GOAP | Reject runtime planning | GOAP’s precondition/effect search is too expensive and too hard to validate generically. Use goal/effect vocabulary only as declarative labels and impact predicates. |
| Add MCTS/rollouts | Reject runtime use | Too expensive, difficult with hidden information, difficult to explain, and not aligned with deterministic bounded policy evaluation. |
| Add audit traces only | Useful but insufficient | It diagnoses bad behavior but does not give evolution a better mutation surface. |
| Add game-specific ARVN/FITL logic | Hard reject | Directly violates the foundations. |
| Add structured utility modules, selectors, guardrails, probes | Recommend | Preserves determinism, legal frontier, bounded evaluation, preview provenance, and game-agnostic machinery while giving policy authors/evolution strategy-shaped handles. |

# **6. Proposed game-agnostic primitives and authoring layers**

The following sketches are illustrative data shapes, not implementation code. The names are placeholders.

## **6.1 Strategic modules**

A strategic module is a named, declarative scoring group. It answers: “When this situation holds, what kind of legal choice should become attractive, what targets/options matter, what impact is required, and how should the trace explain it?”

Illustrative shape:

strategyModules:

 build-position:

   traceLabel: "build position"

   when:

     all:

       - { ref: "condition.needsPresence.satisfied" }

       - { not: { ref: "condition.emergencyDefense.satisfied" } }

   applies:

     scopes: [move, microturn]

     actionTags: [dataAuthoredActionTagA, dataAuthoredActionTagB]

     decisionKinds: [actionSelection, chooseOne, chooseNStep]

   priority:

     tier: 30

     value: { ref: "condition.needsPresence.proximity" }

   selectors:

     primaryTarget: valuable-location

   scoreGroups:

     actionShape:

       terms: [preferRelevantActionFamily]

     targetQuality:

       selector: valuable-location

     standing:

       terms: [improveSelfStanding, reduceLeaderStanding]

   guardrails:

     - no-declared-objective-effect

     - helps-leader-without-self-gain

   fallback:

     ifInactive: noContribution

     ifSelectorEmpty: demoteAndTrace

The engine should not know what “build position” means. It sees a module id, expressions, scopes, tags, selectors, score groups, guardrails, fallback, and trace labels.

## **6.2 Selectors**

Selectors are the missing middle layer. A selector ranks a finite set of entities or options and exposes generic refs such as:

* `selector.<id>.selected.matches`  
* `selector.<id>.selected.quality`  
* `selector.<id>.selected.rank`  
* `selector.<id>.selected.component.<componentId>`  
* `selector.<id>.candidate.<key>.quality`  
* `selector.<id>.impactSatisfied`

Illustrative shape:

selectors:

 valuable-location:

   source:

     collection: zones

     key:

       from: microturn.option.value

       keyType: ZoneId

   where:

     all:

       - { ref: "feature.locationIsRelevant" }

       - { neq: [{ ref: "selector.item.id" }, null] }

   quality:

     components:

       - id: objective-pressure

         value: { ref: "feature.locationObjectivePressure" }

         weight: 4

       - id: self-gain

         value: { ref: "feature.projectedSelfStandingDelta" }

         weight: 6

         previewFallback: { onUnavailable: noContribution }

       - id: leader-denial

         value: { ref: "feature.projectedLeaderStandingDeltaNegated" }

         weight: 3

         previewFallback: { onUnavailable: noContribution }

   minImpact:

     any:

       - { gt: [{ ref: "feature.projectedSelfStandingDelta" }, 0] }

       - { gt: [{ ref: "feature.projectedLeaderDenial" }, 0] }

   result:

     maxItems: 8

     order: [qualityDesc, stableKeyAsc]

     onEmpty: traceAndNoContribution

This is game-agnostic because `zones`, `microturn.option.value`, lookup refs, standing deltas, and score components are generic. FITL can author a zone-quality concept; another game can author a worker-placement slot-quality concept.

## **6.3 Pair selectors**

Movement, transport, trade, attacks, purchases, and conversions often require comparing a source and a destination or a piece and a target. Do not fake this with independent flat terms. Add bounded pair/product selectors.

selectors:

 source-destination-transfer:

   source:

     product:

       left: zones

       right: zones

       maxPairs: 64

   where:

     all:

       - { ref: "feature.transferIsLegalShape" }

       - { ref: "feature.destinationAcceptsPiece" }

   quality:

     components:

       - id: origin-safety-loss

         value: { neg: { ref: "feature.originSafetyAfterMove" } }

         weight: 3

       - id: destination-value

         value: { ref: "feature.destinationStrategicValue" }

         weight: 6

       - id: route-or-connectivity-gain

         value: { ref: "feature.connectivityGain" }

         weight: 2

   result:

     maxItems: 8

     order: [qualityDesc, stableKeyAsc]

The important part is the explicit `maxPairs`. Products are dangerous unless bounded.

## **6.4 Guardrails**

Guardrails are negative evidence, not ordinary positive scoring. They should be authored separately.

guardrails:

 no-declared-objective-effect:

   scope: [move, microturn]

   when:

     all:

       - { not: { ref: "selector.primaryTarget.impactSatisfied" } }

       - { lte: [{ ref: "feature.projectedSelfStandingDelta" }, 0] }

       - { lte: [{ ref: "feature.projectedOpponentDenial" }, 0] }

   severity: demote

   penalty: 100

   onUnavailable: warnUnknown

   traceLabel: "no declared objective effect"

Hard pruning should require an explicit `safe: true`, a nonempty-frontier fallback, and compiler checks that the rule cannot silently erase the entire candidate set.

## **6.5 Turn-shape evaluators**

A turn-shape evaluator should summarize a bounded chain, not search for a plan. It consumes existing preview and inner-preview evidence.

turnShapeEvaluators:

 current-turn-impact:

   source: currentPreviewDrive

   bounds:

     depthCapRef: profile.preview.inner.depthCap

     maxSyntheticDecisions: 16

   objectives:

     - id: self-standing

       delta: { ref: "standing.delta.self.margin" }

     - id: leader-denial

       delta: { ref: "standing.delta.currentLeader.margin" }

     - id: target-quality

       value: { ref: "selector.primaryTarget.selected.quality" }

   minimumImpact:

     any:

       - { gt: [{ ref: "objective.self-standing.delta" }, 0] }

       - { lt: [{ ref: "objective.leader-denial.delta" }, 0] }

   fallback:

     onPreviewUnavailable: traceOnly

# **7. Target, microturn, and turn-shape handling**

Top-level action choice is not the main bottleneck anymore. The architecture should treat every decision context as a meaningful policy frontier:

* `actionSelection`: choose the legal root move.  
* `chooseOne`: choose a mode, target, card, piece, or option.  
* `chooseNStep`: build a bounded set through add/remove/confirm.  
* `outcomeGrantResolve`: currently kernel-resolved, but preview continuation already has trace implications.  
* `turnRetirement`: normally not policy-intelligent, but still traceable.

The microturn protocol already exposes legal decisions and context data, including chooseOne options, chooseNStep selectedSoFar, cardinality, commands, template hints, and option metadata.

## **7.1 Ranking zones, pieces, cards, options**

The engine should support generic selectors over:

* legal root candidates,  
* microturn options,  
* current candidate params,  
* zones,  
* tokens/pieces,  
* cards or card annotations when visible,  
* players/seats,  
* finite game-authored collections,  
* bounded products such as `(origin, destination)` or `(piece, target)`.

Selectors should be able to bind to `microturn.option.value`, `candidate.params.*`, or lookup keys. They must not infer FITL semantics. If a FITL option value is a zone id, the selector can treat it as a `ZoneId` because the game data says so.

## **7.2 Detecting whether a candidate affects valuable targets**

A selector should have two separate outputs:

1. **Quality**: how attractive the target is.  
2. **Impact satisfied**: whether the candidate actually does something meaningful to that target.

This avoids the common failure: selecting a strategically important zone but doing an action/mode that changes nothing relevant there.

## **7.3 Source safety versus destination value**

Movement-like actions need pair evaluation. The policy should compare origin damage and destination benefit in one selector. This is not FITL-specific; it applies to troop movement, worker movement, card transfer, market placement, logistics, tactical retreats, and economic conversion.

## **7.4 Avoiding no-impact target choices**

Every module that depends on a target selector should declare one of:

* `minImpact`: required objective evidence,  
* `ifNoImpact: demote`,  
* `ifNoImpact: warn`,  
* `ifNoImpact: allowWithTrace`.

The default should not be hard prune. Some good human moves are preparatory. But “preparatory” must itself be expressible as an objective, not silently treated as success.

## **7.5 chooseOne handling**

For chooseOne, the selected option should carry:

* option stable key,  
* selector rank,  
* selector quality,  
* quality components,  
* preview ref status,  
* active module(s),  
* fallback/no-signal status.

The current chooseOne inner preview already applies a chosen option and drives bounded continuation; the new layer should reuse that, not add a second preview system.

## **7.6 chooseNStep handling**

chooseNStep needs both incremental and set-level intelligence.

Incremental scoring answers: “Should I add this option now?”  
 Set-level scoring answers: “Is this whole selected set coherent?”

The current chooseNStep implementation already sorts root options by stable key, uses bounded beam continuation, scores microturn options, and records evaluated candidate counts.

Add these generic set-level primitives:

* `coverage`: selected set covers enough distinct valuable entities.  
* `redundancyPenalty`: selected set repeats low-value equivalents.  
* `diversity`: selected set hits multiple declared categories.  
* `completionValue`: confirm only when selectedSoFar satisfies minimum impact.  
* `removeValue`: remove low-quality selected item if legal.  
* `marginalGain`: score an add by change in set quality, not just option quality.

All of these are generic over finite sets.

# **8. Guardrails and anti-blunder system**

Guardrails should be a first-class negative layer. Positive scoring asks “what do I like?” Guardrails ask “what must I not accidentally do?”

Recommended severity model:

| Severity | Runtime effect | Use case |
| ----- | ----- | ----- |
| `prune` | Remove candidate if safe and frontier fallback exists | Provably pointless, impossible, or self-contradictory choices. |
| `demote` | Apply penalty or score ceiling | Helps leader, wastes scarce resource, target has no value, worsens self without denial. |
| `warn` | Keep candidate but mark suspicious | Potential sacrifice, uncertain preview, ambiguous preparation. |
| `auditOnly` | No runtime effect; probe/report only | Human-plausibility checks, experimental heuristics. |

Hard pruning should be rare. A guardrail should only hard-prune if:

* it is deterministic,  
* bounded,  
* visibility-safe,  
* preview fallback is explicit,  
* `onAllPruned` is declared,  
* compiler can validate scope and refs,  
* the profile author marks it safe.

Examples of generic guardrails:

* candidate has no projected effect on any declared objective,  
* candidate helps current leader more than self,  
* candidate worsens self standing without compensating denial,  
* candidate spends scarce resource below minimum impact,  
* selected target fails selector minimum quality,  
* selected origin loses more value than destination gains,  
* selected set contains redundant low-value targets,  
* preview signal unavailable and no declared fallback path,  
* action family chosen by tiebreak/no-signal too often.

The existing code already treats preview unavailability and no-signal as traceable facts rather than silently pretending a scalar exists. Profile-quality tests assert honest `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisories and `tiebreakAfterPreviewNoSignal` behavior. That precedent should extend to strategy guardrails.

# **9. Policy audit harness design**

Full tournaments are necessary but insufficient. The new system needs a **policy audit harness** that runs deterministic probes over curated states and checks action, target, microturn, guardrail, preview, and explanation properties.

This should live outside the kernel as test/campaign infrastructure. It should not change legal action generation.

## **9.1 Probe format**

Illustrative shape:

policyProbes:

 - id: "midgame-target-has-impact"

   game: "some-game-id"

   profile: "seat-profile-id"

   seat: "seat-id"

   stateBinding:

     scenario: "scenario-id"

     seed: 1000

     replayPrefix: "optional-known-decision-prefix"

     expectedStateHash: "optional"

   decisionBinding:

     contextKind: chooseNStep

     decisionKey: "$targetSelection"

     occurrence: first

   assertions:

     - kind: selectedTargetSatisfiesSelector

       selector: valuable-location

       minRank: 3

     - kind: guardrailNotFired

       guardrail: no-declared-objective-effect

     - kind: activeModuleIncludes

       module: build-position

     - kind: previewStatus

       ref: "standing.delta.self.margin"

       allowed: [ready, unavailableWithFallback]

     - kind: selectedCandidateNotBy

       reason: tiebreakAfterPreviewNoSignal

   severity: warning

   tags: [target-quality, plausibility]

The probe may contain FITL-specific scenario ids, profile ids, action tags, and selector ids because probes are campaign/test data. The harness remains game-agnostic.

## **9.2 Assertion types**

Assertions should support:

* selected action has/does-not-have tag,  
* selected candidate rank within top K under selector/module,  
* selected target satisfies selector,  
* selected set satisfies set evaluator,  
* active module present,  
* module expected inactive,  
* guardrail fired/not fired,  
* no hard-prune emptied frontier,  
* preview ref ready/unavailable with expected fallback,  
* standing delta relation holds,  
* score group contributed/non-contributed,  
* selected reason is not `tiebreakAfterPreviewNoSignal`,  
* trace includes required explanation fields,  
* runtime cost below cap.

## **9.3 Hard gate or warning?**

Use tiers:

1. **Architectural invariants**: hard gate. Determinism, legal action, hidden-info safety, preview honesty, boundedness.  
2. **Profile-quality gates**: usually gate for mature profiles, warning for experimental profiles.  
3. **Human-plausibility probes**: warning or score component by default; hard gate only after enough probe diversity exists.  
4. **Regression witnesses**: hard gate when they capture a known fixed failure, but mark them profile-specific.

The repo already distinguishes architectural invariants from profile-specific convergence witnesses; one ARVN test explicitly says it is profile-specific and should not be distilled into an architectural invariant. That is the right precedent.

## **9.4 Avoiding probe overfit**

Do not use exact-action probes as the main oracle. Prefer property assertions:

* “selected target is in top 3 under selector,” not “must pick Saigon.”  
* “does not fire no-impact guardrail,” not “must Train.”  
* “leader-help guardrail warning count is zero,” not “must Assault.”  
* “selected move improves some declared objective,” not “must choose a named FITL action.”

Use rotating probe sets:

* public probes for regression,  
* hidden holdout probes for acceptance,  
* scenario families generated from templates,  
* randomized-but-seeded state perturbations,  
* post-acceptance audits on unseen seeds,  
* complexity penalties so policies cannot encode probe-specific quirks cheaply.

Recent research on starting from strategically relevant intermediate states shows this can accelerate exploration in difficult imperfect-information games, but also warns that biased state distributions can bias learned behavior. That is exactly why probe families need holdouts and distribution checks.

# **10. Strategy trace and explanation contract**

The current trace contract is already strong for candidate scoring, preview status, pruning, tie breaks, and diagnostics. It should be extended, not replaced.

Default summary trace should include:

strategyTrace:

 selected:

   stableMoveKey: "..."

   decisionKind: chooseNStep

   actionId: "optional-root-action-id"

   optionValue: "optional"

   selectedBy: strategy | guardrailDemotion | tieBreaker | fallback | noSignal

 modules:

   active:

     - id: build-position

       priorityTier: 30

       activation: ready

       activationValue: 0.72

       contribution: 44

   inactiveTopReasons:

     - id: emergency-defense

       reason: conditionFalse

 targets:

   primary:

     selector: valuable-location

     selectedKey: "..."

     rank: 2

     quality: 17

     impactSatisfied: true

     components:

       - id: self-gain

         value: 2

         contribution: 12

       - id: leader-denial

         value: 1

         contribution: 3

 guardrails:

   fired:

     - id: scarce-resource-low-impact

       severity: warn

       status: ready

   notFiredTop:

     - id: no-declared-objective-effect

 standing:

   selfDelta: { status: ready, value: 1 }

   currentLeaderDelta: { status: ready, value: -1 }

   nearestThreatDelta: { status: unavailable, fallback: noContribution }

 scoreGroups:

   base: 3

   modules: 44

   targetQuality: 17

   guardrailPenalty: -5

   preview: 12

   tieBreak: 0

 preview:

   refIds: [...]

   utility: differentiating | lowInformation | constant | none

   fallbackCount: 0

   coverage: "existing previewUsage block"

 bounds:

   candidatesScored: 12

   selectorsEvaluated: 3

   previewCandidatesDriven: 8

   traceTruncated: false

Trace controls:

* `none`: no strategy trace.  
* `summary`: selected candidate, top active modules, top guardrails, primary selector, preview status.  
* `verbose`: top K candidates with grouped contributions.  
* `debug`: full selector and module matrices, opt-in only.

Default caps:

* top 3 active modules,  
* top 3 rejected modules,  
* top 5 candidates,  
* top 5 contribution terms per candidate,  
* top 5 selector components,  
* full preview matrix only when already requested by existing verbose trace.

All trace ordering must be deterministic: stable ids, stable move keys, sorted component ids, explicit truncation markers.

# **11. Evolution-loop changes**

The evolution loop should stop treating the policy as a bag of weights. It should mutate **structure first**, then numbers.

Recommended mutation order:

1. Add/remove/split/merge strategic modules.  
2. Add or specialize module activation conditions.  
3. Add target selectors.  
4. Add minimum-impact predicates.  
5. Add guardrails.  
6. Add set-level chooseNStep evaluators.  
7. Add or remove score components.  
8. Tune thresholds.  
9. Tune weights last.

A good evolution candidate should include an explanation:

* what strategic failure was observed,  
* which module/selector/guardrail addresses it,  
* which probes should improve,  
* which tournament metric should improve,  
* expected performance cost,  
* rollback condition.

## **11.1 Acceptance criteria**

Do not accept based on 15-seed average margin alone. Use a composite:

acceptance =

 tournamentMarginScore

+ winRateScore

+ auditProbeScore

- blunderPenalty

- noSignalPenalty

- fallbackPenalty

- complexityPenalty

- performancePenalty

+ explanationCoverageScore

Suggested metrics:

* average victory margin,  
* win rate,  
* median margin, not only mean,  
* worst-decile margin,  
* opponent leader denial rate,  
* self-improvement rate,  
* audit-probe pass rate,  
* guardrail fired count,  
* selected no-impact count,  
* preview no-signal count,  
* trace explanation coverage,  
* profile complexity,  
* runtime overhead,  
* trace-size overhead.

## **11.2 Detect weight soup**

Add profile-quality lint warnings for:

* too many considerations not assigned to modules,  
* many action-tag weights with no selector/impact check,  
* very large absolute weights,  
* duplicate or near-duplicate terms,  
* modules never active,  
* selectors never used,  
* preview refs mostly uniform/low-information,  
* selected decisions often by stable-key/tiebreak/no-signal,  
* score dominated by one scalar,  
* profile LOC/term count exceeding campaign cap,  
* complexity increase without probe/tournament improvement.

The ARVN report’s uniform opponent preview findings are exactly the kind of signal that should become a profile-quality warning: “ready but non-differentiating” is not a compiler error, but it is policy-quality evidence.

## **11.3 Use quality diversity**

Maintain an elite archive across behavior descriptors, not just one best score:

* action-family mix,  
* module activation mix,  
* target selector pass rate,  
* guardrail warning rate,  
* self-gain versus opponent-denial ratio,  
* leader-help rate,  
* preview-readiness/fallback profile,  
* complexity bucket,  
* runtime-cost bucket.

This lets evolution discover qualitatively different strategies instead of converging on “Govern with a slightly different patronage coefficient.”

# **12. Validator and compiler requirements**

Every new authoring primitive must be statically validated where possible.

## **12.1 Hard compiler errors**

Use hard errors for:

* unknown refs,  
* invalid scope refs,  
* hidden-state override attempts,  
* preview refs without explicit fallback,  
* lookup refs without fallback,  
* selector source unknown,  
* selector source not finite,  
* selector product missing `maxPairs`,  
* selector `maxItems` missing or exceeding cap,  
* nondeterministic ordering,  
* missing `onEmpty`,  
* module dependency cycles,  
* guardrail missing `onUnavailable`,  
* hard-prune guardrail missing `onAllPruned`,  
* trace label id invalid/duplicate,  
* cost exceeds cap class,  
* preview evaluator missing cap class,  
* probe binding invalid for declared game/scenario,  
* expression type mismatch,  
* dead reference to absent module/selector/guardrail,  
* use of projected hidden surface without allowed fallback,  
* any embedded script/eval/free-form code.

This matches the existing compiler posture: it already validates preview caps, fallback requirements, scope violations, strategic-condition cycles/types, parameter bounds, selection modes, and hidden lookup behavior.

## **12.2 Profile-quality warnings**

Use warnings for:

* unused modules,  
* modules never active in probe corpus,  
* selectors never selected,  
* guardrails always unknown,  
* hard-prune rule rarely safe,  
* no-signal selected decisions,  
* preview refs ready but uniform,  
* action-tag weights without target selectors,  
* high complexity,  
* suspicious weight scale,  
* low explanation coverage,  
* probes overfitted by exact-action assertions.

## **12.3 Cost class and cap class**

Every module/selector/guardrail/evaluator must compile to one of:

* `state`,  
* `candidate`,  
* `microturn`,  
* `preview`,  
* `auditOnly`.

The compiler should compute worst-case counts:

* candidates × active modules,  
* candidates × selectors,  
* selector source cardinality,  
* product cardinality,  
* preview roots × depth × beam,  
* trace top-K budget.

If a selector or evaluator is preview-dependent, it must consume existing preview runs or explicitly declare a preview cap. No implicit preview expansion.

# **13. Performance model and benchmark gates**

Performance is the main architectural risk. The proposal is only acceptable if every deeper reasoning feature is bounded, cacheable, and usually optional.

## **13.1 Strategy modules**

Runtime cost: roughly `O(C × M_active × T)`, where `C` is candidate count, `M_active` is active modules, and `T` is average terms per module. Activation conditions should be state-scoped and cached once per decision whenever possible.

Constant factor: low if modules lower to grouped consideration ids; higher if module activation reads preview.

Trace impact: moderate; summary should emit only top active modules and grouped totals.

Preview impact: none unless module terms request preview refs.

WASM boundary: compile modules to interned ids and numeric term arrays. Do not marshal rich module objects per candidate.

Benchmark gate: adding module grouping without new preview should stay near current scoring cost; target under 2–5% overhead on representative FITL seeds.

## **13.2 Selectors**

Runtime cost:

* keyed selector over selected option: `O(components)`,  
* selector over entity collection: `O(E × components)`,  
* top-K selector: `O(E log K)` or bounded heap,  
* pair selector: `O(min(product, maxPairs) × components)`.

Constant factor: can be high if selector components use lookups or preview projected state.

Trace impact: selector component trace can explode; cap it.

Preview impact: projected selectors are expensive. They should reuse preview states already produced for candidate scoring.

WASM boundary: use dense numeric arrays and interned ids. Do not send zone/token objects across TS/WASM per selector.

Benchmark gate: default profiles should limit selectors to small K and state/candidate cost unless preview is explicitly justified.

## **13.3 Guardrails**

Runtime cost: `O(C × G)`.

Constant factor: usually low.

Trace impact: small if only fired/top-unknown guardrails are emitted.

Preview impact: guardrails should not cause extra preview drives by default; they should consume existing preview refs.

Benchmark gate: guardrails should reduce cost when they safely prune, not increase preview cost.

## **13.4 Turn-shape evaluators**

Runtime cost: must reuse existing preview/inner-preview. Current chooseNStep inner preview already has an explicit cost formula and compiler cap validation; new turn-shape evaluators should not create an independent planner.

Constant factor: potentially high because preview application/publish loops are expensive.

Trace impact: moderate; emit only objective deltas and status.

Preview impact: high if careless. Require explicit cap class and reuse.

Benchmark gate: any new turn-shape evaluator must prove no more than one preview drive per already-previewed root unless explicitly capped and accepted.

## **13.5 Audit harness**

Runtime cost: not part of normal gameplay, but still matters for evolution iteration.

Use:

* small curated probe sets first,  
* trace retention summary by default,  
* verbose only on failures,  
* replay prefix/state hash to reach decision points cheaply,  
* per-probe max decisions and max wall-clock,  
* shardable deterministic runs.

## **13.6 Trace**

Runtime cost: trace construction can dominate if verbose traces allocate large candidate matrices.

Rules:

* summary trace by default,  
* verbose trace only for audits/failures,  
* interned ids,  
* top-K candidate traces,  
* truncation markers,  
* no full selector matrices unless debug.

## **13.7 Rollback criteria**

Rollback a proposed architectural extension if any of these happen on representative FITL benchmarks:

* 5% wall-clock regression for default tournament profile without clear quality gain,

* 10% heap increase,

* trace bytes more than 2× for summary mode,  
* preview unavailable/no-signal rate increases unexpectedly,  
* WASM scoring hit rate drops significantly,  
* selector/marshalling dominates runtime,  
* probes pass but tournament performance collapses,  
* hidden-info safety requires special cases.

# **14. FITL/ARVN application example**

This section uses FITL/ARVN as a proving example only. The engine should see generic modules, selectors, refs, and tags.

## **14.1 Replace “Govern has weight 1000” with an authored strategic module**

Current ARVN has large action weights and condition terms around Govern/Train/projected margins.

Author a module in game data:

strategyModules:

 build-political-engine:

   when:

     all:

       - { ref: "condition.selfPoliticalEngineBehind.satisfied" }

       - { not: { ref: "condition.militaryBoardCollapsing.satisfied" } }

   applies:

     actionTags: [govern-like-data-tag]

     decisionKinds: [actionSelection, chooseOne, chooseNStep]

   selectors:

     target: politically-valuable-location

   scoreGroups:

     actionShape:

       terms: [preferPoliticalEngineAction]

     targetQuality:

       selector: politically-valuable-location

     standing:

       terms: [improveSelfStanding, avoidLeaderHelp]

   guardrails:

     - no-political-impact

     - military-collapse-overrides-political-engine

The engine does not know “Govern,” “Patronage,” or “ARVN.” The game data defines action tags, conditions, features, and selectors.

## **14.2 Train as board-position module**

strategyModules:

 restore-board-position:

   when:

     any:

       - { ref: "condition.lowPresence.satisfied" }

       - { ref: "condition.controlAtRisk.satisfied" }

   applies:

     actionTags: [build-presence-action-tag]

   selectors:

     target: presence-critical-location

   guardrails:

     - target-has-no-presence-value

     - spends-resource-without-position-gain

This fixes the current failure mode where Train can be treated as just another weighted tag rather than “build presence where presence matters.”

## **14.3 Patrol/Sweep/Assault as objective-specific modules**

Instead of encoding these as raw action weights:

* **secure-lines-or-mobility**: target selector ranks routes/economic/mobility nodes.  
* **reveal-hidden-threats**: selector ranks locations where exposing hidden pieces changes future assault/control value.  
* **remove-control-threat**: selector ranks targets by projected removal, base/piece threat, control swing, and leader denial.

All of these are generic patterns: secure network, reveal hidden threat, remove valuable target.

## **14.4 Transport/Raid as pair selector**

Transport-like choices need origin/destination reasoning:

selectors:

 movement-pair-value:

   source:

     product:

       left: zones

       right: zones

       maxPairs: 64

   quality:

     components:

       - id: origin-loss

         value: { neg: { ref: "feature.originStrategicLoss" } }

         weight: 4

       - id: destination-gain

         value: { ref: "feature.destinationStrategicGain" }

         weight: 8

       - id: projected-standing

         value: { ref: "feature.projectedSelfStandingDelta" }

         weight: 6

This directly addresses “Transport/Raid only when the resulting board position matters.”

## **14.5 Anti-Govern overfit guardrail**

guardrails:

 political-action-while-board-collapsing:

   when:

     all:

       - { ref: "candidate.hasTag.political-engine" }

       - { ref: "condition.militaryBoardCollapsing.satisfied" }

       - { not: { ref: "feature.candidateImmediatelyImprovesStanding" } }

   severity: demote

   traceLabel: "political action while board position is collapsing"

Again, the engine sees tags and conditions only.

## **14.6 Example trace outcome**

A good ARVN trace should be able to say:

* active module: `restore-board-position`,  
* root action selected because it matched a presence-building action tag,  
* target selector chose a high-value location ranked 1 of 6,  
* minimum impact satisfied because projected control/presence improved,  
* leader-help guardrail did not fire,  
* political-engine module was inactive because board-collapse condition dominated,  
* preview self delta ready; leader delta ready; nearest-threat delta unavailable with explicit fallback,  
* selected by strategy, not tiebreak/no-signal.

That is the difference between “score 2847.3” and “competent human-like rationale.”

# **15. Cross-game sanity check**

The proposed primitives are not COIN-only.

**Hidden-information card games**  
 Selectors can rank visible cards, public discard piles, legal hints, hand slots, or belief-safe annotations. Hidden surfaces remain unavailable unless the observer permits them. Preview fallback remains explicit. No omniscient peeking.

**Perfect-information board games**  
 Selectors rank board points, pieces, groups, moves, threats, liberties, connections, or material. Influence fields can model attack/defense/control without game-specific engine code.

**Area-control games**  
 Zone selectors, standing vectors, control-pressure features, and leader-denial guardrails fit naturally. This is the FITL-adjacent case, but the primitives are still generic.

**Economic games**  
 Selectors rank resources, conversion actions, market slots, investments, workers, or contracts. Guardrails handle scarce-resource waste and opportunity cost.

**Worker-placement games**  
 Microturn option selectors rank worker slots by projected resource/objective delta and deny-opponent value.

**Deck/card-driven games**  
 Schedule refs and active-card surfaces must obey visibility and partial fallback rules. The existing DSL already treats schedule/preview fallback as explicit rather than implicit.

**Asymmetric games**  
 Each seat can bind different profiles and modules while using the same engine machinery.

**Tactical combat games**  
 Influence fields, piece-target selectors, origin/destination selectors, and no-friendly-fire guardrails apply without changing the kernel.

The only risky COIN-shaped idea is “leader/threat/opponent denial.” Generalize it as **standing-vector reasoning** over game-authored terminal margins/ranks or declared objective metrics. The non-archived spec-179 remediation already points in this direction with generic standing roles, availability modes, and status-aware aggregates.

# **16. Risks and mitigations**

**Risk: modules become decorative labels over the same flat soup.**  
 Mitigation: require score groups, selector links, guardrail links, and trace coverage. Warn on ungrouped consideration count.

**Risk: selectors add huge runtime cost.**  
 Mitigation: selector caps, keyed selectors, state-scoped caching, no unbounded products, compile-time cost classes, benchmark gates.

**Risk: guardrails over-prune creative play.**  
 Mitigation: default to demote/warn; hard prune only with `safe: true` and `onAllPruned`.

**Risk: probes create overfitting.**  
 Mitigation: property assertions, holdout probes, generated scenario families, exact-action assertions only for regression witnesses.

**Risk: trace size explodes.**  
 Mitigation: summary default, top-K caps, interned ids, verbose only on failures.

**Risk: standing-vector logic becomes COIN-shaped.**  
 Mitigation: define it over generic seats/objective metrics, not factions/control/population.

**Risk: evolution mutates structure into unreadable bloat.**  
 Mitigation: complexity penalties, module/selector count caps, dead-code warnings, required rationale for accepted changes.

**Risk: TS/WASM marshalling erases benefits.**  
 Mitigation: compile to dense IR, keep scoring arrays inside WASM, reconstruct human-readable trace only for selected/top-K candidates.

# **17. Staged implementation roadmap**

## **Stage 1 — Policy lint and trace grouping**

No semantic change yet. Add module-like grouping metadata around existing considerations and emit grouped trace totals. Add profile-quality warnings for dead terms, uniform preview refs, no-signal selection, and ungrouped weight soup.

Value: immediate diagnostics, low performance risk.

## **Stage 2 — Audit probe harness**

Build deterministic probes over current policy behavior. Start with action/microturn/preview/trace assertions. Use summary trace by default and verbose-on-failure.

Value: stops waiting for 15-seed tournaments to discover obvious nonsense.

## **Stage 3 — First-class selectors**

Add bounded selectors over microturn options and candidate params first. Then add zone/token/card/player selectors. Pair selectors come later with strict caps.

Value: target/mode quality becomes inspectable.

## **Stage 4 — Guardrails**

Add demote/warn guardrails first. Hard prune only after the validation/fallback story is solid.

Value: anti-blunder logic stops being buried in positive weights.

## **Stage 5 — Standing-vector aggregates**

Implement or finish the generic standing-vector/standingAgg direction from spec-179: self, current leader, nearest threat, closest ahead/behind, all opponents, ready/unavailable provenance, explicit availability modes.

Value: opponent denial becomes reliable instead of scalar hacks.

## **Stage 6 — Turn-shape evaluators**

Add bounded turn-shape summaries that reuse existing preview/inner preview. Do not add new search.

Value: “this whole move accomplished nothing” becomes detectable.

## **Stage 7 — Optional influence fields**

Add bounded influence/field maps over finite graphs/collections only after selectors prove useful.

Value: better spatial/tactical reasoning without game-specific code.

## **Stage 8 — Evolution-loop overhaul**

Move from weight mutation to structured mutation, probes, quality-diversity archive, complexity penalties, and performance gates.

Value: evolution discovers strategies rather than tuning sludge.

# **18. Open questions**

1. **Where should probes live?**  
    My recommendation: campaign/test data, not core GameSpec rule data. They test a profile; they do not define the game.  
2. **Should modules support priority cascade or only grouped utility sum?**  
    Start with grouped utility sum plus guardrails. Add priority bands only if traces show lower-priority terms routinely override obvious strategic intent.  
3. **Should selectors expose ranks for all candidates or only selected/top-K?**  
    Runtime should compute what it needs; trace should emit selected/top-K only by default.  
4. **How much strategy metadata belongs in FITL game data versus profile data?**  
    Game-wide reusable concepts such as selectors and conditions belong in game agent library. Seat-specific doctrine belongs in profiles.  
5. **Can generated probes be trusted?**  
    Not alone. Treat generated probes as draft assertions. Use holdouts, property checks, and tournament validation.  
6. **Should full MCTS/rollout bots exist offline as research oracles?**  
    Maybe, but not in runtime policy execution. They would be separate tooling, not part of the deterministic game-agnostic kernel.  
7. **What is the minimum viable first win?**  
    Add trace grouping, policy lint warnings, and an audit harness before adding new scoring semantics. That will expose the worst strategy holes quickly and cheaply.

