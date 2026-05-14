## **Verdict**

I would **not ship Spec 170 exactly as written**. It is directionally right, but too narrow.

The right solution is a **generic, observer-safe observable-sequence layer** that `schedule.distance.*` can consume. Spec 170’s `topNVisible` is the first use case, but the abstraction should not be schedule-local, single-slot-only, or limited to `unavailable: behindHiddenPrefix`.

The key change: when the visible prefix does not contain the target card, the resolver should return a **partial lower-bound signal**, not merely “unavailable.” Foundation #20 explicitly requires hidden, partial, unknown, depth-capped, etc. to remain distinct semantic outcomes; unavailable refs must not be silently coerced into numeric contributions. Spec 170 already identifies this as an open “beyond-horizon status alternatives” issue, but defers it; I think deferring it is the mistake.

## **Why the current problem is real**

Spec 169’s resolver treats the deck as binary: public deck means schedule distance is readable; anything else becomes `unavailable: hiddenDeck`. In FITL, the event deck itself is hidden, while drawn / leader / lookahead cards are public, so every ARVN main-phase lookup of `schedule.distance.toBoundary.coupEntry.cards` returns `hiddenDeck`; the `noContribution` fallback then makes the consideration inert. The gap report records zero behavioral change across 15 deterministic seeds: `compositeScore=-3.4`, `wins=4/15`, `avgMargin=-6.0667`, identical to baseline.

The code-level gap is also exactly where you would expect it: `resolveBoundaryCardDistance` checks draw-zone visibility and immediately returns `hiddenDeck` when the draw zone is not public; there is no observer-policy field or partial-visibility branch in the runtime or compiler surface.

Spec 170 fixes that by adding `observerPolicy: { kind: topNVisible, n, visibleSlot }` on `phaseBoundaries[].schedule`, validating that the visible slot is public, scanning it, returning `ready` if a matching card is visible, and returning `unavailable: behindHiddenPrefix` if not. That is a good first patch shape, but it leaves unresolved the two things that matter architecturally: multi-source visible windows and first-class partial evidence.

## **Research takeaways**

General-game systems converge on the same core idea: keep the game rules generic, but expose **observer-relative information** explicitly. OpenSpiel supports imperfect-information games through information states and observations, plus stochasticity, sequential moves, simultaneous moves, and multiple payoff models. GDL-II extended the original Game Description Language beyond deterministic complete-information games to arbitrary finite n-player games with randomness and incomplete state knowledge, while giving players the information needed to reason about their own and others’ knowledge. Ludii’s universality work similarly frames game description languages as a way to describe arbitrary games for agents without per-game implementation, and extends coverage to finite nondeterministic and imperfect-information games.

Recent GGP work also favors “high-level authoring, low-level generic execution.” Regular Games, submitted in November 2025, describes a GGP system whose low-level core is a finite automaton, while higher-level design languages compile down into it; it claims universality for finite turn-based games with imperfect information. That matches your Foundations: GameSpecDoc YAML is the evolutionary artifact, GameDef is the compiled execution artifact, and the engine must remain a universal interpreter rather than accumulating game-specific branches.

The hidden-information AI literature strongly argues against hidden-state leakage. ISMCTS searches over information sets rather than minimax trees of fully specified game states, precisely because hidden information changes the search structure. In Hanabi, Re-determinizing IS-MCTS was created to prevent leakage of hidden information into opponent models, which the paper says is particularly severe in that game. The lesson for your kernel is blunt: do not “help” the policy by peeking at the hidden deck, and do not collapse partial observation into a fake exact scalar.

Practical engines show the same separation, but less safely. Boardgame.io exposes `playerView`, a function that tailors state to a specific player. That is the right concept but the wrong mechanism for LudoForge: your Foundations forbid executable callbacks in specs and require declarative data, generic schemas, deterministic replay, and one rules protocol across clients.

## **Proposed solution: Observable Sequences**

Create a generic compiled concept:

observableSequences:

 - id: fitlEventVisiblePrefix

   source:

     kind: deckDrawOrder

     deckId: fitl-events-initial-card-pack

   observerScope:

     kind: public

   order:

     kind: drawOrder

   visiblePrefix:

     kind: zoneSequence

     maxItems: 2

     zones:

       - zone: leader:none

         role: currentOrNext     # exact role name should be compiler-defined

       - zone: lookahead:none

         role: next              # verify FITL lifecycle before authoring

   exposedFacets:

     - identity

     - tags

   hiddenTail:

     kind: present

Then the boundary uses the observable sequence:

phaseBoundaries:

 - id: coupEntry

   kind: phaseEntry

   phaseId: coupVictory

   schedule:

     kind: cardDraw

     deckId: fitl-events-initial-card-pack

     cardSelector:

       tags: [coup]

     observation:

       kind: observableSequence

       sequenceId: fitlEventVisiblePrefix

For the first implementation, `visiblePrefix.zones` may be capped to one or two zones, but the **schema should already be sequence-shaped**, not `visibleSlot`-shaped. Spec 170 itself admits that multi-slot visible windows are likely and currently deferred. Designing the schema around a single slot guarantees another schema migration as soon as you model a public market row, draft row, staged lookahead, multiple exposed event cards, or asymmetric hand visibility.

## **Resolution semantics**

`schedule.distance.toBoundary.coupEntry.cards` should return one of these, not just `ready` or `unavailable`:

type ScheduleDistanceResolution =

 | {

     status: 'ready';

     kind: 'exactDistance';

     value: number;

     observerScope: ObserverScope;

     observationSource: ObservableSequenceId;

     visiblePrefixLength: number;

   }

 | {

     status: 'partial';

     kind: 'lowerBound';

     lowerBound: number;

     reason: 'visiblePrefixExhausted';

     observerScope: ObserverScope;

     observationSource: ObservableSequenceId;

     visiblePrefixLength: number;

     hiddenTail: 'present' | 'unknown';

   }

 | {

     status: 'hidden';

     reason: 'noObservableScheduleSurface' | 'hiddenDeck';

     observerScope: ObserverScope;

   }

 | {

     status: 'ready';

     kind: 'noTriggeringCardRemaining';

     value: null;

     observerScope: ObserverScope;

   }

 | {

     status: 'unknown' | 'stochastic' | 'unresolved' | 'depthCapped' | 'failed';

     reason: string;

     observerScope: ObserverScope;

     budget?: BudgetTrace;

   };

The important case is this:

{

 "ref": "schedule.distance.toBoundary.coupEntry.cards",

 "status": "partial",

 "kind": "lowerBound",

 "lowerBound": 2,

 "reason": "visiblePrefixExhausted",

 "observerScope": "public",

 "observationSource": "fitlEventVisiblePrefix",

 "visiblePrefixLength": 2,

 "hiddenTail": "present"

}

This means: “No coup card is visible in the public prefix; therefore the exact distance is not known, but it is at least 2 cards away.” That is not the same as `hiddenDeck`. It is strategically meaningful, observer-safe, deterministic evidence.

Spec 170’s `behindHiddenPrefix` status is better than `hiddenDeck`, but treating it as just another unavailable case wastes the signal. Foundation #20 already says partial results are distinct semantic outcomes; use that.

## **Policy fallback contract**

Extend `scheduleFallback` so policies can opt into partial evidence explicitly:

scheduleFallback:

 onHidden:

   kind: noContribution

 onPartial:

   visiblePrefixExhausted:

     kind: useLowerBound

 onUnknown:

   kind: noContribution

 onDepthCapped:

   kind: noContribution

Or, if you want the smaller surface:

scheduleFallback:

 onUnavailable: noContribution

 onPartialLowerBound: useBound

The first version is better. It keeps the trace honest and avoids turning unrelated statuses into one bucket. A hidden deck, a visible prefix that failed to match, a stochastic unresolved schedule, and a depth-capped preview are different facts.

A trace should show both the raw evidence and the fallback:

{

 "inputRefs": {

   "schedule.distance.toBoundary.coupEntry.cards": {

     "status": "partial",

     "kind": "lowerBound",

     "lowerBound": 1,

     "reason": "visiblePrefixExhausted",

     "observerScope": "public",

     "observationSource": "fitlEventVisiblePrefix",

     "fallbackApplied": {

       "kind": "useLowerBound",

       "numericValue": 1

     }

   }

 }

}

That aligns with Foundations #8–#10 on determinism, replay, auditability, and bounded computation, and with #20 on provenance and fallback visibility.

## **Compiler validation**

The compiler should validate everything statically knowable:

observableSequences:

 - id: ...

   source: ...

   visiblePrefix: ...

   exposedFacets: ...

Validation rules:

1. `sequenceId` resolves.  
2. `source.deckId` resolves to a deck-like rule-authoritative source.  
3. Each visible zone resolves to a declared zone.  
4. Each visible zone is visible to the declared `observerScope`.  
5. Each visible zone is container/sequence-shaped and can contain cards.  
6. `maxItems` is a positive integer and within a declared cap class.  
7. `exposedFacets` are actually visible. For example, do not allow `tags` if identity is hidden and tags are not separately public.  
8. Zone order is explicit and deterministic.  
9. Duplicate zones are rejected unless the spec defines an explicit reason.  
10. A schedule boundary may not use an observable sequence whose source deck does not match the boundary deck.

This follows Foundation #12: the compiler handles reference resolution, type checks, boundedness, and spec-derived semantic constraints; the kernel handles state-dependent matching and observability at runtime.

## **Runtime architecture**

Do not implement this as special logic inside `resolveBoundaryCardDistance`. Add a central observer projection service:

resolveObservedSequence({

 def,

 state,

 observerScope,

 sequenceId,

 capClass,

}): ObservedValue<ObservedSequence<CardRef>>

The schedule resolver then becomes a consumer:

const observed = resolveObservedSequence(...);

if (observed.status === 'ready' || observed.status === 'partial') {

 return resolveSelectorDistanceFromObservedPrefix(observed, cardSelector);

}

return mapObservedStatusToScheduleStatus(observed);

That matters because the same observer-safe sequence primitive will be useful for many other surfaces: public markets, face-up discard piles, visible opponent cards, revealed objectives, simultaneous selections after reveal, staged decks, event rows, and UI projections. It also prevents the schedule resolver from becoming the place where every partial-visibility rule accretes.

## **FITL-specific authoring**

Do not guess `leader:none` versus `lookahead:none`. Spec 170 itself says the implementing ticket must verify the exact FITL lookahead-slot identity against `cardLifecycle`; that should remain mandatory.

For FITL, the acceptance test should prove three cases:

1. A coup card is in the public next-up slot → exact `ready` distance.  
2. No coup card is in the public prefix, but hidden tail remains → `partial.lowerBound`.  
3. The boundary is declared without the observable sequence → old hidden-deck behavior still occurs for non-omniscient agents.

The third case is not a compatibility shim; it is a semantic test that hidden decks remain hidden unless the GameSpec declares a lawful observation surface.

## **What to keep from Spec 170**

Keep these parts:

* Declarative observer policy in GameSpecDoc.  
* Public-zone validation.  
* Positive bounded `n` / `maxItems`.  
* No hidden deck peeking.  
* WASM parity.  
* Deterministic trace with observer-policy metadata.  
* FITL data update and cookbook update.  
* Separate campaign-quality rerun from engine determinism tests. Spec 170 correctly says convergence witnessing belongs to the campaign, not the engine invariant suite.

## **What to change from Spec 170**

Change these before implementation:

| Spec 170 shape | Better shape |
| ----- | ----- |
| `observerPolicy.kind: topNVisible` only on schedule | `observableSequences[]` reusable by schedule, policy refs, UI projection, and future observer surfaces |
| `visibleSlot` singular | ordered `visiblePrefix.zones[]` with `maxItems` |
| no-match returns `unavailable: behindHiddenPrefix` | no-match returns `partial: lowerBound` when hidden tail may contain a match |
| one fallback bucket: `onUnavailable` | status-specific fallback: `onHidden`, `onPartial`, `onUnknown`, `onDepthCapped` |
| resolver branch inside `resolveBoundaryCardDistance` | central `resolveObservedSequence` projection consumed by schedule resolver |
| multi-slot reserved for follow-up | multi-source schema now, even if implementation initially caps it |
| “partial minimumDistance” reserved | implement partial lower-bound now |

This is still smaller than the gap report’s long-term Option C visible-prefix index. The runtime can compute the visible prefix directly from canonical state in O(n); no per-run index is needed yet. Spec 170 already notes that a stateless O(n) read is likely enough for FITL.

## **Why not add belief modeling now?**

Do not put probabilistic belief, determinization, or opponent inference inside the kernel for this spec.

The kernel should produce **truth-preserving observation facts**: “these cards are visible,” “the matching card is exactly distance 0,” “no matching card is visible in the first N cards, hidden tail remains.” Belief models can consume those facts later, but they are agent/profile logic, not rule-authoritative schedule resolution. Hidden-information search papers exist because naïvely sampling or determinizing hidden state creates leakage and strategy-fusion problems; that belongs outside the core legality/visibility contract.

## **Test plan**

Minimum tests I would require:

1. **Compiler tests**: unknown sequence, unknown deck, unknown zone, non-public zone for public observer, non-card container, invalid `maxItems`, duplicate zones, invalid facet, mismatched boundary deck, unstable ordering.  
2. **Resolver golden tests**: visible match at index 0, visible match at index 1, no visible match with hidden tail → `partial.lowerBound`, empty visible prefix with hidden tail → `partial.lowerBound: 0`, full public deck with no match → `ready.noTriggeringCardRemaining`, no declared observation surface → `hiddenDeck`.  
3. **Trace tests**: every schedule ref trace includes observer scope, observation source, raw status, bounded scan metadata, and fallback path.  
4. **Leakage tests**: for the same authoritative state, a non-omniscient observer cannot recover hidden deck identity; an explicit omniscient analysis scope can only run when the caller opts into that mode and the trace says so.  
5. **Determinism tests**: compile-twice byte identity, replay identity, canonical serialized state equality, and stable trace output.  
6. **WASM parity**: TypeScript and WASM policy paths produce identical schedule-ref rows.  
7. **Conformance corpus**: one perfect-information board game, one hidden-information card game, one stochastic game, one partial-visible deck game, and one asymmetric/phase-heavy game such as FITL. That is directly in line with Foundation #16’s requirement that game-agnosticism be proven across materially different game families.

## **Implementation phases**

I would write the replacement spec as:

**Phase 0 — Types and schema.** Add `ObservedValue<T>`, `ObservedSequence<T>`, `ObservableSequenceDef`, `ObserverScope`, and schedule-distance status variants, including `partial.lowerBound`.

**Phase 1 — Compiler validation.** Validate observable sequences, visible zones, facets, ordering, caps, and schedule-to-sequence compatibility.

**Phase 2 — Projection resolver.** Implement `resolveObservedSequence` as a pure, deterministic state projection. No schedule logic yet.

**Phase 3 — Schedule resolver integration.** Make `schedule.distance.toBoundary.*.cards` consume observed sequences and emit exact / partial / hidden statuses.

**Phase 4 — Policy fallback and trace.** Add status-specific fallback handling and deterministic trace output.

**Phase 5 — WASM parity.** Port the same observed-sequence and schedule-distance resolution to the policy VM.

**Phase 6 — FITL authoring.** Add the FITL observable sequence and bind `coupEntry` to it after verifying the actual next-up slot.

**Phase 7 — Campaign rerun.** Rerun the ARVN experiment as profile-quality evidence, not as an engine invariant.

## **Final recommendation**

Adopt **Spec 170’s intent**, but rewrite the architecture around **Observable Sequences with partial lower-bound schedule results**.

The kernel must not infer the hidden deck. The policy runtime must not collapse “visible prefix exhausted” into ordinary unavailability. The YAML must declare the observation surface. The compiler must validate it. The trace must expose observer scope, exact versus partial status, boundedness, and fallback. The same projection primitive should serve agents, runner, and future refs through one rules protocol.

That is the smallest solution that fixes FITL now without creating another partial-visibility spec three weeks later.

