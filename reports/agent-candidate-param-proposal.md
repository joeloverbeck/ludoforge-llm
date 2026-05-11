# **Proposal: add typed `candidate.params.<name>` refs, not dynamic tags and not a preview workaround**

I’m treating the uploaded candidate-param report as the problem record and `FOUNDATIONS.md` as the governing constraint set.

My recommendation is **Option B with Option A’s implementation substrate**:

Add a new documented policy ref family, **`candidate.params.<name>`**, that reads typed scalar parameters from the observer-projected, kernel-published action-selection candidate. Internally, it may reuse the existing `candidateParam` compiled discriminant, but the public DSL should **not** revive the retired singular `candidate.param.*` namespace.

That distinction matters. The singular form was explicitly retired; reviving it muddies Foundation #14. A plural namespace gives you the missing capability while preserving a clean break: `candidate.param.*` remains invalid, `candidate.params.*` becomes the new current surface.

The root issue is exactly what the uploaded report says: FITL event and pivotal-event candidates already carry semantically decisive parameters such as `side`, `branch`, and `eventCardId`, but the scoring DSL can only distinguish action class, generic intrinsics, and preview-derived signals. Preview at `depthCap=4` is too shallow to reliably rank shaded versus unshaded event variants, so an ARVN event boost can literally induce ARVN to play anti-COIN shaded events. Current action-selection policy surfaces expose tags/intrinsics/preview/aggregate features, while `candidate.param.<name>` authoring is retired even though internal candidate-param machinery still exists.

The fix should **read the published candidate**, not search deeper, not infer from `stableMoveKey`, not emit ad hoc FITL tags, and not pretend preview has seen effects it has not seen. That aligns with the Foundations: generic engine, YAML-owned game schema, declarative specs, deterministic bounded lookup, compiler validation, no compatibility aliases, branded IDs, microturn parity, and preview-signal integrity.

---

## **Research synthesis**

The external evidence points in one direction: **do not flatten away action parameters when the policy needs to reason about them**.

Parameterized-action RL formalizes actions as a discrete action kind plus parameters; Masson, Ranchod, and Konidaris explicitly describe the agent choosing both the action and its parameters, because pure discrete or pure continuous treatments lose useful structure. Hausknecht and Stone make the same structural point for RoboCup HFO: the agent first selects a high-level action type, then supplies the parameters, and that parameterization adds structure absent from a homogeneous action space. HyAR’s abstract makes the broader game-AI lesson explicit: naive homogenization of hybrid action spaces ignores structure and creates scalability/approximation problems.

General Game Playing also treats moves as symbolic terms, not opaque labels. In GDL-II, `legal(R,M)` means role `R` can do move `M`, `does(R,M)` records the chosen move, and moves/percepts are ground symbolic expressions such as `allIn` or structured terms. That is the closest research analogue to your architecture: a universal interpreter can stay game-agnostic while still exposing the whole legal move term to reasoning.

Existing general-game implementations follow the same pattern procedurally. Ludii custom AIs return a `Move` selected from `game.moves(context).moves()`, and Ludii research on spatial state-action features explicitly uses features that incentivize or disincentivize actions based on local state around action variables. TAG agents receive `List<AbstractAction> availableActions` plus an observation and return one `AbstractAction`; boardgame.io bots map enumerated `{ move, args }` or `{ event, args }` entries into executable actions. OpenSpiel and PettingZoo emphasize legal-action frontiers and action masks, which supports your constructibility model, but they are less useful as a vocabulary source because OpenSpiel’s standard API is primarily integer-action based.

For FITL specifically, the rules support either modeling event side as a parameter or lowering it into a later microturn: the eligible faction chooses to execute the Event at sequence-of-play level, while dual-use event rules say the executing faction may select either unshaded or shaded text. Pivotal events are trickier because they involve interruption timing, eligibility, preconditions, and card identity; that argues for keeping `eventCardId` readable as an action-selection parameter even if ordinary event side is later refactored into a microturn.

The research does **not** reveal a canonical literal name like `candidate.params.<name>`. It does reveal a canonical design principle: policy code/logic must be able to inspect the structured legal action it is choosing. Your platform should implement that principle declaratively and with compiler validation.

---

# **Spec proposal: Candidate Parameter Refs for Action-Selection Policy**

## **1. New public DSL surface**

Add:

{ ref: candidate.params.<paramName> }

Examples:

avoidShadedEvent:

 scopes: [move]

 appliesToActions: [event]

 weight: -800

 value:

   boolToNumber:

     eq:

       - { ref: candidate.params.side }

       - shaded

preferUnshadedEvent:

 scopes: [move]

 appliesToActions: [event]

 weight: 800

 value:

   boolToNumber:

     eq:

       - { ref: candidate.params.side }

       - unshaded

preferSpecificPivotal:

 scopes: [move]

 appliesToActions: [pivotalEvent]

 weight: 500

 value:

   boolToNumber:

     in:

       - { ref: candidate.params.eventCardId }

       - [card-121, card-122]

For optional params:

preferEventBranch:

 scopes: [move]

 appliesToActions: [event]

 weight: 300

 value:

   boolToNumber:

     eq:

       - { ref: candidate.params.branch, onMissing: { kind: constant, value: __absent__ } }

       - someBranchId

Rules:

* `candidate.params.*` is valid only at action-selection policy scope.  
* `candidate.param.*` remains retired and is rejected.  
* The value is a typed scalar: boolean, integer, enum string, or branded ID. No arrays, no objects, no floats.  
* The resolver reads only the **observer-projected published candidate**, never authoritative hidden state.

This is not a preview ref, not a state lookup, and not an aggregate. It is a direct read from the same legal move shape the client/agent is already allowed to choose. The uploaded issue correctly frames this as Foundation #20-safe because the ref reads pre-published candidate state and should not touch `unknownPreviewRefs[]` or preview tiebreak logic.

---

## **2. Required GameSpec action-param declarations**

The engine cannot validate policy refs unless action params are declared in GameSpecDoc. FITL currently appears inconsistent: the issue report notes that runtime event candidates bake event params into moves, while the referenced event action definition still has `params: []`; pivotal events already declare `eventCardId`. That has to be fixed, not worked around.

Recommended generic action schema extension:

actions:

 event:

   tags: [event-play]

   params:

     - name: eventCardId

       domain:

         kind: id

         idKind: card

       presence: required

     - name: eventDeckId

       domain:

         kind: id

         idKind: deck

       presence: required

     - name: side

       domain:

         kind: enum

         values: [unshaded, shaded]

       presence: required

     - name: branch

       domain:

         kind: enum

         valuesFrom:

           dataAsset: fitlEventBranchIds

       presence: optional

actions:

 pivotalEvent:

   tags: [event-play, pivotal-event]

   params:

     - name: eventCardId

       domain:

         kind: id

         idKind: card

       presence: required

The exact `valuesFrom` mechanism can match your existing data-asset/domain machinery. The important part is that **all policy-readable candidate params have a compiler-visible name, type, and presence contract**. This preserves schema genericity: the engine learns nothing about “side” or “eventCardId”; it only validates a declared param name and scalar domain.

---

## **3. `appliesToActions` is mandatory for candidate-param refs**

Do not let the compiler infer action domains from arbitrary `when` expressions. That is brittle, and it will eventually produce either false accepts or runtime “unknown” behavior.

Add a generic policy consideration field:

appliesToActions: [event]

Validation rule:

* If a consideration references `candidate.params.<name>` and omits `appliesToActions`, the compiler validates the ref against **every action** in the consideration’s move scope.  
* If the param is not declared on every such action, compilation fails with `AGENT_POLICY_CANDIDATE_PARAM_ACTION_DOMAIN_REQUIRED`.  
* If `appliesToActions` is present, every referenced param must exist on every listed action, or compilation fails.

This keeps Foundation #12 clean: the compiler validates what it can know from the spec alone, and the kernel only enforces runtime invariants.

---

## **4. Compiler contract**

### **Accepted ref**

{ ref: candidate.params.side }

Lowers to something like:

{

 kind: 'candidateParam',

 publicRef: 'candidate.params.side',

 paramName: 'side',

 actionIds: ['event'],

 valueType: {

   kind: 'enum',

   values: ['unshaded', 'shaded']

 },

 presence: 'required',

 onMissing: { kind: 'contractViolation' },

 onHidden: { kind: 'unavailable' }

}

For optional params:

{

 kind: 'candidateParam',

 publicRef: 'candidate.params.branch',

 paramName: 'branch',

 actionIds: ['event'],

 valueType: { kind: 'enum', valuesFrom: 'fitlEventBranchIds' },

 presence: 'optional',

 onMissing: { kind: 'constant', value: '__absent__' },

 onHidden: { kind: 'unavailable' }

}

### **Error codes**

Use explicit error codes; do not bury this under generic ref-resolution errors.

| Error | Fires when |
| ----- | ----- |
| `AGENT_POLICY_RETIRED_REF` | Author uses `candidate.param.*`, `option.value`, or `decision.*`. |
| `AGENT_POLICY_CANDIDATE_PARAM_SCOPE_INVALID` | `candidate.params.*` appears outside move/action-selection scope. |
| `AGENT_POLICY_CANDIDATE_PARAM_ACTION_DOMAIN_REQUIRED` | Param exists only on some actions and no explicit `appliesToActions` narrows the domain. |
| `AGENT_POLICY_CANDIDATE_PARAM_UNKNOWN` | Listed action does not declare the referenced param. |
| `AGENT_POLICY_CANDIDATE_PARAM_OPTIONAL_REQUIRES_ON_MISSING` | Optional param is read without `onMissing`. |
| `AGENT_POLICY_CANDIDATE_PARAM_TYPE_MISMATCH` | Expression compares or combines the param with an incompatible literal/domain. |
| `AGENT_POLICY_CANDIDATE_PARAM_UNSUPPORTED_VALUE_TYPE` | Param domain is object/array/free string/float rather than a policy scalar. |
| `AGENT_POLICY_CANDIDATE_PARAM_HIDDEN_UNSAFE` | A ref attempts to override hidden behavior. `onHidden` is always unavailable. |

The singular retired form should not become an alias. No “compat” path, no warning-then-accept behavior. Foundation #14 is explicit: breaking changes migrate owned artifacts; production code does not carry deprecated fallbacks.

---

## **5. Runtime resolver contract**

At action-selection scoring time, the resolver receives the candidate as published to the current observer/agent.

Resolution algorithm:

1. Confirm `candidate.actionId ∈ compiledRef.actionIds`.  
2. Read `candidate.params[paramName]` from the **projected candidate**, not from full authoritative state.  
3. If present, validate scalar domain and return `ready`.  
4. If absent and param is optional:  
   * `onMissing: { kind: constant, value }` returns that typed constant.  
   * `onMissing: { kind: unavailable }` marks the expression unavailable.  
5. If absent and param is required, emit a runtime contract violation; this is a spec/compiler/kernel consistency bug.  
6. If hidden/masked in the observer projection, return unavailable with `status: hidden`; this cannot be overridden.  
7. Never invoke preview.  
8. Never add the ref to `unknownPreviewRefs`.  
9. Never trigger `tiebreakAfterPreviewNoSignal` because of this ref.

Trace shape:

{

 "candidateId": "event:card-78:shaded",

 "candidateParamRefs": [

   {

     "ref": "candidate.params.side",

     "actionId": "event",

     "paramName": "side",

     "status": "ready",

     "value": "shaded",

     "valueType": {

       "kind": "enum",

       "values": ["unshaded", "shaded"]

     },

     "provenance": "publishedCandidate",

     "observer": "actingSeat"

   }

 ],

 "unknownPreviewRefs": [],

 "previewSignalStatus": "notRequestedByCandidateParam"

}

For missing optional branch:

{

 "ref": "candidate.params.branch",

 "actionId": "event",

 "paramName": "branch",

 "status": "missing",

 "missingPolicy": {

   "kind": "constant",

   "value": "__absent__"

 },

 "resolvedValue": "__absent__",

 "provenance": "publishedCandidate"

}

This trace bucket should be named `candidateParamRefs`, not `unknownLookupRefs`. Candidate params are neither preview nor state lookup. They deserve their own provenance category.

---

# **Worked FITL example**

Today, the report says seed 1001 has ARVN choosing card-78 shaded under the current surface. With the new ref:

avoidShadedEvent:

 scopes: [move]

 appliesToActions: [event]

 weight: -800

 value:

   boolToNumber:

     eq:

       - { ref: candidate.params.side }

       - shaded

Expected candidate-scoring trace for the shaded event candidate:

{

 "candidate": {

   "actionId": "event",

   "params": {

     "eventCardId": "card-78",

     "side": "shaded"

   }

 },

 "considerations": [

   {

     "id": "avoidShadedEvent",

     "rawValue": 1,

     "weight": -800,

     "contribution": -800,

     "refs": [

       {

         "ref": "candidate.params.side",

         "status": "ready",

         "value": "shaded",

         "provenance": "publishedCandidate"

       }

     ]

   }

 ],

 "candidateParamRefs": [

   {

     "ref": "candidate.params.side",

     "status": "ready",

     "value": "shaded"

   }

 ],

 "unknownPreviewRefs": []

}

Expected trace for the matching unshaded candidate:

{

 "candidate": {

   "actionId": "event",

   "params": {

     "eventCardId": "card-78",

     "side": "unshaded"

   }

 },

 "considerations": [

   {

     "id": "avoidShadedEvent",

     "rawValue": 0,

     "weight": -800,

     "contribution": 0,

     "refs": [

       {

         "ref": "candidate.params.side",

         "status": "ready",

         "value": "unshaded",

         "provenance": "publishedCandidate"

       }

     ]

   }

 ],

 "candidateParamRefs": [

   {

     "ref": "candidate.params.side",

     "status": "ready",

     "value": "unshaded"

   }

 ],

 "unknownPreviewRefs": []

}

If the shaded and unshaded candidates are otherwise tied or close, the selection should move away from shaded. If another consideration still overpowers the penalty, the trace remains honest: the agent knowingly chose shaded despite the penalty, instead of doing so because the DSL could not see `side`.

---

# **What not to do**

## **Do not use `stableMoveKey` parsing**

`stableMoveKey` contains params, but making policy authors parse it would violate the spirit of Foundations #7, #8, #12, and #17. It turns a typed move into string archaeology. The report already identifies `stableMoveKey` as visible but not semantically useful for this purpose.

## **Do not add implicit preview fallback**

The secondary issue—uniform preview margins across action classes—is real, but an automatic fallback would be the wrong engine fix. Foundation #20 says preview-derived output is advisory evidence with explicit provenance and explicit fallback; unavailable or weak preview cannot silently become a scalar preference.

Add telemetry instead:

{

 "event": "POLICY_PREVIEW_UNIFORM_SIGNAL",

 "scope": "move",

 "requestedRefs": ["preview.victory.currentMargin.self"],

 "candidateCount": 9,

 "distinctReadyValues": 1,

 "actionIds": ["govern", "train", "patrol", "sweep", "assault", "event"]

}

Then let profile authors respond explicitly with YAML conditionals. That keeps the engine honest and lets profile-quality tests track whether an agent profile is improving without conflating profile quality with determinism invariants.

## **Do not implement dynamic param tags in the kernel now**

Option C is tempting, but it is a lossy convenience layer. `candidate.tag.event-shaded` is just `candidate.params.side == shaded` with extra namespace management and potential tag bloat. It also fails when authors need numeric or branded-ID comparisons.

If ergonomics later demand tags, implement them as a **compiler macro** that lowers to `candidate.params.*` comparisons, not as kernel-time dynamic tag emission:

policyMacros:

 eventIsShaded:

   expandsTo:

     eq:

       - { ref: candidate.params.side }

       - shaded

That preserves one semantic primitive and avoids a second quasi-schema for tags.

## **Do not make Option D the immediate unblocker**

Lowering FITL side/branch selection into microturns is semantically defensible for ordinary dual-use events: the sequence-of-play choice is “execute the Event,” and the dual-use rule says the executing faction selects shaded or unshaded text during execution. But it is a larger refactor, and pivotal events still need readable candidate identity because their card identity drives interruption/precondition semantics.

Queue Option D as a later decision-granularity hardening spec. It should not block the smaller, general, typed candidate-param surface.

---

# **Foundation alignment**

| Foundation | Alignment |
| ----- | ----- |
| #1 Engine Agnosticism | Engine/compiler never know FITL names. They validate declared param names and scalar domains generically. |
| #2 Evolution-First Design | All rule-authoritative action-param schemas live in GameSpecDoc YAML; profile evolution mutates YAML only. |
| #4 Observer Views | Resolver reads observer-projected candidate params. Hidden/masked params become unavailable and cannot be overridden. |
| #5 One Rules Protocol | Agents score the same published legal actions that UI/simulator clients execute. No separate AI-only action path. |
| #6 Generic Schema | No per-game schema files. `side`, `branch`, `eventCardId` are generic action param declarations. |
| #7 Specs Are Data | A ref is a declarative read; comparisons remain existing data expressions. No scripts/eval/string parsing. |
| #8 Determinism | Lookup is O(1), scalar, canonical, exact. No wall-clock, locale, object-order, or float behavior. |
| #9 Auditability | Trace records every candidate-param ref with status, value, type, and provenance. |
| #10 Bounded Computation | No search loop, no deeper preview, no cap-class changes. |
| #12 Compiler-Kernel Boundary | Compiler validates ref scope, action domain, param existence, presence, and type. Kernel enforces state/projection runtime invariants. |
| #13 Reproducibility | Compiled GameDef carries action param definitions and compiled ref metadata. |
| #14 No Backwards Compatibility | `candidate.param.*` remains rejected. Owned policies/docs/goldens migrate to `candidate.params.*`. No alias. |
| #15 Architectural Completeness | Closes the actual design gap rather than adding FITL-specific heuristics or preview hacks. |
| #16 Testing as Proof | Add compiler, runtime, golden-trace, conformance, and profile-quality tests. |
| #17 Branded IDs | ID params compile to branded scalar types internally; serialized YAML/JSON stays canonical string form. |
| #18 Constructibility | Candidate params are part of already-published constructible actions; no client-side completion. |
| #19 Decision-Granularity Uniformity | Action-selection candidates gain parity with `microturn.option.value`: when the thing being chosen has a typed scalar value, policy can read it. |
| #20 Preview Signal Integrity | Candidate-param refs are not preview refs, do not request preview, and do not appear in preview-unavailable accounting. |

---

# **Test plan**

## **Architectural-invariant tests**

1. **Retired namespace rejection**  
    A policy using `{ ref: candidate.param.side }` fails with `AGENT_POLICY_RETIRED_REF`.  
2. **Scope rejection**  
    A microturn-only consideration using `{ ref: candidate.params.side }` fails with `AGENT_POLICY_CANDIDATE_PARAM_SCOPE_INVALID`.  
3. **Action-domain enforcement**  
    A move-scope consideration using `{ ref: candidate.params.side }` without `appliesToActions` fails unless every action in the scoring domain declares `side`.  
4. **Unknown param rejection**  
    `appliesToActions: [govern]` with `candidate.params.side` fails with `AGENT_POLICY_CANDIDATE_PARAM_UNKNOWN`.  
5. **Optional param fallback enforcement**  
    `candidate.params.branch` fails without `onMissing` if `branch` is declared optional.  
6. **Type mismatch rejection**  
    Comparing `candidate.params.eventCardId` to `shaded` fails because branded card IDs and side enum values are different domains.  
7. **Preview isolation**  
    A policy that only reads `candidate.params.side` must not call the preview driver, must not populate `unknownPreviewRefs`, and must not emit `POLICY_PREVIEW_SIGNAL_UNAVAILABLE`.  
8. **Compiler determinism**  
    Compile the same GameSpecDoc twice and assert byte-identical GameDef.  
9. **Game-agnostic conformance corpus**  
    Add one tiny action-param example each for a perfect-information board game, hidden-information card game, stochastic game, and asymmetric/phase-heavy game.

## **Golden-trace tests**

1. **Toy same-action candidates**  
    Two legal candidates share `actionId: chooseMode` but differ by `params.mode`. A policy penalizes `mode=B`; the trace shows one penalty and one non-penalty.  
2. **FITL seed 1001 event side**  
    With `avoidShadedEvent`, the card-78 shaded candidate gets `contribution: -800`; the unshaded candidate gets `0`; both traces include `candidateParamRefs`.  
3. **Optional branch missing**  
    An event without `branch` resolves through the declared `onMissing` policy and records `status: missing`.  
4. **Pivotal event ID**  
    `candidate.params.eventCardId` reads the pivotal event card ID as a branded card ID and supports `in`/`eq` comparisons to card literals.

## **Profile-quality witnesses**

These should live outside determinism tests, matching the Foundations appendix distinction between engine invariants and profile-quality signals.

1. **ARVN shaded-event suppression witness**  
    With `avoidShadedEvent`, ARVN shaded event selections should drop to zero unless no unshaded/event alternative is legal or another explicit profile consideration overwhelms the penalty.  
2. **Composite-score non-regression witness**  
    Run the same 15-seed campaign and emit `POLICY_PROFILE_QUALITY_REGRESSION` if the profile regresses materially. This remains advisory, not a determinism failure.  
3. **Uniform-preview diagnostic witness**  
    Count move frontiers where preview returns identical ready values across materially different action classes, and emit `POLICY_PREVIEW_UNIFORM_SIGNAL`.

---

# **Migration plan**

1. **Write the spec**  
    Add something like `archive/specs/166-candidate-parameter-refs.md`.  
2. **Update cookbook**  
    Replace the old “without reviving `candidate.param.*`” language with:  
   * `candidate.param.*` is retired and invalid.  
   * `candidate.params.*` is the current action-selection candidate-param surface.  
   * `microturn.option.*` remains the microturn option surface.  
3. **Update policy parser/compiler**  
   * Parse plural `candidate.params.<name>`.  
   * Reject singular `candidate.param.<name>`.  
   * Add `appliesToActions`.  
   * Lower to existing/internal `candidateParam` ref with action-domain/type/presence metadata.  
4. **Update trace schema**  
   * Add `candidateParamRefs[]`.  
   * Keep candidate-param failures out of `unknownPreviewRefs[]`.  
5. **Fix FITL action declarations**  
   * Add `eventCardId`, `eventDeckId`, `side`, and optional `branch` to `event`.  
   * Confirm `pivotalEvent.eventCardId` has a branded card domain.  
   * Update any event-generation code that currently emits params not declared in the action schema.  
6. **Audit other games**  
    Search for generated candidates with non-empty `params` and ensure every semantically loaded param is declared. Poker-like games are especially likely to have candidate-level amount/card/role params.  
7. **Migrate owned policies**  
    Add `avoidShadedEvent` or `preferUnshadedEvent` to FITL ARVN only after the compiler/runtime tests pass.  
8. **Regenerate goldens**  
    Update traces that now include `candidateParamRefs[]`. Do not keep old trace compatibility.

---

# **Final position**

Implement **`candidate.params.<name>` now**. It is the smallest complete fix that matches the research pattern, preserves the Foundations, and unblocks agent evolution without preview dishonesty or FITL-specific engine code.

Leave dynamic tags out of the kernel. Keep microturn-lowering as a later structural cleanup. Treat uniform preview margins as a profile-quality/telemetry issue, not an implicit scoring fallback.

This is a root-cause architecture fix: the policy is choosing a published structured action, so the policy must be able to read the published structured action.

