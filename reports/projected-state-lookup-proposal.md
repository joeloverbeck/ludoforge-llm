# **Proposal: Projected-State Lookup Refs**

## **Verdict**

Implement this as **an extension of the existing `lookup` ref with a new surface: `previewOptionState`**.

Do **not** add a `preview.option.lookup.*` enum variant, and do **not** create a new top-level `previewLookup` family. The clean design is:

type CompiledAgentPolicyRef =

 | {

     readonly kind: 'lookup';

     readonly surface: 'policyState' | 'previewOptionState';

     readonly collection: 'zones' | 'tokens' | 'players' | 'globals';

     readonly keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string';

     readonly key: CompiledPolicyExpr;

     readonly path: readonly string[];

     readonly onMissing: 'unavailable' | { readonly kind: 'constant'; readonly value: PolicyScalar };

     readonly onHidden: 'unavailable';

   }

 | ...;

The semantics should be: **evaluate the key in the current candidate context, drive the candidate through the existing bounded preview pipeline, require a ready completion endpoint, then run the existing generic lookup resolver against the candidate’s projected endpoint state under the same observer projection and visibility rules**.

This directly fills the missing matrix cell identified in the uploaded report: current-state keyed lookup exists, projected-state scalar preview exists, but projected-state keyed lookup does not.

One important correction: the report’s foundation table appears stale. In the uploaded `FOUNDATIONS.md`, #14 is **No Backwards Compatibility**, not “Default-preserving,” and #19 is **Decision-Granularity Uniformity**, not signal integrity. The proposal still satisfies the spirit of “opt-in, no behavior change unless referenced,” but the spec should not cite that as Foundation #14. The actual Foundation #14 argues against compatibility aliases and shims; it does not argue against adding an opt-in surface.

---

## **Research synthesis**

The closest research analogue is **afterstate evaluation**. Sutton and Barto describe afterstates as board positions after the agent’s move has been applied, and argue they are useful in games because the immediate effect of our own move is often known even when the opponent’s reply is not. They also note that multiple state-action pairs can collapse to the same afterstate, which lets the evaluator reason over projected states rather than hand-authoring every state-action pair. That is almost exactly what `previewOptionState` is: a bounded, engine-owned afterstate surface exposed to a policy expression.

General game frameworks also support this pattern operationally, even if not as a declarative YAML ref. OpenSpiel exposes legal actions, observations, information states, serialization, and state child generation; its docs explicitly describe `state.Child(action)` as creating a new state and applying the action, while also distinguishing observation and information-state APIs for the acting player. OpenSpiel’s paper frames the system as a general framework for reinforcement learning, search, and planning across perfect/imperfect-information, simultaneous/sequential, zero-sum/general-sum games.

Ludii is the closest tabletop-specific comparator. Its “ludemic” system emphasizes generality, extensibility, understandability, and efficiency, and its AI API passes a copied `Context` containing the current game state into `selectAction`, with explicit time/iteration/depth limits. Ludii’s work on spatial state-action features is especially relevant: it studies generic patterns that incentivize or disincentivize actions based on state variables near action variables, with a focus on generality and efficient evaluation across many games. `previewOptionState` is the LudoForge analogue, except the “feature” is author-declared YAML lookup over a bounded projected endpoint rather than a learned spatial pattern.

MCTS research supports the broader lesson but should **not** be imported wholesale here. The MCTS survey describes MCTS as combining tree search precision with random sampling generality across games. That points toward full game-tree preview, but the uploaded report is not asking for that. The right implementation here is a bounded afterstate feature read, not cross-action search, opponent modeling, belief sampling, or rollout policy design.

Hidden information is the main trap. GDL-II was created because classic GDL was limited to deterministic games with complete information, and it added randomness and incomplete state knowledge so players could reason about what they know during play. ISMCTS likewise searches trees of information sets rather than raw game states specifically to avoid hidden-information leakage. Therefore, `previewOptionState` must not simply “drive full authoritative state, then project at the end” if that lets the agent choose an action based on information it would only learn after choosing that action.

---

## **Core design**

### **1. Ref family**

Use the existing `lookup` ref kind:

preferProjectedTroopBuildup:

 scopes: [microturn]

 costClass: preview

 weight: 100

 value:

   lookup:

     surface: previewOptionState

     collection: zones

     keyType: ZoneId

     key:

       ref: microturn.option.value

     path: [variables, arvnTroopCount]

     onMissing: unavailable

 previewFallback:

   onUnavailable: noContribution

This is structurally the same lookup as Spec 163. The only difference is the state source:

surface: 'policyState'          // current observer-projected state

surface: 'previewOptionState'   // candidate’s bounded projected endpoint state

That gives maximum reuse while keeping the enum-style `preview.option.*` family clean. The existing `preview.option.*` refs remain scalar afterstate summaries; the new surface is keyed afterstate lookup.

### **2. State source rule**

`previewOptionState` resolves only against a **ready synthetic completion endpoint**.

That means:

if (drive.outcome !== 'ready') {

 return unavailableFromPreviewOutcome(drive.outcome);

}

Do **not** read `DriveResult.state` from a depth-cap exit as if it were a valid endpoint. The driver may return a state when capped, but the lookup must treat that as `unknownDepthCap`, not as a partially useful projected state. This single rule solves most path-stability ambiguity.

### **3. Key evaluation rule**

Evaluate the lookup key in the **root candidate context**, not in the projected state.

For the common chooseNStep ADD case:

key:

 ref: microturn.option.value

For action-selection candidates, use whatever candidate-bound param ref already exists. If the engine lacks a clean generic candidate-param intrinsic, add one separately, but do not bake action-selection special cases into projected lookup.

Recommended compile-time restriction for v1:

lookup.surface = previewOptionState

 => lookup.key must be preview-free

 => lookup.key must be candidate/current-context stable

 => lookup.key must not depend on another previewOptionState lookup

This avoids cyclic preview dependencies and keeps cost accounting simple.

### **4. Resolver reuse**

Refactor the current lookup implementation so the resolver is parameterized over a state source:

interface LookupStateSource {

 readonly surface: 'policyState' | 'previewOptionState';

 readonly state: GameState;

 readonly observer: CompiledObserverContext;

 readonly visibility: CompiledZoneVisibilityCatalog;

 readonly provenance: LookupStateProvenance;

}

function resolveLookupAgainstState(

 ref: CompiledLookupRef,

 source: LookupStateSource,

 evalContext: PolicyEvalContext,

): LookupResolution

Then routing becomes straightforward:

function resolveLookup(ref: CompiledLookupRef, context: PolicyEvalContext): LookupResolution {

 if (ref.surface === 'policyState') {

   return resolveLookupAgainstState(ref, {

     surface: 'policyState',

     state: context.state,

     observer: context.observer,

     visibility: context.visibility,

     provenance: { kind: 'currentState' },

   }, context);

 }

 if (ref.surface === 'previewOptionState') {

   const preview = context.previewOption;

   if (!preview) {

     return previewUnavailable('unknownGated');

   }

   if (preview.drive.outcome !== 'ready') {

     return previewUnavailable(preview.drive.outcome);

   }

   return resolveLookupAgainstState(ref, {

     surface: 'previewOptionState',

     state: preview.drive.state,

     observer: context.observer,

     visibility: context.visibility,

     provenance: {

       kind: 'previewOptionState',

       depth: preview.drive.depth,

       capClass: preview.capClass,

       completionPolicy: preview.drive.completionPolicy,

     },

   }, context);

 }

 return unreachable(ref.surface);

}

### **5. Observer and anti-clairvoyance rule**

This is the non-negotiable safety invariant:

A non-omniscient `previewOptionState` lookup may expose only values knowable from the acting observer’s current information plus deterministic public consequences of the candidate action. It may not expose hidden values merely because the candidate would reveal them after being chosen.

Endpoint projection alone is insufficient. Example: if a candidate says “peek at card A,” and the projected endpoint reveals card A, the agent must not be allowed to choose card A because the hidden identity is favorable. That is strategy-fusion / clairvoyance.

The implementation should therefore carry one of these two guarantees:

type PreviewObserverPurity =

 | { kind: 'observerPure' }                 // no hidden/unknown full-state reads influenced exposed values

 | { kind: 'hiddenRead'; count: number }

 | { kind: 'chanceSampled'; count: number }

 | { kind: 'omniscientAnalysisMode' };

For normal agents:

if (preview.observerPurity.kind !== 'observerPure') {

 return previewUnavailable('hiddenOrStochasticProjection');

}

If the current preview pipeline already drives from an observer-projected state rather than full authoritative state, this may already be satisfied. The spec should still state and test it explicitly. Foundation #4 and #20 demand this.

---

## **Fallback contract**

Use **`previewFallback`**, not `lookupFallback`, and do not introduce `previewLookupFallback`.

Principle:

Fallback family is determined by the state source, not by the syntactic ref shape.

Therefore:

| Ref | State source | Required consideration fallback |
| ----- | ----- | ----- |
| `lookup.surface: policyState` | current state | `lookupFallback` |
| `lookup.surface: previewOptionState` | bounded candidate preview | `previewFallback` |
| `preview.option.*` | bounded candidate preview | `previewFallback` |

If a single consideration mixes current-state lookup and projected-state lookup, require both fallback declarations:

preferProjectedDelta:

 scopes: [microturn]

 costClass: preview

 weight: 50

 value:

   subtract:

     - lookup:

         surface: previewOptionState

         collection: zones

         keyType: ZoneId

         key: { ref: microturn.option.value }

         path: [variables, arvnTroopCount]

         onMissing: unavailable

     - lookup:

         surface: policyState

         collection: zones

         keyType: ZoneId

         key: { ref: microturn.option.value }

         path: [variables, arvnTroopCount]

         onMissing: unavailable

 previewFallback:

   onUnavailable: noContribution

 lookupFallback:

   onUnavailable: noContribution

This keeps the rule deterministic and avoids teaching authors a third fallback namespace.

`onMissing` may remain inside the lookup ref because it is an explicit ref-local policy. But any non-ready preview outcome—depth cap, gated, hidden, stochastic, failed, unresolved—must flow through `previewFallback` and must be trace-visible.

---

## **Path stability semantics**

Define the projected endpoint narrowly:

`previewOptionState` is the observer-safe state after the candidate option has been committed and the pending action has synthetically completed under the configured bounded preview strategy.

That implies:

1. **Ready completion only.** Depth-capped states are not lookup surfaces.  
2. **No arbitrary checkpoints.** No “broad state,” “deep state,” “mid-confirm state,” or “state after N microturns” surface in this spec.  
3. **Path missing is not partial success.** If the endpoint is ready but the key/path is absent, apply `onMissing`.  
4. **Hidden is never overrideable.** `onHidden` remains only `'unavailable'`.  
5. **Compiler validates only generic structure.** It can validate collection, key type, nonempty path, and legal root path segments such as `properties` / `variables`. It should not try to prove game-defined path existence unless the GameSpec already declares typed schemas for those variables.

Authoring guidance should say: initialize zone/token/player variables to stable defaults if you want projected lookups to be reliable. A path that sometimes does not exist is legal, but it is a fallback-heavy signal.

---

## **Cost class and bounded computation**

`costClass` must be **`preview`**.

A projected lookup does not create a new search algorithm; it consumes the same per-candidate preview drive that scalar preview refs already use. The additional work is bounded by:

candidateCount × projectedLookupRefCount × pathLength

The compile-time cost model should therefore account for:

preview drive cost

+ projected lookup path-walk cost

+ expression evaluation cost

but it should not introduce a new cap class. `deep1024` or any future cap class remains the preview-drive cap, recorded in compiled artifacts and trace metadata as Foundation #10 requires.

---

## **Continued-deepening integration**

`allRequestedRefsDepthCapped` should include projected lookups because they are preview-derived refs.

`allReadyValuesUniform` should also include them, but only for comparable numeric projected values or for final numeric consideration contributions. Strong recommendation: define the trigger over **usable scoring signal**, not raw ref identity.

Recommended rule:

A preview-derived consideration has usable signal at a frontier if its ready contribution differs across at least two candidate options.

Then:

allReadyValuesUniform

 => all preview-derived considerations were ready

 => all produced equal numeric contributions across candidates

This avoids weirdness with string/boolean projected lookups. If a lookup returns a nonnumeric scalar that is later mapped to a numeric value by the expression system, the post-expression numeric contribution is what matters.

If deepening fires and values remain uniform, trace it honestly and fall through to the deterministic tiebreaker. The FITL Govern result in the uploaded report is the correct behavior: no ref should manufacture differentiation where the game rule has none.

---

## **Trace requirements**

Every projected lookup resolution should record:

interface ProjectedLookupTrace {

 readonly refId: string;

 readonly surface: 'previewOptionState';

 readonly collection: 'zones' | 'tokens' | 'players' | 'globals';

 readonly keyType: string;

 readonly keyValue?: string;

 readonly path: readonly string[];

 readonly observerScope: string;

 readonly driveOutcome: PolicyPreviewTraceOutcome;

 readonly driveDepth: number;

 readonly capClass: string;

 readonly completionPolicy: string;

 readonly lookupOutcome:

   | 'ready'

   | 'missing'

   | 'hidden'

   | 'typeMismatch'

   | 'keyUnavailable'

   | 'depthCap'

   | 'gated'

   | 'stochastic'

   | 'failed'

   | 'unresolved';

 readonly fallbackApplied?: {

   readonly contract: 'previewFallback';

   readonly mode: 'noContribution' | 'constant';

 };

}

Keep the existing `readyRefStats` shape, but include `surface` in the ref identity so trace readers can distinguish:

lookup.policyState.zones.properties.population

lookup.previewOptionState.zones.variables.arvnTroopCount

If every requested projected lookup at a frontier is non-ready or fallback-only, selection should be marked `tiebreakAfterPreviewNoSignal` and emit the existing preview-unavailable advisory.

---

## **Foundation audit**

| Foundation | Audit |
| ----- | ----- |
| #1 Engine Agnosticism | Pass. The engine does not know what `population`, `coinControlled`, or `arvnTroopCount` means. It only walks author-supplied paths over generic projected zone/token/player/global shapes. |
| #4 Authoritative State and Observer Views | Pass only with the anti-clairvoyance guard. Raw full-state simulation followed by endpoint projection is not enough for hidden-information games. |
| #6 Schema Ownership Stays Generic | Pass. No per-game schema files, no FITL-specific ref kinds, no game-specific type contracts. |
| #10 Bounded Computation | Pass. Preview drive remains capped by named cap class; lookup is finite path-walk work. |
| #14 No Backwards Compatibility | Pass if implemented without aliases or compatibility wrappers. Migrate owned artifacts if schema names change. Do not preserve old names for convenience. |
| #17 Strongly Typed Domain Identifiers | Pass if `keyType` continues to enforce branded `ZoneId`, `TokenId`, `PlayerId`, and `string` domains. |
| #19 Decision-Granularity Uniformity | Pass if the key is bound to the currently scored atomic decision option and the feature does not introduce compound action templates. |
| #20 Preview Signal Integrity | Pass if all non-ready projected lookups remain distinct statuses, require `previewFallback`, and are trace-visible. |

The only serious risk is #4/#20 leakage through hidden information. Treat that as a release-blocking invariant, not a cookbook note.

---

## **Cookbook decision tree**

Use **current-state lookup** when the signal is already visible and does not depend on resolving the candidate:

lookup:

 surface: policyState

 collection: zones

 keyType: ZoneId

 key: { ref: microturn.option.value }

 path: [properties, population]

Use **projected-state lookup** when the candidate itself changes the per-object property you care about:

lookup:

 surface: previewOptionState

 collection: zones

 keyType: ZoneId

 key: { ref: microturn.option.value }

 path: [variables, arvnTroopCount]

Use **scalar `preview.option.*`** when the thing you care about is an aggregate projected outcome:

ref: preview.option.delta.victory.currentMargin.self

Use **composition**, not a new delta ref family, when you want projected-minus-current:

subtract:

 - lookup:

     surface: previewOptionState

     collection: zones

     keyType: ZoneId

     key: { ref: microturn.option.value }

     path: [variables, arvnTroopCount]

     onMissing: unavailable

 - lookup:

     surface: policyState

     collection: zones

     keyType: ZoneId

     key: { ref: microturn.option.value }

     path: [variables, arvnTroopCount]

     onMissing: unavailable

Do not add `preview.option.delta.lookup.*`. That would explode the ref surface and duplicate generic arithmetic.

---

## **Out-of-scope calls**

Keep these out of Spec N:

| Item | Decision |
| ----- | ----- |
| Cross-action / multi-round preview | Out of scope. That is game-tree search, opponent modeling, belief handling, and rollout policy design. |
| FITL-specific projected refs | Reject. Violates engine agnosticism. |
| Arbitrary checkpoint lookup | Defer. It adds authoring axes and path-stability problems. |
| Aggregated projected lookup | Defer. Useful later, but it is a separate aggregation primitive. |
| Belief sampling / ISMCTS | Defer. Important for hidden-information strength, but not necessary for this afterstate lookup surface. |

---

## **Implementation plan**

1. **Types and contract**  
   * Extend lookup surface enum: `'policyState' | 'previewOptionState'`.  
   * Do not touch `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS`.  
   * Add a helper like `isPreviewDerivedRef(ref)` that returns true for `previewOptionRef` and `lookup.surface === 'previewOptionState'`.  
2. **Compiler**  
   * Parse `lookup.surface: previewOptionState`.  
   * Require `costClass: preview`.  
   * Require `previewFallback.onUnavailable`.  
   * Reject `lookupFallback`-only projected lookup considerations.  
   * Reject preview-derived refs inside the projected lookup key expression.  
   * Validate key type and generic path root.  
3. **Runtime resolver**  
   * Refactor current lookup into `resolveLookupAgainstState`.  
   * Route `policyState` to current state.  
   * Route `previewOptionState` to ready `DriveResult.state`.  
   * Map non-ready drive outcomes into preview unavailability statuses.  
4. **Preview runtime**  
   * Ensure projected lookup refs request candidate preview drives.  
   * Reuse existing broad/deep drive cache.  
   * Do not perform one drive per lookup; perform one drive per candidate and read many refs from it.  
5. **Observer purity**  
   * Add or expose preview trace metadata proving observer-safe simulation.  
   * If hidden reads or chance samples affect the projected state in non-omniscient mode, return unavailable rather than ready.  
6. **Trace**  
   * Add surface-qualified projected lookup entries.  
   * Include fallback contract and reason.  
   * Include ready stats and uniformity stats.  
7. **Docs**  
   * Add cookbook section for current lookup vs projected lookup vs scalar preview.  
   * Include a warning that projected lookup cannot make genuinely uniform game rules differentiable.

---

## **Strawman spec outline**

**Spec NNN — Projected-State Lookup Refs**

1. Motivation and empirical witness  
    Explain the missing projected keyed lookup surface and summarize the FITL seed-1000 uniform-scalar witness.  
2. Definitions  
    Define current state, candidate context, synthetic completion endpoint, projected option state, ready endpoint, unavailable endpoint.  
3. YAML syntax  
    Introduce `lookup.surface: previewOptionState`.  
4. Compiled representation  
    Extend `CompiledAgentPolicyRef.kind === 'lookup'`.  
5. Availability semantics  
    Ready drive only; depth-cap and gated outcomes unavailable.  
6. Observer-safety semantics  
    Add the anti-clairvoyance invariant.  
7. Lookup semantics  
    Key evaluation, collection resolution, path walking, missing/hidden/type mismatch behavior.  
8. Fallback semantics  
    `previewFallback` required; `lookupFallback` remains current-state only.  
9. Cost model  
    `costClass: preview`; cap-class accounting; per-path bounded cost.  
10. Continued deepening  
     Depth-capped trigger and ready-uniform trigger across projected lookup refs.  
11. Trace schema  
     Surface-qualified ref IDs, lookup outcomes, fallback records, ready stats.  
12. Cookbook guidance  
     Current lookup vs projected lookup vs scalar preview vs composed delta.  
13. Non-goals  
     Multi-round search, per-game refs, arbitrary checkpoints, aggregates.  
14. Test plan  
     Architectural invariants, golden traces, convergence witnesses.

---

## **Test distribution**

### **Architectural-invariant tests**

These should block CI.

* `previewOptionState` cannot be referenced without `costClass: preview`.  
* `previewOptionState` cannot be referenced without `previewFallback.onUnavailable`.  
* `lookupFallback` alone is rejected for projected lookup.  
* Preview-derived refs are rejected inside projected lookup key expressions.  
* Depth-capped `DriveResult.state` is never treated as ready lookup state.  
* Hidden projected values are unavailable, not coerced.  
* `onHidden` has no constant override.  
* No game-specific IDs appear in resolver/compiler code.  
* Branded ID validation is preserved for `ZoneId`, `TokenId`, and `PlayerId`.  
* Cap class is recorded in trace/repro metadata whenever projected lookup requests preview.

### **Golden-trace tests**

These should assert exact trace shape.

* Ready projected zone variable differs across options and appears in `readyRefStats`.  
* Ready projected values are uniform and selection falls through to tiebreak with no fake signal.  
* Broad pass depth-caps all projected lookups; deep pass resolves them.  
* Broad pass ready-uniform projected lookups trigger deepening if configured.  
* Projected path missing fires explicit fallback.  
* Hidden projected field returns unavailable with `previewFallback`.  
* Projected lookup at a non-preview frontier is gated and trace-visible.

### **Convergence-witness tests**

These should live in profile-quality / witness space, not determinism proof space.

* A tiny synthetic game where choosing target A/B changes a projected zone variable after an inner microturn; the projected lookup agent chooses the better target.  
* A fixture where current-state lookup is uniform but projected-state lookup differentiates.  
* A fixture where projected scalar margin is uniform but projected per-zone lookup differentiates.  
* A FITL-style witness for Train/Pacify if stable enough, but not as a blocking engine invariant.

---

## **Bottom line**

`previewOptionState` should be implemented as **a new state surface on the existing lookup ref**, with **preview cost**, **preview fallback**, **ready-endpoint-only semantics**, **observer-safe projection**, and **full trace provenance**.

That gives policy authors the missing generic afterstate feature surface without turning LudoForge into a game-specific evaluator, without weakening preview signal integrity, and without opening the door to unbounded game-tree search.

