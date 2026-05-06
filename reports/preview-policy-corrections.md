## **Bottom line**

Claude’s report is pointing at a real architectural problem, not merely bad profile tuning. The current preview design is trying to use a **post-gate projection signal** to score candidates, but the gate itself is based on **pre-preview move-only score**. That makes preview structurally unable to rescue candidates whose value is only visible after simulation. Raising `topK` helps, but it is a bandage: the report already shows `topK: 10` improves readiness from 36.1% to 75.3%, while still leaving uniform projected margins in 8 of 24 decisions.

My strongest recommendation: replace the current `topK` mechanism with a **deterministic bounded preview budget allocator**, add a modern **microturn-scope policy surface** to replace retired completion-scope guidance, and treat inner microturn preview as a first-class feature rather than an accident of synthetic completion.

The target architecture should be:

**Preview is a deterministic, bounded, policy-guided lookahead service over published microturns, not a top-K postprocessor.**

That framing fits `FOUNDATIONS.md`: the engine must remain game-agnostic, specs must stay declarative data, all clients must use the same legal-action protocol, computation must be bounded, decisions must remain atomic microturns, and deprecated compatibility surfaces should not persist in production.

---

## **What the outside research says**

### **1. This is a fixed-budget planning problem, not a static top-K problem**

MCTS literature treats game lookahead as an **anytime, budgeted search** problem: state spaces are too large to search completely, so the algorithm allocates simulations under a computational budget and improves confidence as budget increases. That maps closely to your preview problem: you cannot afford full synthetic completion for every candidate in every decision, but a hard static gate is too crude.

The relevant lesson is not “implement full MCTS.” That would probably be too heavy and would blur profile evaluation with full adversarial search. The useful lesson is **budget allocation**: start with broad, cheap coverage; then spend deeper simulation only where it is likely to matter.

### **2. Progressive widening / progressive unpruning is a better mental model than `topK`**

Progressive strategies in MCTS use heuristic knowledge to guide search without permanently collapsing the branch factor. Progressive bias uses heuristic knowledge to direct search, while progressive unpruning/widening starts with a reduced branching factor and then gradually increases it.

That is almost exactly the failure mode in Claude’s Gap 2. Your current gate reduces the branch factor, but it does **not widen** and it does **not guarantee coverage**. Candidates that need preview to be valued can be excluded forever. The right model is:

1. guarantee some coverage across candidate families;  
2. bias additional preview budget toward promising candidates;  
3. optionally widen if the first batch is low-information or tied.

### **3. Priors should bias preview allocation, not act as a hard exclusion gate**

OpenSpiel’s MCTS implementation is a useful concrete comparison. Its evaluator can supply priors over legal actions; UCT forces exploration of unvisited children by returning infinity for unvisited nodes; PUCT combines action priors with search statistics rather than simply discarding all low-prior actions.

OpenSpiel also explicitly shuffles legal actions to reduce move-generation-order bias when expanding children. Your engine should not copy nondeterministic shuffling because `FOUNDATIONS.md` makes determinism sacred, but the reason matters: stable alphabetical ordering is a known source of bias. In LudoForge, the equivalent should be a deterministic stable permutation or deterministic round-robin coverage, not raw alphabetical fallback.

### **4. Root decision selection is closer to “best arm identification” than cumulative-reward search**

There is MCTS work on using Sequential Halving at the root because normal UCB-style selection optimizes cumulative regret during search, while root action choice wants low **simple regret**: choose the best final arm/action. Anytime Sequential Halving was proposed because standard Sequential Halving needs a fixed budget, while game search often needs interruptible anytime behavior.

For preview, this suggests a clean approach: at the action-selection root, allocate small preview resources broadly, eliminate or deprioritize clearly bad candidates, then deepen a smaller set. That is much better than ranking by move-only score before the preview signal exists.

### **5. Microturns resemble “split moves” in general game-playing research**

There is directly relevant MCTS literature on **split moves**: many games have moves composed of several decisions, and those decisions can be represented as lower-level moves; a generalized MCTS can operate over arbitrarily split moves.

This supports Claude’s Gap 4 diagnosis. Inner microturns are not second-class implementation details; they are the actual game decision protocol. `FOUNDATIONS.md` says every kernel-visible decision is atomic and compound turns emerge from sequences grouped by `turnId`, not from authoritative compound templates. So per-option preview at `chooseOne` / `chooseNStep` granularity is architecturally coherent.

### **6. Greedy rollout is known to be fragile; heavier rollout policies can help, but must be explicit**

MCTS variants distinguish light/random playouts from heavier, knowledge-guided playouts. Reviews note that “heavy” playouts add domain knowledge and can improve performance, but they increase complexity and can introduce bias; adaptive playout policies can increase playing strength, but some fast estimators such as RAVE can also be unreliable in particular games.

That maps to Claude’s Gap 3. Alphabetical greedy completion is not a neutral baseline. It is a deterministic but semantically arbitrary rollout policy. In FITL, it picks `aid` before `patronage`, which can make a synthetically completed Govern action look margin-neutral even when a sane ARVN policy would choose patronage.

### **7. Comparable tabletop frameworks use forward models, action masks, and game-agnostic agents**

TAG is a Java-based benchmark for modern tabletop-game AI with a common agent API, JSON-loaded game components, and logging for action space / branching-factor analysis. PyTAG emphasizes that modern tabletop games have arbitrary turn orders, hidden information, stochasticity, multiple win/loss conditions, deceptive scoring, and sparse rewards; its interface gives the current agent an observation plus an action mask.

TAG’s OSLA and MCTS agents are also instructive: OSLA tries all available actions using the forward model and picks the highest-scoring result; MCTS uses the forward model for rollouts. Your preview system is basically a deterministic, profile-driven, bounded OSLA/MCTS-lite layer over the kernel’s forward model. That is a legitimate architecture, but it needs explicit budget allocation and rollout policy.

---

# **Proposed architecture changes**

## **1. Replace `preview.topK` with a deterministic preview budget allocator**

Do **not** merely change the default from `4` to `10`. That improves FITL but preserves the circular dependency Claude identified: the gate still chooses candidates using move-only score before preview has had a chance to reveal candidate value.

Replace:

preview:  
 topK: 4

with a budget object more like:

preview:  
 budget:  
   strategy: balancedCoverage  
   fullCandidateCap: 8  
   shallowCandidateCap: 32  
   minPerActionId: 1  
   minPerStructuralGroup: 1  
   shallowDepthCap: 1  
   fullDepthCap: 8  
   widenOnUniformProjection: true

The exact names can differ, but the semantic model should be:

1. **Coverage pass**: select at least one candidate from each generic group.  
2. **Prior pass**: fill remaining full-preview slots using a non-preview prior.  
3. **Optional shallow pass**: run a cheap depth-1 preview for many or all candidates.  
4. **Full pass**: run bounded synthetic completion only for the selected set.  
5. **Widening pass**: if all full-preview candidates produce identical preview refs, widen deterministically if budget remains.

A good default candidate grouping would be engine-generic:

previewGroupKey =  
 actionId  
 + candidate kind  
 + target kind, if present  
 + parameter-shape signature  
 + event/card side tag, if represented generically as candidate metadata

The engine is allowed to group by `actionId` or candidate metadata as generic data. It must not know that `govern`, `train`, or `patronage` mean anything in FITL. That preserves engine agnosticism.

### **Why this fixes Gap 2**

Current `pickTopKByMoveOnlyScore` can select four alphabetically early candidates when all preview-derived candidates tie at move-only score. A budget allocator with group coverage ensures that preview-only strategies still sample the action space. It does not guarantee the best candidate is always previewed, but it removes the pathological “preview cannot influence who gets preview” loop.

### **Recommended deterministic selection order**

Within each group:

sort by:  
 1. priorScore descending  
 2. structuralImpactScore descending  
 3. stableMoveKey ascending

Across groups:

round-robin by:  
 1. group priority descending  
 2. group key ascending

No process-order iteration. No locale-sensitive comparison. No unseeded random shuffle. `FOUNDATIONS.md` explicitly prohibits dependence on ambient object order, system locale, wall clock, or nondeterministic process state.

---

## **2. Add a generic structural-impact prior**

The best pre-preview prior is not “move-only policy score.” It should include a **compiler-generated structural impact footprint**.

The compiler can conservatively attach read/write summaries to actions and microturn branches:

type EffectFootprint = {  
 writes: RefFootprint[];  
 reads: RefFootprint[];  
 mayTouchTokens: boolean;  
 mayTouchZones: readonly ZoneId[];  
 mayTouchVariables: readonly VarId[];  
 mayTouchScores: readonly ScoreId[];  
};

Then preview refs can expose their read footprint:

preview.victory.currentMargin.self  
 -> reads: [score/self victory metric, variables used by victory metric, token/zone counts used by victory metric]

The allocator can compute:

structuralImpactScore =  
 intersection(candidate.effectFootprint.writes, previewRef.readFootprint)

This remains game-agnostic because the engine is comparing generic references and dependency footprints, not interpreting FITL semantics. It also helps with Claude’s Gap 3: candidates whose effect branches may touch victory-margin inputs get budget before candidates that are structurally unlikely to affect requested preview refs.

Important caveat: this must be conservative. If the compiler cannot prove a candidate does **not** touch the preview ref, it should not assign zero impact. False positives cost preview time; false negatives recreate the current bug.

---

## **3. Replace retired `completion` scope with a modern `microturn` policy scope**

Claude’s Gap 5 is the most important authoring-surface problem. `agentGuided` exists, but it routes through `scopes: [completion]` and `option.value`, which the cookbook tells authors not to use. Therefore cookbook-compliant `agentGuided` collapses back to greedy.

Do not “un-deprecate” the old surface unchanged. `FOUNDATIONS.md` says no backwards compatibility shims or deprecated fallbacks in production; when a contract changes, owned artifacts should be migrated and unused code deleted. General API-deprecation practice also expects a deprecation note to explain the reason and what to use instead; a deprecation with no replacement is a design smell.

Create a new explicit scope:

scopes: [microturn]

with refs like:

microturn.kind  
microturn.decisionKey  
microturn.actorSeat  
microturn.option.value  
microturn.option.index  
microturn.option.stableKey  
microturn.option.tags  
microturn.option.targetKind  
microturn.remainingRequiredCount  
microturn.remainingMaxCount

The semantics should be:

A `microturn` consideration evaluates only against the **currently published atomic decision frontier**, never against unpublished sub-decisions.

That makes it consistent with Foundation #19.

Example profile intent:

- id: preferPatronageWhenPublished  
 scopes: [microturn]  
 when:  
   all:  
     - eq: [microturn.kind, chooseOne]  
     - eq: [microturn.decisionKey, governMode]  
     - eq: [microturn.option.value, patronage]  
 weight: 10

That is game-specific profile data, not engine-specific game logic. The engine only evaluates generic refs and comparisons.

### **Migration rule**

In the same spec/change:

1. add `microturn` scope;  
2. migrate all owned `completion`-scope profile entries to `microturn`;  
3. make `completion` scope fail compilation for shipped/current profiles;  
4. delete or isolate old `completion` code paths;  
5. update cookbook to say: “use `microturn` for published inner decisions.”

No long-lived alias. No `_legacy`. No quiet fallback.

---

## **4. Rename / redefine `agentGuided` as `policyGuided`**

The current name `agentGuided` is misleading if the implementation does not actually run the modern agent policy. I would replace it with:

preview:  
 completionPolicy: policyGuided

Semantics:

policyGuided:  
 At each synthetic inner microturn, score the published options using  
 microturn-scope considerations, choose the highest-scoring legal option,  
 break ties deterministically, then continue until terminal/actionSelection/depth cap.

This is not recursion into full action-selection preview. It is local frontier scoring. That keeps boundedness intact.

Fallbacks should be explicit:

preview:  
 completionPolicy: policyGuided  
 fallbackCompletionPolicy: greedy

Trace should record when fallback happened. Silent fallback is how Gap 3 and Gap 5 hide.

---

## **5. Add per-option preview for inner microturns**

Claude is right that action-level preview alone cannot answer “should I choose `aid` or `patronage` now?” Inner `chooseOne` / `chooseNStep` decisions currently show `previewUsage.mode: "disabled"` everywhere, so the agent has no preview signal at the actual option frontier.

Add opt-in inner preview:

preview:  
 inner:  
   chooseOne: true  
   chooseNStep: true  
   maxOptions: 12  
   chooseNBeamWidth: 2  
   depthCap: 6

### **`chooseOne`**

For each legal option:

1. apply the option to a draft state;  
2. drive the rest of the current compound turn with `policyGuided` or `greedy`;  
3. resolve the configured preview refs;  
4. expose per-option preview features.

Possible refs:

preview.option.victory.currentMargin.self  
preview.option.delta.victory.currentMargin.self  
preview.option.driveDepth  
preview.option.outcome

Then a microturn-scope policy can say:

- id: preferOptionProjectedMargin  
 scopes: [microturn]  
 weight: 300  
 feature: preview.option.victory.currentMargin.self

### **`chooseNStep`**

Do **not** enumerate all combinations. That violates boundedness on large option sets.

Use marginal or beam preview:

For each currently legal next option:  
 apply option  
 complete remaining chooseN steps with policyGuided  
 score projected refs

If beamWidth > 1:  
 retain top B partial selections at each step

This mirrors the split-move insight from game-playing research: lower-level decisions can be searched directly instead of pretending the compound move is atomic.

---

## **6. Change preview success metrics: `ready` is not enough**

Claude’s Gap 3 is a diagnostic failure as much as an evaluation failure. A preview can be `ready` and still useless if all ready candidates produce the same projected value. The report’s FITL example has all nine candidates ready, different drive depths, and identical projected self margin.

Add decision-level metadata:

previewUsage: {  
 mode,  
 evaluatedCandidateCount,  
 outcomeBreakdown,

 readyRefStats: {  
   "victory.currentMargin.self": {  
     readyCount,  
     distinctValueCount,  
     min,  
     max,  
     range,  
     allReadyValuesEqual,  
   }  
 },

 utility: "none" | "constant" | "lowInformation" | "differentiating",  
 widenedBecauseUniform: boolean,  
 completionPolicyFallbackCount: number,  
}

Candidate-level metadata:

candidate.preview: {  
 selectedForPreview: boolean,  
 selectionReason: "coverage" | "prior" | "shallowDelta" | "widening" | "cache",  
 priorScore: number,  
 structuralImpactScore: number,  
 shallowPreviewScore?: number,  
 fullPreviewOutcome,  
 resolvedRefs,  
 driveDepth,  
 completionPolicy,  
 fallbackUsed,  
}

A `ready` rate above 80% should no longer be the headline metric. The headline should be:

readyDifferentiatingDecisionRate

or:

percentage of actionSelection decisions where at least one requested preview ref  
has distinct ready values across viable candidates

That directly measures whether preview is improving ranking.

---

## **7. Add synthetic-decision trace**

For every preview drive, verbose traces should include the inner choices made by the completion policy:

{  
 "candidateStableMoveKey": "...",  
 "previewDrive": {  
   "policy": "policyGuided",  
   "depth": 4,  
   "syntheticDecisions": [  
     {  
       "depth": 1,  
       "microturnKind": "chooseOne",  
       "decisionKey": "governMode",  
       "selectedOptionStableKey": "patronage",  
       "selectionReason": "microturnPolicy",  
       "score": 10,  
       "scoreContributions": [  
         {  
           "considerationId": "preferPatronageWhenPublished",  
           "value": 1,  
           "weight": 10,  
           "contribution": 10  
         }  
       ]  
     }  
   ]  
 }  
}

This would immediately reveal whether a Govern preview chose `aid` because of greedy alphabetical fallback or `patronage` because of policy guidance.

---

## **8. Fix inner-frontier trace contributions**

Claude’s Gap 6 is straightforward and worth doing early. Inner `chooseOne` / `chooseNStep` candidates currently show final scores but `scoreContributions: []`, even when a completion-scope consideration fired.

Mirror the action-selection trace shape for all frontier decisions:

type CandidateTrace = {  
 stableMoveKey: string;  
 score: number;  
 scoreContributions: ScoreContribution[];  
 previewRefIds: string[];  
 unknownPreviewRefs: string[];  
 prunedBy: string[];  
};

Make it conditional on verbose tracing if trace size is a concern. But do not leave inner decisions opaque; that makes policy evolution blind.

---

## **9. Add preview-result caching, but key it carefully**

Caching can reduce the cost of better coverage, but the key must include all semantics-affecting inputs:

previewCacheKey =  
 canonicalStateDigest  
 + observerMode  
 + playerId / seatId  
 + stableMoveKey  
 + previewRefSetHash  
 + completionPolicyHash  
 + microturnPolicyHash  
 + depthCap  
 + hiddenInformationMode  
 + stochasticHandlingMode

Do not key only by `stableMoveKey`; the same candidate in a different state can have a different result.

Also, do not let hash equality become the correctness oracle. `FOUNDATIONS.md` says hashes may accelerate comparison, but canonical serialized state remains the source of truth for equality.

---

# **Recommended implementation sequence**

## **Phase 1 — Observability first**

Do this before changing selection behavior.

1. Add `readyRefStats`.  
2. Add `preview.utility`.  
3. Add `selectionReason` for previewed/gated candidates.  
4. Add synthetic-decision trace for preview drives.  
5. Add inner-frontier `scoreContributions`.

This gives Claude enough visibility to distinguish “preview did not run,” “preview ran but was uniform,” “policyGuided fell back to greedy,” and “candidate was excluded by budget.”

## **Phase 2 — Replace the circular gate**

Implement `balancedCoverage` budget allocation:

Input:  
 candidates  
 fullCandidateCap  
 minPerActionId  
 structuralImpactScore  
 priorScore

Algorithm:  
 1. group candidates by generic previewGroupKey  
 2. select one candidate per group until cap exhausted  
 3. fill remaining slots by priorScore + structuralImpactScore  
 4. preserve deterministic stable tie-breaks

Keep the old `topK` only as a migrated config field during the same branch, then delete it before merging if you are following Foundation #14 strictly.

## **Phase 3 — Add `microturn` scope and migrate profiles**

Add the new authoring surface. Then migrate:

scopes: [completion]  
option.value  
decision.name

to:

scopes: [microturn]  
microturn.option.value  
microturn.decisionKey

This is the clean replacement for the retired surface. It also makes `policyGuided` meaningful.

## **Phase 4 — Add `policyGuided` completion**

Make preview completion use local microturn scoring:

score currently published options  
choose best option  
apply  
repeat until boundary/depth cap

Trace every synthetic decision.

## **Phase 5 — Add inner per-option preview**

Start with `chooseOne`. Do `chooseNStep` after that, with a beam or marginal evaluator. `chooseOne` will likely solve the Govern `aid`/`patronage` class of bugs immediately, and it is easier to bound.

## **Phase 6 — Add caching and perf budgets**

Only add caching after trace semantics are stable. Otherwise you risk caching opaque wrongness.

---

# **Specific recommendations to send Claude**

## **Recommendation A: reject “just bump `topK`”**

`topK: 10` is a useful diagnostic, not the architecture. It improved readiness but still left uniform projections and does not solve preview-needed candidates being gated out.

Better replacement:

preview:  
 budget:  
   strategy: balancedCoverage  
   fullCandidateCap: 8  
   shallowCandidateCap: 32  
   minPerActionId: 1  
   minPerStructuralGroup: 1  
   widenOnUniformProjection: true

## **Recommendation B: make preview allocation diversity-aware**

At minimum, one candidate per `actionId` should be previewed before second candidates from the same `actionId`, unless the candidate count is already below the cap.

This single change attacks the worst circularity. It means a dominant move-only preference like `preferGovernWeighted` cannot monopolize preview budget before preview has any chance to compare Govern against Train/Sweep/Assault/etc.

## **Recommendation C: add shallow preview as a first pass**

A cheap depth-1 pass over all candidates is likely valuable:

For every candidate:  
 apply candidate only  
 stop at next published microturn/actionSelection  
 collect immediate ref deltas and structural next-frontier metadata

Then run full synthetic completion only for the best candidates by:

coverage + structural impact + shallow delta + prior

This resembles best-arm / sequential-halving thinking more than static top-K.

## **Recommendation D: treat alphabetical greedy as diagnostic fallback, not the default quality policy**

`greedy` should remain available because it is deterministic and useful for baselines. But the default for serious preview should be `policyGuided`, once `microturn` scope exists.

Trace should loudly say:

"completionPolicy": "greedy",  
"projectionUtility": "constant",  
"allReadyValuesEqual": true

when greedy produces uniform projected values.

## **Recommendation E: replace `agentGuided` with `policyGuided`**

`agentGuided` currently sounds stronger than it is. If it silently falls back to greedy when deprecated completion-scope rules are absent, it is actively misleading.

Use:

preview:  
 completionPolicy: policyGuided

and make it fail or warn structurally if no `microturn` considerations are available and no explicit fallback was configured.

## **Recommendation F: add modern microturn refs**

Minimum viable set:

microturn.kind  
microturn.decisionKey  
microturn.actorSeat  
microturn.option.value  
microturn.option.index  
microturn.option.stableKey  
microturn.option.tags  
microturn.option.targetKind

Optional later:

microturn.selection.countSoFar  
microturn.selection.remainingMin  
microturn.selection.remainingMax  
microturn.option.effectFootprint

## **Recommendation G: add per-option preview only for published options**

Do not preview unpublished internal branches. Preview only the current legal option frontier. That keeps it aligned with the microturn-native contract.

## **Recommendation H: do not hardcode FITL strategy**

No engine code should know that ARVN likes `patronage`. That belongs in YAML profile data through generic refs. `FOUNDATIONS.md` is explicit that the kernel/compiler/runtime cannot contain game-specific logic.

---

# **Tests Claude should write first**

These are the tests I would ask Claude to implement before touching production code.

## **1. Preview-only profile does not collapse to alphabetical top-K**

Construct a generic test game with 12 action-selection candidates:

all move-only scores = 0  
candidate 11 improves preview margin  
candidate 11 is alphabetically late  
preview budget < 12

Expected:

balancedCoverage selects candidate 11 if it is in a distinct action/structural group  
old topK would not

## **2. Diversity beats duplicate action-family saturation**

Construct candidates:

6 candidates actionId=A  
1 candidate actionId=B  
1 candidate actionId=C  
budget=4

Expected:

previewed groups include A, B, C before selecting a second A

## **3. Uniform projection is detected**

Use a game where all previewed candidates resolve to the same margin.

Expected metadata:

"readyRefStats": {  
 "victory.currentMargin.self": {  
   "distinctValueCount": 1,  
   "allReadyValuesEqual": true  
 }  
},  
"utility": "constant"

## **4. `policyGuided` does not silently equal greedy**

Create a `chooseOne` with options:

aid  
patronage

with a microturn-scope consideration preferring `patronage`.

Expected synthetic trace:

"completionPolicy": "policyGuided",  
"selectedOptionStableKey": "patronage",  
"scoreContributions": [  
 { "considerationId": "preferPatronageWhenPublished" }  
]

## **5. Cookbook-compliant profile can guide completion**

Profile uses only:

scopes: [microturn]  
microturn.option.value  
microturn.decisionKey

Expected:

preview.completionPolicy=policyGuided uses the rule  
no completion-scope refs required

## **6. Old completion-scope surface is rejected or fully migrated**

A shipped/current profile using:

scopes: [completion]  
option.value

should fail compilation after migration, unless it is in a version-pinned historical fixture. This follows the no-compatibility-shim rule.

## **7. Inner `chooseOne` per-option preview differentiates options**

Construct:

option A leaves margin unchanged  
option B increases margin by 1

Expected:

preview.option.delta.victory.currentMargin.self differs  
agent can score option B higher

## **8. `chooseN` preview stays bounded**

Create a `chooseN` with many legal options.

Expected:

preview evaluates at most maxOptions * beamWidth * depthCap synthetic steps  
trace records pruning/beam reasons

## **9. Hidden information does not leak**

In non-omniscient mode, create a hidden variable/card that would affect preview if seen.

Expected:

preview outcome is unknownHidden or uses observer projection  
no full-state value appears in candidate refs

This protects Foundation #4.

## **10. Cached and uncached preview are byte-identical**

Run the same GameDef, state, seed, and actions twice:

first run cold cache  
second run warm cache

Expected:

same decision  
same preview metadata  
same canonical serialized state

This protects determinism and replayability.

---

# **What I would explicitly not do**

## **Do not implement full MCTS inside policy evaluation**

MCTS is the right research analogy, not necessarily the right implementation. Full tree search with repeated rollouts can be expensive, hard to trace, and hard to integrate with profile evolution. Your app wants deterministic, explainable, YAML-authored policies.

Borrow:

budget allocation  
coverage  
priors  
widening  
root best-arm thinking

Do not blindly import:

large stochastic rollout counts  
opaque value backup  
self-play policy networks

## **Do not keep `completion` scope as a “deprecated but useful” production feature**

That conflicts with Foundation #14. Replace it with `microturn` scope and migrate.

## **Do not treat `ready` as success**

A preview system that returns `ready` with a constant projected margin is not helping policy quality. Claude’s report shows exactly this failure.

## **Do not make synthetic completion choose alphabetically unless the trace says so**

Alphabetical legality precedence is deterministic, but it is not a policy. It should be a fallback with a visible trace reason, not the default behavior for quality-sensitive preview.

---

# **Priority order**

1. **Trace and diagnostics**: expose projection utility, synthetic decisions, and inner score contributions.  
2. **Budget allocator**: replace move-only `topK` with balanced coverage plus priors.  
3. **Microturn scope**: add modern published-frontier refs and migrate away from `completion`.  
4. **Policy-guided completion**: make synthetic completion use microturn-scope policy.  
5. **Inner `chooseOne` preview**: add per-option projected refs.  
6. **`chooseNStep` beam preview**: add bounded multi-option handling.  
7. **Caching**: optimize after semantics are observable and tested.

The core architectural correction is this:

Preview selection, synthetic completion, and inner-option scoring must all operate on the same published microturn protocol. Anything else recreates a hidden compound-action layer, which `FOUNDATIONS.md` explicitly moved away from.

