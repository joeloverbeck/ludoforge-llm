## **Proposal: ship Spec 171 as a Visible Sequence Projection fix**

My recommendation is **Option C+, not Option D**.

Implement a generic observer-policy projection that composes an ordered, bounded **visible sequence** from explicitly capped public sources:

observerPolicy:

 kind: topNVisible

 visiblePrefix:

   sources:

     - id: played:none

       take: 1        # current card only; older public cards are history

       order: topFirst

       role: current

     - id: lookahead:none

       take: 1        # revealed next card

       order: topFirst

       role: next

   maxItems: 2

This is essentially Option C, but I would make the abstraction explicit as **sources**, not just “zones with optional max.” The current name `visiblePrefix.zones` is the root of the ambiguity: it implies “scan these zones as containers,” while the policy authors actually need “compose the visible future schedule from named public sources.” The fix should preserve `played:none` as the accumulated FITL played pile, but tell the schedule resolver that only the **top** of that pile participates in the forward schedule horizon.

The uploaded report’s diagnosis is sound: Spec 170’s `topNVisible` is configured as `[played:none, lookahead:none]` with `maxItems: 2`, but because FITL’s `discardZone` is also `played:none`, old played cards accumulate underneath the active card; the resolver scans all cards in `played:none` until the aggregate budget is exhausted and never reaches `lookahead:none`. The trace evidence is stark: 15 seeds, 426 ARVN action selections, 138 Govern candidates using the schedule ref, and **138/138 returned `partial.lowerBound = 2`**, with zero ready readings for coup-in-lookahead. The code-level failure mode is also clear: the resolver iterates every `slotCards` entry, so once `played:none` contains active card plus at least one older card, `maxItems: 2` is spent before `lookahead:none` is consulted.

This should be treated as an observer-projection design bug, not as an ARVN profile issue.

## **Why this is the right architectural level**

The relevant research and comparable engines all point in the same direction: **authoritative state and player/agent observations are different artifacts**.

OpenSpiel represents games as procedural extensive-form games and explicitly supports both fully observable games via observations and imperfect-information games via information states and observations; its API separately exposes legal actions, information-state strings/tensors, and chance nodes. GDL-II made a similar move for general game playing: it added `random` for chance and `sees` for what each player perceives, so the rules determine player percepts rather than exposing full state. TAG, a tabletop-games AI framework, likewise emphasizes a common game/agent API plus logging for hidden information and other game-AI metrics. Ludii is another broad game system that supports card games, hidden information, stochastic elements, and many player counts through a general rules-description system.

The AI literature reinforces the same point. Information Set MCTS is built around searching information sets rather than exact hidden states because hidden-information games are structurally different from perfect-information games. If a policy feature says “distance to next visible Coup” but the observer projection silently skips the visible next card, the agent is not merely getting a weak heuristic; it is getting a corrupted observation model.

That maps directly onto your Foundations. The engine must remain game-agnostic and all rule-authoritative behavior must stay in GameSpecDoc YAML, while the kernel owns one authoritative state and clients consume visibility-filtered projections. The compiler should validate spec-known issues, the implementation should avoid compatibility shims, and root-cause design gaps should be fixed comprehensively and proven by tests. Preview signal integrity also requires observer scope, resolution status, budget outcome, and fallback path to remain explicit rather than silently converting unavailable signal into a scalar.

## **Reject the tactical fixes**

### **Do not split FITL’s discard pile**

Option A is tempting because it avoids engine work, but it is wrong for FITL. The official rules say that the top card is placed onto a played cards pile, the next card is revealed, players see one card ahead, and all played cards plus draw-deck count are open to inspection. Rule 2.3.7 moves the draw deck’s top card onto the played card pile and reveals the next card. Pivotal Events also stay in the played card pile as normal, and Monsoon restrictions are explicitly tied to a Coup showing as the next card.

So `played:none` as an accumulated public history is not a modeling mistake. Splitting it into `played:none` and `discardPile:none` would make “played pile” a synthetic union and would break a clean observer view of the physical game state. The report already flags this: splitting active card from history weakens rules fidelity and would cause external observers to see only one card where the rules expose the full played pile.

### **Do not reverse `[played, lookahead]`**

Option B is a clever hack, but the semantics rot immediately. It makes distance `0` mean “Coup is next” instead of “Coup is current,” contradicting the intended schedule-distance semantics and failing to generalize to other multi-zone schedules. It also leaves the resolver behavior counterintuitive: an accumulating public history zone can still starve later sources.

### **Do not make “top of every zone” the universal meaning**

Option D is philosophically attractive because in FITL the forward schedule horizon really is “top of played, top of lookahead.” But as a universal semantic, it is too blunt. Some future game may have a public tableau, discard display, splay, queue, market row, or visible deck prefix where more than one card in the same zone legitimately belongs to the visible future/action horizon. The report itself notes this downside: top-only would force a game with a public top-three zone to model those cards as three separate zones.

Option D also makes the future `omniscient` observer policy harder to explain because “topNVisible” would no longer mean “the top N visible items”; it would mean “at most one per stack zone.” That is a surprising default.

## **Recommended design: explicit visible sequence sources**

### **Schema**

Use a breaking schema improvement, consistent with Foundation #14’s no-shim posture. Migrate owned artifacts in the same change; do not keep old `visiblePrefix.zones` as a fallback.

observerPolicy:

 kind: topNVisible

 visiblePrefix:

   sources:

     - id: played:none

       take: 1

       order: topFirst

       role: current

     - id: lookahead:none

       take: 1

       order: topFirst

       role: next

   maxItems: 2

Field semantics:

`id` is a `ZoneId`.

`take` is a positive integer cap for that source. It is not optional for multi-source schedule observers.

`order` defaults from the zone’s ordering only when the compiler can prove a deterministic default. I would still write it explicitly in FITL because schedule semantics are important enough to deserve visible author intent.

`role` is optional diagnostic metadata, not rule logic. It should appear in trace output and docs, but not affect legality or transitions.

`maxItems` is the aggregate cap across the composed sequence. For FITL, it should equal `sum(take) = 2`.

The uploaded report’s Option C already sketches the core implementation: cap each zone independently, validate the caps, extend the core observer-prefix type, update schema artifacts, and document the behavior. My change is mostly naming and strictness: call them `sources`, require `take`, and treat this as a new observer-projection contract rather than an optional patch over the old one.

### **Runtime semantics**

The resolver should build a deterministic composed sequence:

1. For each source in declaration order, read only the observer-visible cards from that zone.  
2. Apply deterministic ordering, normally `topFirst`.  
3. Append at most `take` cards from that source.  
4. Stop once `maxItems` is reached.  
5. Match the boundary selector against this composed sequence.

For FITL, with:

played:none    = [activeEvent, olderEvent, olderOlderEvent, ...]

lookahead:none = [nextCard]

deck:none      = [hiddenTail...]

the schedule horizon becomes:

visible schedule sequence = [activeEvent, nextCard]

So if the lookahead card is a Coup, `schedule.distance.toBoundary.coupEntry.cards` returns `ready: 1`. If no Coup appears in those two positions, it returns `partial.lowerBound: 2` because the hidden deck tail remains beyond the observed sequence. Older public cards in `played:none` are **not hidden** and are **not scanned**; they are public history intentionally excluded from the forward schedule horizon.

That distinction matters. The current failure collapses three different concepts into one scan: current card, public history, and future schedule. The fix separates them.

## **Trace and preview integrity requirements**

Every schedule-resolver result should emit enough deterministic trace metadata to explain exactly what happened:

{

 "observerPolicy": "topNVisible",

 "observerScope": "public:seat:arvn",

 "boundaryId": "coupEntry",

 "maxItems": 2,

 "sources": [

   {

     "zoneId": "played:none",

     "role": "current",

     "order": "topFirst",

     "availablePublic": 5,

     "taken": 1,

     "skippedPublic": 4,

     "skipReason": "excludedBySourceTake"

   },

   {

     "zoneId": "lookahead:none",

     "role": "next",

     "order": "topFirst",

     "availablePublic": 1,

     "taken": 1,

     "skippedPublic": 0

   }

 ],

 "result": {

   "kind": "ready",

   "distance": 1,

   "matchedSource": "lookahead:none"

 }

}

For no Coup in the visible sequence:

{

 "result": {

   "kind": "partial",

   "partialKind": "lowerBound",

   "lowerBound": 2,

   "reason": "hiddenTailAfterVisibleSequence"

 }

}

Do not describe older `played:none` cards as hidden. They are public-but-excluded-by-policy. That status distinction is exactly what Foundation #20 demands: ready, hidden, partial, depth-capped, fallback, and unavailable cases must not be silently conflated.

I would also add a runtime advisory for any schedule observer whose declared later source is unreachable because an earlier source consumes the aggregate budget:

OBSERVER_VISIBLE_SEQUENCE_SOURCE_UNREACHED

This should never fire for the fixed FITL config, but it would catch future specs that accidentally recreate the same trap.

## **Compiler validation**

The compiler should fail, not warn, on ambiguous multi-source schedule observers.

Recommended compile-time rules:

1. `visiblePrefix.sources` is required for `kind: topNVisible`; old `visiblePrefix.zones` is invalid after migration.  
2. Every source must have a valid public `ZoneId`.  
3. `take` must be a positive integer.  
4. `maxItems` must be a positive integer and `maxItems <= sum(source.take)`.  
5. If `maxItems < sum(source.take)`, trace metadata should show which source was aggregate-capped.  
6. If a source is a stack-ordered zone, `order` must either be explicit or compiler-inferred from a generic zone-ordering declaration.  
7. No game-specific schema. No “FITL played pile” special case.

This aligns with the compiler/kernel boundary: the compiler validates field shape, references, boundedness, public-zone access, and static semantics; the runtime validates state-dependent contents and actual observer coverage.

## **FITL migration**

Migrate FITL’s `coupEntry` boundary to:

phaseBoundaries:

 - id: coupEntry

   kind: phaseEntry

   phaseId: coupVictory

   schedule:

     kind: cardDraw

     deckId: fitl-events-initial-card-pack

     cardSelector:

       tags: [coup]

     observerPolicy:

       kind: topNVisible

       visiblePrefix:

         sources:

           - id: played:none

             take: 1

             order: topFirst

             role: current

           - id: lookahead:none

             take: 1

             order: topFirst

             role: next

         maxItems: 2

Keep:

eventDecks:

 - id: fitl-events-initial-card-pack

   drawZone: deck:none

   discardZone: played:none

That preserves the physical and rules-faithful FITL model: `played:none` remains the accumulated public played pile, while the observer schedule policy extracts only the current card from it.

## **Interaction with future `omniscient`**

The future `omniscient` policy should be a separate observer scope, not a reinterpretation of `topNVisible`.

Normal policy agents should use public observer scopes. An omniscient analysis mode may inspect hidden deck order, but its output must carry `observerScope: omniscient` and should never be indistinguishable from public policy evidence. Foundation #4 explicitly says non-omniscient runners and agents must not inspect full state except in explicit omniscient modes.

I would define the relationship like this:

observerPolicy:

 kind: omniscient

 horizon:

   deckId: fitl-events-initial-card-pack

   maxItems: 128

`topNVisible` answers: “What can this observer see in the declared visible schedule sequence?”

`omniscient` answers: “What is actually in the authoritative hidden schedule, for analysis/debug/evaluation?”

Those are different provenance classes. They can both return a distance, but they must not share the same trace shape without an explicit `observerScope`.

## **Testing plan**

The report’s suggested verification is directionally right, but I would make the main regression deterministic rather than probabilistic. The report recommends rerunning the 15-seed trace recipe and expecting at least one ready result, plus adding a production-flow regression test because the old integration test used an artificial one-card `played:none` state instead of a production accumulated pile. Keep that tournament replay as a quality witness, but do not make “at least one of 15 seeds” the primary correctness proof.

Add these tests:

1. **Resolver unit test: accumulated public history does not starve later source.**  
    State:

    played:none    = [nonCoupA, nonCoupB, nonCoupC]  
   lookahead:none = [coup]

    Policy:

    sources:  
     - { id: played:none, take: 1, order: topFirst }  
     - { id: lookahead:none, take: 1, order: topFirst }  
   maxItems: 2

    Expected: `ready: 1`.

2. **FITL production-flow lifecycle test.**  
    Construct or seed a deck so that after real card-boundary advancement, `played:none` contains at least two non-Coup cards and `lookahead:none` contains a Coup. Do not use `withVisibleCards` to overwrite `played:none`. Run the real lifecycle and assert the schedule ref returns `ready: 1`.  
3. **Negative legacy-shape compiler test.**  
    A multi-source `topNVisible` using old `visiblePrefix.zones` should fail compilation with a clear error: “Use `visiblePrefix.sources[]` with explicit `take`.”  
4. **Trace golden test.**  
    Assert that schedule resolution trace includes observer scope, maxItems, per-source `availablePublic`, `taken`, `skippedPublic`, and result status.  
5. **No hidden-info leakage test.**  
    With no Coup in `[played top, lookahead]` but a Coup deeper in `deck:none`, public observer returns `partial.lowerBound: 2`; omniscient observer, only in explicit omniscient mode, can return the deeper exact distance.  
6. **Determinism/replay test.**  
    Same GameDef, initial state, seed, and actions produce identical canonical state and trace metadata. This follows the Foundations requirement that determinism and replayability be proven, not assumed.

## **Final recommendation**

Ship **Spec 171: Visible Sequence Projection for Schedule Observer Policies**.

The essence:

Authoritative zones remain physically faithful.

Observer policies compose bounded visible sequences from explicit sources.

Every source has an explicit per-source take cap.

Trace output proves what was observed, skipped, capped, or hidden.

Compiler rejects ambiguous multi-source visible-prefix configs.

This fixes FITL without lying about its played pile, keeps the engine game-agnostic, preserves the single authoritative state model, and generalizes cleanly to other games. It also gives profile authors and future evolution runs the thing they were missing: a trustworthy, auditable observation signal rather than a silent partial-coverage failure.

