## **Proposal: Spec 162 — Preview Signal Integrity and Bounded Inner Deepening**

My recommendation: **treat this as a follow-up architectural gap, not an acceptable tradeoff and not merely a documentation issue**.

The kernel is not broken. The legal-action protocol is doing the right thing: it publishes atomic, directly executable microturn decisions, which aligns with Foundations #5, #18, and #19. The failure is in the **agent policy preview contract**: a profile can opt into a documented preview signal, the runtime can run the driver, and yet the scoring surface can collapse to “no usable signal” while the policy still appears to make a scored decision. In the reported ARVN seed, 4 of 12 `chooseNStep` decisions have `unknownDepthCap = legalCount`, empty `readyRefStats`, and fallback to lexical `stableMoveKey`; increasing to `maxOptions = 6, depthCap = 6` did not unblock those decisions.

That is not a legality problem. It is a **preview honesty problem**.

The current cap is justified by Foundation #10: all choices and iteration must be finite, enumerable, and bounded. But Foundation #10 does **not** justify silently turning an unavailable preview ref into a policy tiebreaker. Foundation #15 says architecture changes must address root causes, and Foundation #16 says those properties must be proven by tests.

So: **keep bounded computation; fix preview signal integrity.**

---

## **What the research says**

General-game systems converge on the same broad architecture LudoForge is aiming for: a declarative game description, finite legal moves, state transitions through a generic interpreter, and agents operating over the published legal-action surface. GDL/GDL-II explicitly targets finite players, finite states, finite legal moves, and declarative rule descriptions for general game playing. OpenSpiel exposes generic `State`, `legal_actions`, `apply_action`, `child`, observer/information-state surfaces, chance nodes, simultaneous nodes, and terminal states. Ludii similarly exposes generic legal-move generation, state copying, and move application over game descriptions.

The game-AI literature does **not** support “just search deeper until it works” as an architecture. UCT/MCTS treats lookahead as budgeted sampling/search; OpenSpiel’s MCTS API separates the game state from an evaluator/prior and even bounds rollout depth with `max_length`; AlphaZero-style search replaces random rollouts with policy/value evaluators. Progressive widening was introduced precisely because large branching factors require controlled expansion rather than exhaustive search at every frontier. Quiescence-search work also shows the classic fixed-depth horizon problem: stopping at an arbitrary depth can produce misleading static evaluations unless the system distinguishes “quiet/evaluable” states from unstable horizon states.

The design lesson is direct: **bounded preview is fine, but unavailable or horizon-capped evidence must remain visible as unavailable evidence.** It must not masquerade as a numeric zero, a ready ref, or a normal scored policy decision.

---

## **Diagnosis**

Spec 161 fixed the earlier wiring bug: `preview.inner.chooseNStep: true` is no longer a silent no-op, and the per-root-option driver now runs. The current issue is subtler: for deeply nested `chooseN` ladders, the preview drive reaches `depthCap` before it gets to a state where `preview.option.delta.victory.currentMargin.self` can be resolved. The report’s own summary captures the failure: the preview works at many frontiers, but for deeply nested target-selection microturns it returns `outcome: depthCap`, produces no resolved refs, and the cookbook-recommended `preferOptionProjectedMargin` term contributes no useful differentiation.

The cookbook currently frames `chooseNStep` per-option preview as analogous to `chooseOne`, but it does not warn that every per-option drive can abandon at depth cap and that the policy will then fall back to `stableMoveKey`. That is why I would classify this as an architectural gap: the operator-facing behavior is not honest enough about the preview signal’s coverage.

The hard cap itself is not the villain. The formula

maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)) ≤ 256

is a legitimate bounded-computation control. But under that cap, the practical useful depth is limited; for example, with `maxOptions = 4`, useful depth reaches around 16, while with `maxOptions = 6`, useful depth reaches only around 7. The report also notes that the cap value does not appear to have been validated against FITL or other shipped games.

So the root defect is this:

The engine currently treats “bounded preview was attempted” too much like “preview evidence exists.”

Those are different facts.

---

## **Recommended change set**

### **1. Add a new Foundation: Preview Signal Integrity**

I would add this as Foundation #20, or as a corollary to Foundations #9 and #15. I prefer a new Foundation because this class of failure will recur anywhere policy preview, search, heuristic evaluation, hidden information, stochastic stops, or depth caps interact.

Proposed text:

## 20. Preview Signal Integrity

**Policy-preview output is advisory evidence with explicit provenance, not an implicit scalar.**

Every preview-derived ref MUST expose its observer scope, resolution status, budget outcome, and fallback path. Ready, unknown, hidden, stochastic, unresolved, failed, depth-capped, and partial results are distinct semantic outcomes. Unknown, hidden, stochastic, failed, depth-capped, and partial results MUST NOT be silently coerced into numeric values. Any policy fallback that converts non-ready preview evidence into a score MUST be explicit in profile YAML and visible in deterministic trace output.

Preview failure is a policy-quality event unless it violates determinism, legality, visibility, or bounded-computation invariants.

This preserves Foundation #10. It also prevents this exact problem from reappearing under a different preview ref.

---

### **2. Make preview refs typed by resolution status**

Change the preview pipeline so `resolveRefs` never returns an ambiguous “empty map” for a requested ref. A requested ref should produce a `PreviewResolution<T>` object.

Suggested shape:

type PreviewResolution<T> =

 | {

     status: 'ready';

     value: T;

     outcome: 'ready';

     depth: number;

     observer: ObserverId;

   }

 | {

     status: 'unknown';

     reason:

       | 'depthCap'

       | 'hidden'

       | 'stochastic'

       | 'unresolved'

       | 'noPreviewDecision'

       | 'failed';

     depth: number;

     observer: ObserverId;

   }

 | {

     status: 'partial';

     value: T;

     reason: 'depthCap';

     depth: number;

     observer: ObserverId;

     partialKind: 'stateAtDepthCap';

   };

Then change scoring semantics:

preferOptionProjectedMargin:

 scopes: [microturn]

 costClass: preview

 weight: 300

 value:

   ref: preview.option.delta.victory.currentMargin.self

 fallback:

   onUnknown: noContribution

Default behavior should be:

fallback:

 onUnknown: noContribution

 onPartial: noContribution

Not zero. Not undefined. Not “score 1.” No silent scalarization.

If a policy author truly wants to treat unknown as zero, they must write it:

fallback:

 onUnknown:

   constant: 0

And the trace must record that this happened.

This directly addresses the report’s subtle observability problem: a ref can appear “known but undefined” with `unknownPreviewRefs: []`, while `readyCount = 0`. That should be impossible under the new contract. A requested preview ref is either ready, partial, or explicitly unknown.

---

### **3. Add deterministic preview-signal advisories**

When a microturn-scoped consideration references `preview.option.*`, the runtime should emit a profile-quality advisory if any of these are true:

readyCount == 0 for every candidate

unknownDepthCap == evaluatedRootOptionCount

selectedByTieBreakerBecausePreviewUnavailable == true

previewUtility == none && previewRefsRequested.length > 0

Suggested diagnostic:

POLICY_PREVIEW_SIGNAL_UNAVAILABLE

profileId=arvn-evolved

seatId=arvn

decisionKind=chooseNStep

decisionKey=...

requestedRefs=[preview.option.delta.victory.currentMargin.self]

evaluatedRootOptions=8

readyRootOptions=0

unknownDepthCapRootOptions=8

selectedStableMoveKey=...

selectionReason=tiebreakAfterPreviewNoSignal

This should live in the policy-profile-quality stream, not in determinism tests. Foundations already distinguish engine invariants from profile-quality witness claims; convergence/profile quality warnings should not be treated as determinism failures.

But the **engine invariant** should be blocking:

A non-ready preview ref must never be silently coerced into a numeric contribution.

That belongs in normal tests.

---

### **4. Introduce bounded continued deepening for inner preview**

Do **not** blindly raise `INNER_PREVIEW_HARD_CAP` and call the problem solved. That buys headroom but does not fix signal honesty, and sufficiently deep games will hit the next cap.

Instead add a second strategy:

preview:

 inner:

   chooseNStep: true

   strategy: continuedDeepening

   maxOptions: 8

   chooseNBeamWidth: 1

   broad:

     depthCap: 4

   deep:

     trigger:

       - allRequestedRefsDepthCapped

       - allReadyValuesUniform

     rootPolicy: allRootsWithinCap

     depthCap: 16

   hardCostCapClass: deep1024

The key is **continued** deepening, not duplicated two-pass replay. The broad pass should keep reusable draft states or replay certificates so the deep pass continues from the broad frontier. That gives a tighter static bound:

broadCost =

 M × (1 + B × I × max(0, Db − 1))

incrementalDeepCost =

 R × B × I × max(0, Dd − Db)

totalCost =

 broadCost + incrementalDeepCost

Where:

M  = broad root option cap

R  = roots selected for deepening, R ≤ M

B  = chooseNBeamWidth

I  = inner max option cap

Db = broad depth

Dd = deep depth

For the reported problematic default shape, `M = 8`, `B = 1`, `I = 8`, `Db = 4`, `Dd = 16`, `R = 8` gives:

broadCost = 8 × (1 + 1 × 8 × 3) = 200

incrementalDeepCost = 8 × 1 × 8 × 12 = 768

totalCost = 968

That fits a `deep1024` cap while covering all eight root options to depth 16. It is still bounded, deterministic, and statically validated.

This is the right architectural move because it mirrors the research pattern: spend budget broadly first, then deepen selectively or completely within a declared bound. It also avoids the main failure mode of a naive top-K second pass: when the broad pass has no signal, “top K” is just lexical bias. In `allRequestedRefsDepthCapped` cases, the default should be `allRootsWithinCap`; only use `topK` when the broad pass has an actual ready signal.

I would keep the existing single-pass strategy for low-cost profiles, but rename/trace its coverage honestly.

---

### **5. Add generic microturn option-keyed state lookups**

Option D from the report is not a workaround. It is a missing primitive.

A general board/card-game agent should be able to say:

“This option names some visible state object. Score the option by a visible property of that object.”

That is not game-specific engine code. It is a generic policy-surface lookup.

Suggested DSL:

preferHighPopulationTarget:

 scopes: [microturn]

 when:

   eq: [{ ref: microturn.kind }, chooseNStep]

 weight: 50

 value:

   lookup:

     surface: policyState

     collection: zones

     keyType: ZoneId

     key:

       ref: microturn.option.value

     path: [properties, population]

     onMissing: unknown

     onHidden: unknown

Rules:

1. `surface: policyState` must route through the same observer-view filtering as preview. It must not inspect authoritative hidden state unless the profile is explicitly omniscient. That preserves Foundation #4.  
2. `keyType` must be nominally validated. If `microturn.option.value` is not a `ZoneId`, the lookup returns `unknownUnresolved` or fails compilation when statically knowable. That aligns with Foundation #17.  
3. The lookup path must be generic. No `FITL.population` special case. No per-game schemas. This preserves Foundations #1 and #6.  
4. Missing, hidden, or ill-typed lookup results must not default to zero unless the policy author explicitly requests that fallback.

This gives agent evolution a non-preview signal source at deep inner frontiers. For FITL, the evolved profile can learn target-space preferences from visible population/control/piece counts without needing to forward-simulate an entire coup/pacification ladder every time.

---

### **6. Do not make partial margin refs the default**

The report’s Option C is tempting, but I would **not** allow `preview.option.delta.victory.currentMargin.self` to resolve from a depth-cap partial state. That is dangerous.

A margin delta is a semantic claim about the post-drive boundary state. If the drive stopped in the middle of a nested effect tree, the margin can be wrong, incomplete, or wrong-direction. The quiescence-search literature is exactly about this kind of horizon problem: fixed-depth search can produce misleading evaluations unless the position is stable enough to evaluate.

The safe version is:

value:

 ref: preview.partial.stateAtDepthCap.global.patronage

or:

value:

 ref: preview.option.delta.victory.currentMargin.self

 partial:

   allow: false

Default:

partial:

 allow: false

Partial values may be useful, but they must be different refs or explicitly marked `status: partial`. They must not satisfy existing `preview.option.delta.*` refs.

---

## **Concrete implementation plan**

### **Runtime changes**

Touch these files first:

packages/engine/src/agents/policy-preview-inner.ts

packages/engine/src/agents/policy-preview-inner-choosenstep.ts

packages/engine/src/agents/microturn-option-evaluator.ts

packages/engine/src/agents/policy-agent.ts

The report already identifies the relevant anchors: `driveOption`, `resolveRefs`, the `chooseNStep` preview driver, the microturn evaluator’s consumption of `previewOptionResolvedRefsByOptionKey`, and the policy-agent dispatch.

Required changes:

// Before: map only contains successfully resolved values, or is empty.

previewOptionResolvedRefsByOptionKey: Map<OptionKey, Map<RefId, number>>

// After: every requested ref has a resolution object.

previewOptionResolvedRefsByOptionKey: Map<OptionKey, Map<RefId, PreviewResolution<number>>>

Then in `microturn-option-evaluator.ts`:

if (resolution.status === 'ready') {

 contribution = weight * resolution.value;

} else {

 contribution = noContribution;

 tracePreviewUnavailable(...);

}

No `undefined → 0`. No empty-map ambiguity.

---

### **Compiler changes**

Touch:

packages/engine/src/cnl/compile-agents.ts

Add validation for explicit fallback behavior when a preview ref is used in a numeric scoring term.

Acceptable defaults:

fallback:

 onUnknown: noContribution

 onPartial: noContribution

Optional explicit behavior:

fallback:

 onUnknown:

   constant: 0

Compiler diagnostic for dangerous legacy-like behavior:

CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK

Add strategy validation:

preview.inner.strategy: singlePass | continuedDeepening

preview.inner.hardCostCapClass: standard256 | deep1024 | deep2048

The exact cap classes should be benchmarked, but I would start with `standard256` and `deep1024`. The important part is that the chosen cap class is static, serialized into the compiled artifact, and included in reproducibility metadata.

---

### **DSL additions**

Add policy-surface lookup refs:

lookup:

 surface: policyState

 collection: zones | tokens | players | globals | dataAssets

 keyType: ZoneId | TokenId | PlayerId | GlobalVarId | DataAssetId | string

 key:

   ref: microturn.option.value

 path: [properties, population]

 onMissing: unknown | constant

 onHidden: unknown

This must route through observer projections. The engine owns one authoritative state, but players/agents consume projections according to visibility rules, so the lookup must use the projected policy surface, not raw state.

---

### **Trace schema changes**

Extend `previewUsage`:

type PreviewUsageTrace = {

 mode: 'exactWorld' | 'tolerateStochastic' | 'disabled';

 coverage: {

   requestedRefCount: number;

   evaluatedRootOptionCount: number;

   readyRootOptionCount: number;

   partialRootOptionCount: number;

   unknownRootOptionCount: number;

   allRootsDepthCapped: boolean;

   selectedByTieBreakerBecausePreviewUnavailable: boolean;

 };

 outcomeBreakdown: {

   ready: number;

   partialDepthCap: number;

   unknownDepthCap: number;

   unknownHidden: number;

   unknownStochastic: number;

   unknownUnresolved: number;

   unknownNoPreviewDecision: number;

   failed: number;

 };

 advisories: readonly PolicyPreviewAdvisory[];

};

Add candidate-level fields:

previewResolutionByRefId: Record<RefId, PreviewResolutionTrace>;

selectionReason:

 | 'scored'

 | 'tiebreak'

 | 'tiebreakAfterPreviewNoSignal'

 | 'fallbackExplicit'

 | 'gated';

The report already contains the trace fields needed to detect the current failure; the problem is that they are not treated as a policy-quality event and do not prevent misleading score semantics.

---

## **Testing requirements**

Do this test-first. Foundation #16 is explicit: architectural properties must be proven through automated tests.

Add these tests:

### **1. Depth-capped preview does not score as zero**

Synthetic game:

chooseN root option

 nested chooseN

   nested chooseN

     modifies victory margin

Configure `depthCap` too low.

Assertions:

preview ref status == unknownDepthCap

score contribution is absent, not 0

selectionReason == tiebreakAfterPreviewNoSignal

POLICY_PREVIEW_SIGNAL_UNAVAILABLE emitted

### **2. Continued deepening recovers signal within static cap**

Same synthetic game.

Configure `continuedDeepening` with sufficient `deep.depthCap`.

Assertions:

cost formula <= cap

readyRootOptionCount > 0

decision differentiates by preview value

deterministic replay identical

### **3. Partial margin refs are not accepted as ready**

Synthetic game where partial state temporarily improves margin but final state reverses it.

Assertions:

preview.option.delta.victory.currentMargin.self status != ready at depthCap

preview.partial.* may resolve only if explicitly requested

default scoring ignores partial

### **4. Option-keyed state lookup respects observer visibility**

Hidden-information game fixture.

Assertions:

currentPlayer observer cannot read hidden property

omniscient observer can read hidden property

hidden lookup returns unknownHidden, not zero

### **5. Invalid option-key type is not silently accepted**

If `microturn.option.value` is not a `ZoneId` and the lookup requires `ZoneId`, assert compile-time diagnostic when knowable, otherwise runtime `unknownUnresolved`.

### **6. FITL ARVN seed 1000 regression**

Use the reported trace as a regression fixture.

Acceptance criterion:

The four structural chooseNStep decisions no longer appear as normal scored decisions.

They either:

 a) produce ready preview signal under continuedDeepening, or

 b) emit POLICY_PREVIEW_SIGNAL_UNAVAILABLE and select via explicit non-preview policy terms,

    not silent lexical fallback.

---

## **Documentation changes**

Update `docs/agent-dsl-cookbook.md`.

The current claim that `chooseNStep` preview differentiates ADD options “the same way” as `chooseOne` is too strong. The report explicitly says the cookbook does not warn about deeply nested `chooseN` ladders, all-root depth caps, or fallback to `stableMoveKey`.

Replace it with something like:

Per-option preview at chooseNStep is bounded evidence, not a guarantee of signal.

For each ADD option, the runtime attempts a bounded synthetic completion. A requested

`preview.option.*` ref is usable only when its resolution status is `ready`. Deeply

nested chooseN ladders may reach `depthCap`; in that case the ref resolves to

`unknownDepthCap`, does not contribute to numeric scoring by default, and emits a

policy-preview advisory.

Use `preview.inner.strategy: continuedDeepening` when projected outcome refs are

important at deep frontiers. Use `lookup.surface: policyState` for current-state

features such as visible zone properties, token counts, or player-visible globals.

---

## **What not to do**

Do **not** accept Option A alone. Documentation plus a warning leaves the actual policy surface broken. It is useful as a temporary mitigation, not a fix.

Do **not** choose Option B alone. Raising the cap from 256 to 512 or 1024 may reduce this particular FITL failure, but it does not solve the next one. The problem is not just insufficient depth; it is silent loss of signal.

Do **not** make Option C the default. Partial state can be useful, but generic partial resolution of victory-margin deltas is a horizon-effect trap.

Do **not** add FITL-specific heuristics to the engine. The correct escape hatch is a generic observer-routed state-feature lookup over policy surfaces.

---

## **Recommended rollout**

1. **Spec 162: Preview Signal Integrity**  
   * Add Foundation #20.  
   * Introduce `PreviewResolution`.  
   * Prevent non-ready preview refs from becoming numeric contributions.  
   * Emit deterministic policy-preview advisories.  
   * Update cookbook.  
2. **Spec 163: Generic Microturn State-Feature Lookups**  
   * Add `lookup.surface: policyState`.  
   * Route through observer projections.  
   * Add key typing and hidden/missing semantics.  
3. **Spec 164: Continued Inner Preview Deepening**  
   * Add `preview.inner.strategy: continuedDeepening`.  
   * Add static incremental cost formula.  
   * Add cap classes such as `standard256` and `deep1024`.  
   * Benchmark FITL, Texas Hold’em, and the conformance corpus before changing defaults.  
4. **Resume ARVN evolution only after the FITL seed-1000 regression passes**  
   * The four known structural `chooseNStep` failures must either produce ready signal under continued deepening or be selected by explicit non-preview considerations.  
   * Silent lexical fallback after preview collapse should be impossible.

The end state should be: **bounded previews remain bounded, legal microturns remain atomic and executable, hidden information remains protected, and policy agents can never confuse “I looked and found no usable signal” with “this option scores zero.”**

