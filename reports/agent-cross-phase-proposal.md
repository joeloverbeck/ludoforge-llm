## **Proposal: Phase-Horizon Latent Value first, Scoped Horizon Preview second**

My recommendation is blunt: **do not build naïve cross-phase preview now.** It is the cleanest conceptual answer, but the wrong first implementation under the current 13-minute harness budget. Instead, ship a generic **Phase-Horizon Latent Value layer**: a stronger version of Options B + C, upgraded from state-only heuristics into **candidate-relative, phase-aware, declarative latent-effect features**. Then add a strictly scoped, opt-in **Horizon Preview Probe** only for phase-critical candidates once the cheap layer plateaus.

That gives you the best trade-off: it attacks the real architectural gap, stays Foundation-aligned, preserves fast evolution loops, and creates a clear migration path toward true cross-phase projection without turning the engine into Fire-in-the-Lake-specific code.

The campaign evidence is decisive. Exp-010 removed `preferGovernWeighted=1000` and regressed ARVN from `compositeScore=-3.5333` to `-8.9333`; exp-009’s projected `coinControlPop` signal stayed silent for main-phase candidates because the relevant control flip occurs beyond the current deep1024 action-effect preview horizon. The report correctly diagnoses this as a **cross-phase projection gap**, not a candidate-param gap and not a simple weight-tuning problem.

The Foundations force the architecture. The engine cannot hardcode FITL, Coup, COIN, ARVN, Patronage, or “cards until coup”; specs must remain declarative data; computation must be bounded and reproducible; all clients must share the same kernel protocol; and preview output must expose provenance, status, budget outcome, and fallback instead of silently becoming a number.

---

## **Research synthesis**

The outside literature supports a hybrid, not an all-or-nothing choice.

Monte Carlo Tree Search and UCT are the obvious theoretical family for “look farther through future actions.” Kocsis and Szepesvári frame Monte Carlo planning as one of the few viable methods for large state-space decision problems, while the major MCTS survey emphasizes the combination of tree search precision with random sampling generality.

But MCTS-style projection comes with the exact cost problem your report identifies. In complex games, the rollout/default policy, horizon, opponent modeling, and budget dominate whether the search is useful. Information Set MCTS addresses hidden information by searching over information sets, but that adds another layer of complexity and makes observer-scope correctness non-negotiable.

Comparable game AI frameworks treat horizon and cost as first-class configuration. The Tabletop Games framework, for example, exposes rollout length units such as tick, turn, and round; termination options such as end-turn/end-round/end-action/start-action; opponent tree policies; opponent models; heuristic leaf/action evaluation; and budgets based on forward-model calls. That is a strong precedent for a **bounded horizon probe**, but also a warning: cross-phase rollout should be explicitly budgeted by forward-model calls, not hidden inside a normal scalar feature.

The literature also supports heuristic priors as a principled middle tier. Progressive bias and related MCTS variants deliberately inject heuristic knowledge into search to guide expensive exploration rather than replacing it with brute force. In other words, a declarative latent-value heuristic is not a hack when it is visible, bounded, testable, and evolved as data.

The COIN-specific bot ecosystem points the same way. GMT’s official Fire in the Lake Tru’ng Bot Pack uses a card/table system where each bot card examines current game state and selects operations, special activities, and spaces in a responsive but manageable way. InsideGMT’s COIN bot design notes emphasize that COIN bots require multi-turn priorities and nested/sequential instructions because factions interact across several levels; for Fire in the Lake, the published bot work involved significant analysis of events, map adjacency, and action priorities.

General game systems reinforce the need to stay generic. Ludii’s ludeme model shows that compact, human-understandable game descriptions can support many games while preserving generality and efficiency. OpenSpiel supports many game forms and research algorithms, but its games are procedural extensive-form implementations, which is useful as an AI benchmark precedent but not a direct match for LudoForge’s “specs are data” requirement.

The conclusion: **projection is valuable, but full cross-phase rollout is too expensive to be the first move.** The right architecture is a layered one: cheap declarative latent value first, scoped rollout later.

---

## **The core design change**

Replace the opaque `preferGovernWeighted=1000` prior with a named, inspectable, phase-aware value system.

Not this:

preferGovernWeighted:

 scopes: [move]

 weight: 1000

 value:

   boolToNumber:

     ref: candidate.tag.govern

But this:

considerations:

 preferImmediateVictoryLedgerGain:

   scopes: [move]

   weight: 300

   value:

     ref: candidate.feature.immediateVictoryMarginDelta

 preferLatentControlGainNearCoupBoundary:

   scopes: [move]

   weight: 450

   when:

     lte:

       - { ref: schedule.distance.toBoundary.coupEntry.cards }

       - 2

   value:

     clamp:

       value: { ref: candidate.feature.latentControlPopulationDelta.coin }

       min: 0

       max: 4

 preferGovernWhenCycleHasTimeToCompound:

   scopes: [move]

   weight: 300

   when:

     gte:

       - { ref: schedule.distance.toBoundary.coupEntry.cards }

       - 3

   value:

     boolToNumber:

       ref: candidate.tag.govern

 preferTrainWhenCandidateCanFlipPopulation:

   scopes: [move]

   weight: 500

   value:

     clamp:

       value: { ref: candidate.feature.localControlFlipPotentialPopulation.coin }

       min: 0

       max: 4

The literal IDs above are FITL profile data, not engine semantics. The engine only knows about typed boundaries, schedules, spaces, pieces, sides, candidate tags, and declarative expressions.

---

## **Layer 1: Generic phase and schedule refs**

Option C should be implemented, but not as `turn.cardsUntilNextPhase.coup`. That name leaks a FITL-specific trigger model. Use a generic **schedule boundary** abstraction instead.

### **Proposed GameSpecDoc shape**

phaseBoundaries:

 - id: coupEntry

   kind: phaseEntry

   phaseId: coup

   schedule:

     kind: deckMarker

     deckId: eventDeck

     markerTag: coup

 - id: roundEnd

   kind: roundEnd

   schedule:

     kind: turnOrderCycleEnd

 - id: eligibilityReset

   kind: condition

   condition:

     ref: turn.eligibilityWindow.resets

The engine does not know what `coup` means. It only validates that `phaseId: coup`, `deckId: eventDeck`, and `markerTag: coup` are declared in the GameSpecDoc.

### **Proposed ref surface**

phase.current.id

phase.next.id

schedule.nextBoundary.id

schedule.distance.toBoundary.<BoundaryId>.microturns

schedule.distance.toBoundary.<BoundaryId>.playerDecisions

schedule.distance.toBoundary.<BoundaryId>.actions

schedule.distance.toBoundary.<BoundaryId>.turns

schedule.distance.toBoundary.<BoundaryId>.rounds

schedule.distance.toBoundary.<BoundaryId>.cards

schedule.distance.toPhase.<PhaseId>.microturns

schedule.distance.toPhase.<PhaseId>.actions

Availability must be typed. For example, `.cards` is only ready when the boundary is declared over a countable deck schedule. If a boundary is condition-based and the compiler cannot derive card distance, the ref status is `unavailable`, not `0`.

This directly aligns with Foundation #20. Preview-like or uncertain schedule refs must expose status; state-local deterministic refs can be ready; unsupported distance units must fail compilation or return a typed unavailable status with explicit fallback, depending on whether the unsupported unit is statically knowable.

### **Why `schedule.*`, not `turn.*`**

Use `schedule.*` for countdowns and `phase.*` for phase identity. `turn.*` should remain about the current turn/microturn/actor state. A Coup phase triggered by deck position is not intrinsically a “turn” fact; it is a schedule fact. This avoids future confusion for games where phase transitions are card-driven, round-driven, condition-driven, or actor-driven.

---

## **Layer 2: Candidate-relative latent value features**

Option B in the report is directionally right, but too weak if implemented as state-only features. The failure mode is candidate discrimination: the agent must know not merely that “some zones are close to flipping,” but whether **this candidate** is likely to affect those zones.

So implement a generic **candidate local effect summary** surface.

### **Proposed candidate summary refs**

These are not full previews. They are compiler/runtime summaries of the candidate’s immediate declared effects and bound params.

candidate.effect.addPieces.<SideId>.count

candidate.effect.addPieces.<SideId>.spaces

candidate.effect.removePieces.<SideId>.count

candidate.effect.removePieces.<SideId>.spaces

candidate.effect.movePieces.<SideId>.fromSpaces

candidate.effect.movePieces.<SideId>.toSpaces

candidate.effect.varDelta.<VarId>

candidate.effect.supportShift.spaces

candidate.effect.controlRelevantSpaces

candidate.effect.tags

The compiler can expose these only when they are statically derivable from the published candidate plus candidate params. If an effect is conditional, stochastic, hidden, or not locally summarizable, the summary ref status is not ready.

This is not cross-phase simulation. It is local effect introspection, analogous in spirit to candidate-param refs and projected-state lookup refs, but it avoids the major cost and architectural risk of full horizon rollout.

### **Generic latent-control operators**

Add generic control-margin operators. Do not add `coinPiecesNeededToFlip`. Add side-typed, rule-declared control calculations.

space.control.side

space.control.margin.<SideId>

space.control.requiredDeltaToFlip.<SideId>

space.control.wouldFlipIf:

 sideId: <SideId>

 addPieces:

   fromCandidateEffect: true

 removePieces:

   fromCandidateEffect: true

The control rule itself remains data-authored in GameSpecDoc. The engine provides a generic “evaluate control under hypothetical local delta” operator over the declared control expression.

Example candidate feature:

candidateFeatures:

 localControlFlipPotentialPopulationCoin:

   type: number

   expr:

     aggregateSpaces:

       source:

         ref: candidate.effect.controlRelevantSpaces

       where:

         all:

           - gt:

               - { ref: space.prop.population }

               - 0

           - control.wouldFlipIf:

               sideId: coin

               localDelta:

                 ref: candidate.effect.localPieceDelta

       value:

         ref: space.prop.population

       op: sum

For FITL, `coin` is a side ID declared in the game data. For another game, the side could be `red`, `corporation`, `allies`, or anything else.

### **High-signal FITL features to encode as YAML**

For ARVN specifically, I would start with these features:

| Feature | Why it matters |
| ----- | ----- |
| `candidate.feature.immediateVictoryMarginDelta` | Keeps Govern and direct Patronage/event gains visible. |
| `candidate.feature.localControlFlipPotentialPopulation.coin` | Measures whether Train/Patrol/Sweep/Event candidate can plausibly convert population to COIN control. |
| `feature.fragileCoinControlPopulation` | Detects population already COIN-controlled but easy to lose. |
| `feature.fragileEnemyControlPopulation` | Detects zones close to becoming COIN-controlled. |
| `candidate.feature.pacificationReadyPopulation` | Captures zones where future Coup/pacification consolidation is likely valuable. |
| `feature.patronagePressure` | Measures distance from ARVN victory threshold and whether Patronage is already high enough. |
| `schedule.distance.toBoundary.coupEntry.cards` | Separates early-cycle compounding from late-cycle consolidation. |
| `candidate.feature.eventControlLatencyRisk` | Penalizes event branches that look good immediately but do not survive to boundary. |

The important design move is that these are **named latent-value features**, not magic weights. When they misfire, traces show exactly which feature caused the decision.

---

## **Layer 3: Scoped Horizon Preview Probe**

Option A should exist, but later and narrowly. The report’s cost estimate is damning: naïve cross-phase preview may require roughly 10,000–50,000 budget units per candidate and could push the 15-seed harness from about 13 minutes to 4–12 hours.

Still, the architecture should prepare for it because it is the real end-state for some games. The scoped version should be an opt-in **horizon probe**, not an extension of every existing `preview.feature.*` ref.

### **Proposed YAML shape**

preview:

 outer:

   horizonProbes:

     coupBoundaryProbe:

       enabled: true

       rootFilter:

         candidateTagsAny:

           - phaseCritical

           - train

           - patrol

           - sweep

           - affectsControl

       target:

         kind: boundary

         boundaryId: coupEntry

         stop: onBoundaryEntry

       capClass: horizonForwardModel512

       budget:

         forwardModelCalls: 512

         maxPlayerDecisions: 8

         maxMicroturns: 128

         maxChanceDecisions: 16

       projectionPolicies:

         default:

           kind: profileRef

           profileId: fitlProjectionBaseline

           profileHash: sha256:...

         byPlayer:

           nva:

             kind: profileRef

             profileId: nvaBaseline

             profileHash: sha256:...

           vc:

             kind: profileRef

             profileId: vcBaseline

             profileHash: sha256:...

### **Proposed ref surface**

preview.horizon.coupBoundaryProbe.status

preview.horizon.coupBoundaryProbe.budget.forwardModelCallsUsed

preview.horizon.coupBoundaryProbe.boundaryReached

preview.horizon.coupBoundaryProbe.feature.<StateFeatureId>

preview.horizon.coupBoundaryProbe.victory.<VictoryMetricId>

preview.horizon.coupBoundaryProbe.delta.feature.<StateFeatureId>

preview.horizon.coupBoundaryProbe.delta.victory.<VictoryMetricId>

Do **not** overload current `preview.feature.*` to sometimes mean action-effect preview and sometimes mean cross-phase rollout. The report shows the current preview stops at the action effect tree; changing that meaning would destroy trace readability and make old profile-quality witnesses ambiguous.

### **Budget unit**

Use **forward-model calls** as the primary budget. This mirrors the Tabletop Games framework and is more honest than depth because one “depth” step can vary wildly across games.

A horizon probe consumes budget whenever it calls the kernel to enumerate legal actions, apply an action, auto-resolve a kernel/chance microturn, or advance to the next decision point.

### **Opponent policies**

Projection policies should live in the **agent profile or experiment artifact**, not in GameSpecDoc. They do not define rules, legality, scoring, terminal conditions, or state transitions; they define advisory search behavior. That keeps Foundation #2 clean: GameSpecDoc remains the unit of rule evolution, while agent profiles remain the unit of policy evolution.

Policy refs must carry exact identity:

projectionPolicies:

 byPlayer:

   nva:

     profileId: nva-baseline

     profileHash: sha256:...

     compilerVersion: ...

     policyVmVersion: ...

This is required for reproducibility. Foundation #13 says artifacts and experiment results must carry enough identity to reproduce them exactly.

### **Hidden information**

The probe must run from the same observer view available to the agent unless an explicit omniscient-analysis mode is declared. Foundation #4 prohibits agents from inspecting full state except in explicit omniscient analysis modes.

For hidden/stochastic futures, the horizon ref status should distinguish `hidden`, `stochastic`, `partial`, `budgetExhausted`, and `boundaryNotReached`. It must never silently coerce to zero.

---

## **What to do with `preferGovernWeighted`**

Do not delete it yet. Rename and decompose it.

Current behavior proves the prior is load-bearing; deleting it is known-bad. But keeping it as an opaque `+1000` forever is also bad architecture. The goal should be to **make the prior explainable**, then gradually reduce the opaque term.

Recommended transition:

considerations:

 preferGovernImmediatePatronage:

   scopes: [move]

   weight: 300

   value:

     ref: candidate.feature.immediatePatronageDelta

 preferGovernEarlyCycle:

   scopes: [move]

   weight: 250

   when:

     gte:

       - { ref: schedule.distance.toBoundary.coupEntry.cards }

       - 3

   value:

     boolToNumber:

       ref: candidate.tag.govern

 preferGovernWhenControlLatentValueLow:

   scopes: [move]

   weight: 250

   when:

     lte:

       - { ref: feature.availableLatentCoinControlPopulation }

       - 1

   value:

     boolToNumber:

       ref: candidate.tag.govern

 preferGovernResidualPrior:

   scopes: [move]

   weight: 400

   value:

     boolToNumber:

       ref: candidate.tag.govern

Then run staged ablations:

| Stage | Residual prior | Goal |
| ----- | ----- | ----- |
| Baseline | 1000 | Current known-good behavior. |
| Decomposed | 400 | New named features absorb most of the signal. |
| Aggressive | 200 | Test whether latent features are actually predictive. |
| Zero | 0 | Only after horizon probe or stronger features prove stable. |

The success criterion is not “remove the prior immediately.” The success criterion is: **when the residual prior shrinks, the choices that replace it are explainable and improve or preserve paired-seed performance.**

---

## **Why not bytecode-only cross-phase traversal**

Reject the “bytecode-only mid-tier” idea.

A policy bytecode expression that traverses opponent turns would need to call apply-effect, enumerate legal moves, advance turn order, resolve chance/kernel microturns, and evaluate legality. That either duplicates kernel semantics inside the policy VM or turns policy bytecode into a second rules engine. Both are architectural poison.

Foundation #5 says simulator, web runner, and AI agents must use the same action, legality, and event protocol. Foundation #7 says specs are declarative data, not executable code or callbacks. A bytecode expression that “simulates turns” is no longer a feature expression; it is a disguised simulator.

The acceptable version is: the **kernel** exposes a bounded forward-model service; horizon preview calls that service; the policy VM evaluates the resulting refs. Bytecode can score states. It should not own state transition semantics.

---

## **WASM strategy**

For B + C, the existing policy VM path is enough. New refs need opcode slots, Rust handlers, and TypeScript fallback/debug resolvers, as the report already notes.

For A, WASMifying only policy expression evaluation will not solve the cost problem. The expensive part is the forward model: enumerate legal actions, apply actions, auto-resolve microturns, run projection policies, and advance to the horizon boundary. The report is right that Option A needs new kernel/simulator infrastructure, not merely more bytecode.

The correct WASM sequence:

1. **Keep B + C in policy bytecode.** These are O(zones), O(candidates), or O(1) schedule refs.  
2. **Add TypeScript horizon probe only for profiling.** Use it on a tiny root filter and record forward-model call counts.  
3. **WASMify kernel forward-model primitives.** Target `enumerateLegalActions`, `applyAction`, `advanceUntilDecision`, and deterministic auto-resolution.  
4. **Move horizon probe driver into Rust/WASM.** Keep the same ABI semantics and trace output.  
5. **Cache aggressively.** Key by `(gameDefHash, stateHash, candidateActionHash, horizonSpecHash, projectionPolicyHash, capClass)`.

This preserves Foundation #10: cap classes are statically named and recorded in reproducibility metadata.

---

## **Compiler and runtime requirements**

### **Compiler validation**

The compiler should reject:

schedule.distance.toBoundary.unknownBoundary.cards

Unknown boundary.

schedule.distance.toBoundary.roundEnd.cards

Invalid unit if `roundEnd` is not card-scheduled.

preview.horizon.coupBoundaryProbe.feature.coinControlPop

If `coupBoundaryProbe` is not declared.

preview.horizon.coupBoundaryProbe.delta.feature.coinControlPop

If the profile does not declare a fallback for non-ready horizon statuses and the value is used in a numeric consideration.

This follows Foundation #12: the compiler validates what is knowable from the spec alone; the kernel handles runtime budget exhaustion, hidden info, and state-dependent legality.

### **Runtime trace output**

Every candidate scored with these features should expose trace rows like:

{

 "candidateId": "train:saigon",

 "consideration": "preferTrainWhenCandidateCanFlipPopulation",

 "inputRefs": {

   "candidate.feature.localControlFlipPotentialPopulation.coin": {

     "status": "ready",

     "value": 3,

     "provenance": "candidateLocalEffectSummary"

   }

 },

 "weight": 500,

 "contribution": 1500

}

For horizon preview:

{

 "candidateId": "train:saigon",

 "horizonProbe": "coupBoundaryProbe",

 "status": "budgetExhausted",

 "boundaryReached": false,

 "budget": {

   "capClass": "horizonForwardModel512",

   "forwardModelCallsUsed": 512,

   "maxForwardModelCalls": 512

 },

 "fallback": {

   "kind": "explicitValue",

   "value": 0

 }

}

No status, no contribution.

---

## **Testing plan**

### **Engine-level tests**

These are blocking.

| Test | Purpose |
| ----- | ----- |
| Compile same GameSpec twice | Byte-identical GameDef; schedule refs do not introduce nondeterminism. |
| Unknown boundary compile failure | Compiler rejects bad `BoundaryId`. |
| Unsupported distance unit compile failure | Compiler rejects `.cards` for non-card boundaries when statically knowable. |
| Schedule distance golden tests | Known deck/round/phase setups return exact deterministic distances. |
| Candidate local effect summary golden tests | Train/Event/Move/Remove candidates expose correct local summaries. |
| Local hypothetical control tests | `control.wouldFlipIf` matches declared control rule, not game-specific code. |
| Hidden-info observer tests | Horizon probe cannot see hidden decks/hands unless omniscient mode is explicit. |
| Budget exhaustion tests | Horizon probe returns `budgetExhausted`; numeric conversion requires declared fallback. |
| Replay determinism tests | Same GameDef + seed + actions + profile hashes produce identical trace and state. |
| Conformance corpus | At least one perfect-info board game, hidden-info card game, stochastic game, and asymmetric phase-heavy game. |

This is required by Foundation #16, which treats architectural properties as test obligations, not assumptions.

### **Profile-quality tests**

These should be non-blocking quality witnesses, as Foundations distinguish engine determinism from policy convergence claims.

Run paired-seed experiments:

1. Current best profile.  
2. B + C latent feature profile with residual Govern prior unchanged.  
3. B + C with residual Govern prior reduced.  
4. B + C with residual Govern prior removed.  
5. B + C + scoped horizon probe.  
6. B + C + scoped horizon probe with residual Govern prior removed.

Track:

compositeScore

avgMargin

wins

governPickRate

trainPickRate

eventPickRate

badEventPickRate

latentControlFeatureNonZeroRate

horizonProbeReadyRate

horizonProbeBudgetExhaustionRate

tiebreakAfterPreviewNoSignalRate

governPriorDependencyScore

The key diagnostic is **governPriorDependencyScore**:

score(profileWithPrior) - score(profileWithoutPrior)

Today that value is approximately `+5.4` composite points. The architecture is working when that dependency shrinks because named latent features and/or horizon refs explain the value previously hidden inside `preferGovernWeighted`.

---

## **Experiment design**

Use paired seeds, not independent seed sets. The relevant question is not “does the new profile win more in general?” but “for the same game trajectories and stochastic branches, does this policy make better decisions?”

Recommended sequence:

| Phase | Seeds | Purpose |
| ----- | ----- | ----- |
| Smoke | 15 | Match current harness; catch regressions quickly. |
| Confirmation | 45 or 60 | Detect medium effects without blowing iteration time. |
| Promotion | 100+ | Only for candidate baseline promotion. |

Acceptance gates:

B+C smoke:

 compositeScore >= currentBest - 0.1

 runtime <= 14 minutes

 latentControlFeatureNonZeroRate > 0 on main-phase Train/Patrol/Sweep/Event candidates

 no increase in POLICY_PREVIEW_SIGNAL_UNAVAILABLE

B+C confirmation:

 compositeScore improves by >= 0.15 OR governPriorDependencyScore shrinks by >= 25%

 no known bad event-pick regression

Scoped horizon smoke:

 runtime <= 26 minutes

 horizonProbeReadyRate >= 70% for phase-critical candidates

 budgetExhaustionRate <= 20%

 with residual Govern prior reduced, score does not regress materially

Scoped horizon promotion:

 removing residual Govern prior does not reproduce the exp-010-style collapse

The report’s own suggested clean test for Option A is correct: implement cross-phase projection, ablate `preferGovernWeighted`, and see whether the metric avoids the known exp-010 regression. But that should be a **later validation of the horizon probe**, not the first implementation step.

---

## **Foundation alignment**

| Foundation | Required design choice |
| ----- | ----- |
| #1 Engine Agnosticism | Engine exposes `BoundaryId`, `PhaseId`, `SideId`, `SpaceId`, local effect summaries, and control evaluators. It never mentions Coup, ARVN, COIN, Patronage, or Fire in the Lake. |
| #2 Evolution-first | Rule-authoritative phase schedules, control rules, sides, and state features live in GameSpecDoc YAML. Agent policy weights and projection policy refs live in profile/experiment artifacts. |
| #5 One protocol | Horizon probe advances using the same kernel legal-action/apply-action protocol as simulator and web runner. No duplicated legality path. |
| #7 Specs are data | No callbacks, scripts, or embedded evaluator code. New power comes from generic DSL constructs and engine/compiler extensions. |
| #8 Determinism | Schedule refs, local summaries, and horizon probes are deterministic under GameDef + seed + action sequence + profile hashes. |
| #10 Bounded computation | B + C are O(spaces/candidates); horizon probe uses named cap classes and forward-model-call budgets. |
| #12 Validation boundary | Compiler rejects unknown IDs and unsupported static ref shapes; runtime reports budget/hidden/stochastic statuses. |
| #13 Reproducibility | Horizon traces include GameSpec hash, GameDef hash, profile hashes, projection policy hashes, cap class, seed set. |
| #16 Testing as proof | Add golden, determinism, budget, hidden-info, and conformance tests before promotion. |
| #17 Typed identifiers | `PhaseId`, `BoundaryId`, `SideId`, `SpaceId`, `ProfileId`, and `CapClassId` should be branded types. |
| #20 Preview integrity | Horizon refs are status-bearing. Numeric fallback must be explicit and trace-visible. |

---

## **Implementation roadmap**

### **Spec 167 — Phase Boundary and Schedule Refs**

Ship first.

Deliverables:

phaseBoundaries: [...]

phase.current.id

phase.next.id

schedule.nextBoundary.id

schedule.distance.toBoundary.<BoundaryId>.<Unit>

schedule.distance.toPhase.<PhaseId>.<Unit>

Runtime cost: negligible.

Risk: low-to-medium, mostly around designing the schedule abstraction cleanly.

### **Spec 168 — Candidate Local Effect Summary and Latent Control Features**

Ship second.

Deliverables:

candidate.effect.*

candidate.feature.*

space.control.margin.<SideId>

space.control.requiredDeltaToFlip.<SideId>

space.control.wouldFlipIf

Runtime cost: O(candidates × affected spaces × piece types), still cheap for FITL-scale maps.

Risk: medium. The hardest part is summarizing candidate effects without accidentally executing a second rules engine. Keep it strictly local and status-bearing.

### **Spec 169 — FitL ARVN Profile Refactor**

Convert opaque static priors into named features.

Deliverables:

preferGovernImmediatePatronage

preferGovernEarlyCycle

preferTrainWhenCandidateCanFlipPopulation

preferLatentControlGainNearCoupBoundary

preferResidualGovernPrior

Runtime cost: tiny.

Risk: low. The risk is behavioral, not architectural; paired-seed profile-quality tests catch it.

### **Spec 170 — Scoped Horizon Preview Probe**

Build after B + C plateau.

Deliverables:

preview.outer.horizonProbes.*

preview.horizon.<ProbeId>.*

horizonForwardModel<Cap>

projectionPolicies.profileRef

Runtime cost: controlled but substantial.

Risk: high. This touches kernel advancement, profile-policy simulation, hidden info, trace provenance, and budget semantics.

### **Spec 171 — WASM Forward Model Acceleration**

Only after TypeScript horizon probe proves value.

Deliverables:

WASM enumerateLegalActions

WASM applyAction

WASM advanceUntilDecision

WASM horizon probe driver

forward-model-call cache

Runtime cost: reduced horizon overhead.

Risk: high engineering cost, high payoff.

---

## **Rejected alternatives**

### **Rejected: hardcode FITL Coup projection**

This would solve the immediate report and violate the product. The app is meant to encode any card/board game; Foundation #1 forbids game-specific kernel logic.

### **Rejected: leave `preferGovernWeighted=1000` as the long-term answer**

It works, but it is opaque. It does not explain when Govern is valuable, does not transfer to other factions or games, and does not help evolution discover better action timing. Keep it temporarily; decompose it.

### **Rejected: full cross-phase preview for every candidate**

The current cost estimate is unacceptable: the report expects naïve Option A to blow the 15-seed harness from about 13 minutes to hours. That destroys evolution cadence.

### **Rejected: bytecode simulates future turns**

That creates a second simulator inside policy evaluation. The forward model belongs to the kernel, not policy bytecode.

### **Rejected: silently treating capped horizon refs as zero**

That directly violates Preview Signal Integrity. Unavailable preview evidence must be unavailable, not numerically convenient.

---

## **Final answer**

The best solution is **not** “implement Option A” and not “accept static boosts.” The best solution is:

1. **Immediately implement generic phase/schedule refs.**  
2. **Immediately implement candidate-relative latent-value features.**  
3. **Refactor `preferGovernWeighted` into named, traceable, phase-aware value terms while preserving a smaller residual prior.**  
4. **Validate with paired-seed experiments and explicit prior-dependency metrics.**  
5. **Only then implement scoped cross-phase horizon preview for phase-critical candidates.**  
6. **Only after that, WASMify the forward model if the horizon probe proves worth its cost.**

That path aligns with the Foundations, matches the research, respects the harness budget, and addresses the real bug: the agent currently compares immediate ledger gains against delayed control gains with a preview system that cannot see the delayed consolidation point. The fix is to make delayed value visible first through cheap declarative latent features, then through bounded horizon projection where the value justifies the cost.

