# **Proposal: Spec 161 — `chooseNStep` per-option preview via forced-first-step continuation beams**

My recommendation is firm: implement **Interpretation X**, but phrase it more precisely as **root-option value estimation using a continuation beam**. Do **not** rubber-stamp `beam.best.partialSelection[0]` as the agent’s decision, and do **not** expose one shared `resolvedRefs` map to every option. Both would be semantically misleading.

The uploaded gap report shows this is not a broken beam-search implementation. The beam driver exists, the compiler accepts `preview.inner.chooseNStep: true`, but the runtime never invokes the driver from `chooseFrontierDecision`; the result is a silent no-op with no warning or trace evidence. The deeper problem is shape mismatch: `chooseOne` preview returns a per-option map, while the current `chooseNStep` beam returns full-path results whose refs are evaluated at the end of a sequence, not per first-step option.

The foundations push toward a root-cause fix: no hacks, no hidden compatibility shims, bounded deterministic execution, immutable state transitions, compiler validation for statically knowable constraints, and tests as proof. The kernel’s decision model also matters: every client-visible decision is atomic, legal, constructible, and published at microturn scope.

## **Why this aligns with external research**

General-game platforms converge on the same broad architecture: expose a generic state/action protocol, let agents inspect legal actions, and advance states through a forward model. OpenSpiel supports many game classes, including turn-taking, simultaneous-move, perfect-information, and imperfect-information games; its API exposes state cloning, applying actions, legal-action enumeration, observations, and information states. TAG similarly centers tabletop-game AI around a forward model that can compute available actions and advance state, and explicitly tracks action-space size, branching factor, hidden information, copy speed, and game length as AI-relevant metrics. Ludii’s ludemic system likewise frames general-game play around concise game descriptions with generality, extensibility, understandability, and efficiency as key goals.

The most relevant paper is **Split Moves for Monte-Carlo Tree Search**. It states that many games have moves made of several player decisions, and that those decisions can be treated as separate lower-level moves; it also finds split design can benefit both single-action and multi-action games. That is almost exactly LudoForge’s `chooseNStep` situation. The lesson is not “collapse the microturn sequence back into a macro-action.” The lesson is: preserve split decisions, but compute a useful value for the current root decision.

So the right model is:

At a `chooseNStep` microturn, every legal ADD or CONFIRM command is a root option. Preview may search continuations behind each root option, but the actual decision still flows through the same microturn-scope policy evaluator as `chooseOne`.

That preserves Foundation #19’s atomic-decision protocol and the existing `preview.option.*` semantics.

## **Recommended semantics**

Define `preview.inner.chooseNStep: true` as:

For each currently published `chooseNStep` option, run a bounded preview that first forces that option, then searches or completes the remaining microturn sequence under the configured completion policy. Resolve `preview.option.*` refs against the best resulting state for that forced root option. Feed those refs back into the normal microturn evaluator keyed by the root option’s stable key.

This is a **hybrid**, but not a compromise: the beam is a value oracle, not the decision-maker.

For a root ADD option:

1. Clone or draft the current state.  
2. Apply exactly that ADD decision.  
3. If the resulting frontier is still inside the same `chooseNStep`, run a bounded continuation beam for `depthCap - 1`.  
4. If the resulting frontier leaves the `chooseNStep`, run the existing synthetic completion driver.  
5. Resolve `preview.option.*` refs from the best reached continuation state.  
6. Store the refs under the original root ADD option’s stable key.

For a root CONFIRM option:

1. Clone or draft the current state.  
2. Apply CONFIRM.  
3. Run synthetic completion, if the compound turn continues.  
4. Resolve refs and store them under the CONFIRM stable key.

Then the existing microturn evaluator scores each root option with its own ref map.

That makes `chooseNStep` behave like `chooseOne` from the profile author’s perspective: `preferOptionProjectedMargin` works for both, because each option sees its own projected state. The uploaded report already identifies this as the behavior that matches the `chooseOne` integration and the documented “per-option preview at inner microturns” framing.

## **Why not beam rubber-stamping?**

Reject it.

A direct beam-rubber-stamp mode would run one beam and pick `best.partialSelection[0]`. That is cheaper, but it creates inconsistent semantics: `chooseOne` uses authored microturn considerations, while `chooseNStep` bypasses them. The uploaded report correctly notes that this would make microturn-scope considerations inconsistent across `chooseOne` and `chooseNStep`.

It also weakens explainability. The trace would say “the beam chose this,” but the agent DSL would not explain why a particular root option won. That violates the spirit of the engine’s replay/telemetry/auditability foundation.

A direct beam mode can exist later, but only as an explicit, separate mode such as:

preview:  
 inner:  
   chooseNStep:  
     mode: directBeamRecommendation

It should not be the meaning of today’s `preview.inner.chooseNStep: true`.

## **Cost-cap design**

The current triple product is insufficient for the recommended semantics:

maxOptions * chooseNBeamWidth * depthCap <= INNER_PREVIEW_HARD_CAP

That bound applies to one beam, not to one forced-first-step beam per root option. The true bound is closer to:

rootOptionCap * (1 + chooseNBeamWidth * branchOptionCap * max(0, depthCap - 1))

If you keep the existing single `maxOptions` field for both root and continuation options, the conservative formula becomes:

maxOptions * (1 + chooseNBeamWidth * maxOptions * max(0, depthCap - 1))  
 <= INNER_PREVIEW_HARD_CAP

For the ARVN settings in the report:

8 * (1 + 1 * 8 * 3) = 200

The report estimated 192 without counting root applications; either number is under 256, but the compiler should use the more conservative bound. The uploaded report already flags the squared-cost problem and the need for a new or tightened cap.

My preferred DSL shape is not to overload `maxOptions` forever. Because Foundation #14 says no compatibility shims, I would migrate the owned profiles and make the config explicit:

preview:  
 mode: exactWorld  
 completion: policyGuided  
 fallbackCompletionPolicy: fail  
 inner:  
   chooseOne:  
     enabled: true  
     optionCap: 8

   chooseNStep:  
     enabled: true  
     mode: perOptionContinuationBeam  
     rootOptionCap: 8  
     branchOptionCap: 8  
     beamWidth: 1  
     depthCap: 4  
     hardNodeCap: 256

If that is too much churn for Spec 161, keep the boolean surface for now but lower it internally into a normalized config with explicit derived fields. The important part is that the compiler validates the correct cost formula and the trace reports the effective caps.

At runtime, if the actual legal frontier exceeds `rootOptionCap` or `branchOptionCap`, do not silently behave as if the missing options did not exist. Deterministically evaluate the first N options in stable order, and emit trace fields like:

rootCandidateCount: 13,  
rootEvaluatedCount: 8,  
rootSkippedCount: 5,  
rootCap: 8,  
branchCap: 8,  
capped: true

That keeps computation bounded while preserving auditability.

## **Proposed implementation**

### **1. Extract the chooseNStep preview runner**

`policy-preview-inner.ts` is already near the file-size ceiling. Do not stuff another 150–250 lines into it. Create a sibling file:

packages/engine/src/agents/policy-preview-inner-choosenstep.ts

Export:

export interface RunChooseNStepInnerPreviewInput extends InnerPreviewBaseInput {  
 readonly microturn: ChooseNStepMicroturn;  
 readonly rootOptionCap: number;  
 readonly branchOptionCap: number;  
 readonly beamWidth: number;  
 readonly depthCap: number;  
}

export interface ChooseNStepInnerPreviewResult {  
 readonly decision: ChooseNStepDecision;  
 readonly stableMoveKey: string;  
 readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;  
 readonly outcome: PolicyPreviewTraceOutcome;  
 readonly driveDepth: number;  
 readonly continuationBeam?: ChooseNStepBeamPreviewRun;  
 readonly previewDrive?: PolicyPreviewDriveTrace;  
 readonly completionPolicyFallbackCount: number;  
}

export interface ChooseNStepInnerPreviewRun {  
 readonly options: readonly ChooseNStepInnerPreviewResult[];  
 readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;  
 readonly rootCandidateCount: number;  
 readonly rootEvaluatedCount: number;  
 readonly rootSkippedCount: number;  
 readonly evaluatedCandidateCount: number;  
 readonly capped: boolean;  
}

export function runChooseNStepInnerPreview(  
 input: RunChooseNStepInnerPreviewInput,  
): ChooseNStepInnerPreviewRun;

Use the existing `runChooseNStepBeamPreview` as the continuation evaluator, but do not expose its `best.resolvedRefs` globally. Only expose the best continuation refs for the root option that was forced.

### **2. Add the runtime adapter**

Add `createPolicyAgentChooseNStepInnerPreview` beside `createPolicyAgentChooseOneInnerPreview`.

It should:

1. Guard on `input.microturn.kind === 'chooseNStep'`.  
2. Guard on `resolvedProfile.profile.preview.inner?.chooseNStep === true` or the new normalized config.  
3. Collect `preview.option.*` refs from microturn-scope considerations.  
4. Run `runChooseNStepInnerPreview`.  
5. Return the same structural shape as the `chooseOne` adapter:

{  
 run,  
 refIds,  
 usage,  
 byOptionKey,  
 refsByOptionKey,  
}

The uploaded report already identifies this missing adapter and the fact that downstream code can accept the same common shape.

### **3. Dispatch by microturn kind in `chooseFrontierDecision`**

Replace the current chooseOne-only integration with:

const innerPreview =  
 input.microturn.kind === 'chooseOne'  
   ? createPolicyAgentChooseOneInnerPreview(input, resolvedProfile)  
   : input.microturn.kind === 'chooseNStep'  
     ? createPolicyAgentChooseNStepInnerPreview(input, resolvedProfile)  
     : undefined;

This is the actual missing runtime integration. The report shows the current path calls `createPolicyAgentChooseOneInnerPreview` unconditionally, meaning `chooseNStep` receives no `previewOptionResolvedRefsByOptionKey`.

### **4. Fix compiler diagnostics**

The compiler currently validates the `chooseNStep` flag and the old triple product, but it does not warn that `chooseNStep: true` has no useful `preview.option.*` microturn consideration.

Add warning parity:

CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION

Fire it for both:

preview.inner.chooseOne: true  
preview.inner.chooseNStep: true

when no microturn-scope consideration references `preview.option.*`.

Also add a **compile-time error** for impossible cost settings under the corrected formula. This is statically knowable from the profile config, so Foundation #12 says it belongs in the compiler.

### **5. Trace shape**

A good trace is not optional. The current failure is painful precisely because the flag was accepted and then disappeared.

For each `chooseNStep` microturn with inner preview enabled, emit:

previewUsage: {  
 mode: 'exactWorld',  
 innerKind: 'chooseNStep',  
 innerMode: 'perOptionContinuationBeam',  
 utility: 'varied' | 'constant' | 'unavailable',  
 refIds: [...],  
 rootCandidateCount,  
 rootEvaluatedCount,  
 rootSkippedCount,  
 evaluatedCandidateCount,  
 capped,  
 beamWidth,  
 depthCap,  
 branchOptionCap,  
 outcomeBreakdown,  
 completionPolicyFallbackCount,  
}

Each option trace should include:

{  
 stableMoveKey,  
 decisionKind: 'add' | 'confirm',  
 outcome,  
 resolvedRefs,  
 driveDepth,  
 continuationPartialSelectionStableKeys,  
 continuationScore,  
}

The trace should make three things obvious: the flag fired, which root options were evaluated, and whether the resulting utility actually differentiated options.

## **Tests to write first**

The test suite should prove architecture, not profile quality.

1. **Red test for the current bug**  
    Build a profile with `preview.inner.chooseNStep: true` and a microturn-scope `preview.option.*` consideration. Drive a state with a `chooseNStep` frontier. Assert `previewUsage.mode !== 'disabled'` and `refsByOptionKey.size > 0`.  
2. **Per-root-option coverage**  
    For a chooseN frontier with ADD A, ADD B, and CONFIRM, assert all three root options get exactly one preview result keyed by stable move key.  
3. **Per-option differentiation**  
    Construct a small game-agnostic fixture where ADD A and ADD B lead to different resolved refs. Assert the microturn evaluator sees different `preview.option.*` values.  
4. **Default-off invariant**  
    With `chooseNStep` omitted or false, assert trace remains disabled and behavior is byte-identical to the previous path.  
5. **Replay identity**  
    Same GameDef, same initial state, same seed, same actions: canonical serialized state and trace must match exactly.  
6. **Budget enforcement**  
    A profile whose corrected formula exceeds `INNER_PREVIEW_HARD_CAP` must fail compilation.  
7. **Runtime cap trace**  
    A state with more legal root options than `rootOptionCap` must evaluate only the deterministic prefix and emit skipped/capped counts.  
8. **Hidden-info safety**  
    In a hidden-information fixture, `observer: currentPlayer` must not let preview refs inspect full hidden state unless the mode explicitly permits omniscient analysis. This matches Foundation #4.  
9. **Fallback-fail invariant**  
    With `preview.completion: policyGuided` and `fallbackCompletionPolicy: fail`, force a guided completion failure. The drive must produce a non-ready failure outcome, not `ready` plus a fallback count.

The uploaded report’s proposed test list is directionally right, but I would add the budget, hidden-info, and fallback-fail tests as blockers.

## **`fallbackCompletionPolicy: fail`**

My read: this is either a bug or a telemetry lie. Both are bad.

The report says `completionPolicyFallbackCount: 33` appeared while every drive still returned `ready` under `fallbackCompletionPolicy: fail`. If “fail” means “do not fall back to greedy,” then a fallback event should make the preview outcome non-ready. If the counter means something else, rename it. Do not leave an operator-facing field whose natural reading contradicts the outcome.

Define the invariant this way:

if (completion === 'policyGuided' && fallbackCompletionPolicy === 'fail') {  
 assert(completionPolicyFallbackCount === 0 || outcome !== 'ready');  
}

Better trace naming:

policyGuidedUnmatchedDecisionCount  
greedyFallbackAppliedCount  
fallbackBlockedByPolicyCount

Then only `greedyFallbackAppliedCount` is a true fallback.

## **Hidden information: do not jump to MCTS yet**

ISMCTS and POMCP are relevant future work, not the immediate fix. ISMCTS searches information-set trees instead of plain state trees for hidden-information games. POMCP combines belief updates with Monte Carlo tree search and only needs a black-box simulator, which makes it attractive for a generic kernel.

But implementing ISMCTS/POMCP now would be the wrong move for this bug. The current feature is a deterministic, bounded, declarative preview-ref system. It needs a missing adapter and a clarified value semantics, not a new stochastic planner. A future mode could be:

preview:  
 mode: beliefSampled  
 samples: 32  
 seedPolicy: deterministicFromGameState

That future mode must be explicit because hidden-info behavior changes meaningfully. It must sample from observer-consistent beliefs, not peek at authoritative state.

## **Adjacent audit**

The same failure pattern is dangerous:

compiler accepts field + docs claim support + runtime never reads it + trace stays silent.

Run this audit as part of Spec 161:

rg "preview.inner|chooseNStep|chooseOne|run.*Preview|createPolicyAgent|emptyPreviewUsage|fallbackCompletionPolicy|completionPolicyFallbackCount|previewUsage.mode|collectMicroturnPreviewOptionRefs" packages/engine/src packages/engine/test

rg "profile.preview" packages/engine/src/agents packages/engine/src/cnl

rg "export function run.*Preview" packages/engine/src/agents

rg "CNL_COMPILER_AGENT_.*PREVIEW|NO_OPTION_CONSIDERATION|fallbackCompletionPolicy" packages/engine/src/cnl packages/engine/test

rg "emptyPreviewUsage(|mode: 'disabled'|mode: "disabled"" packages/engine/src/agents

Then add a structural test that enumerates compiled preview config fields and verifies one of these is true for every field:

1. It has a runtime consumer.  
2. It has a compiler diagnostic that forbids it.  
3. It is explicitly trace-only and tested as such.

This kind of coverage test would have caught `chooseNStep`.

## **Spec packaging**

Make this **one spec**, not two.

Splitting “runtime integration” from “cost-cap semantics” is exactly how this gap happened. Spec 161 should not be marked complete until it includes:

1. Semantics: `chooseNStep` means per-root-option refs, not direct beam recommendation.  
2. Cost formula: corrected compile-time hard cap.  
3. Runtime: adapter + dispatch.  
4. Diagnostics: warning parity and no silent no-op.  
5. Trace: per-option and aggregate preview evidence.  
6. Tests: red bug test, replay identity, default-off, budget, fallback-fail.

It can be decomposed into tickets, but the spec is one architectural unit.

## **Ranked options**

| Rank | Option | Verdict |
| ----- | ----- | ----- |
| 1 | **Per-root-option forced continuation beam** | Best solution. Preserves microturn uniformity, `preview.option.*` semantics, determinism, boundedness, and author control. |
| 2 | Compile-time reject `chooseNStep: true` until Spec 161 lands | Acceptable emergency honesty patch only. Better than silent no-op, but not architecturally complete. |
| 3 | Future `beliefSampled` / ISMCTS / POMCP mode | Valuable future research path for hidden-info games, but too large and semantically different for this fix. |
| 4 | Direct beam rubber-stamp | Reject. Inconsistent with `chooseOne`, bypasses microturn considerations, weaker trace explainability. |
| 5 | Quick shared-ref wire-through | Reject hard. Every option sees the same refs, so `preview.option.*` cannot differentiate options. |

## **Final recommendation**

Implement **Spec 161: chooseNStep inner preview as per-root-option continuation-beam scoring**.

The design should treat the existing `runChooseNStepBeamPreview` as a continuation evaluator, not as the agent’s decision function. For each currently legal ADD/CONFIRM root option, force that option, run a bounded continuation, resolve refs, and feed those refs into the existing microturn policy evaluator keyed by stable option key. Add the missing runtime adapter, correct the cost cap, emit real trace evidence, and lock it down with replay and architectural-invariant tests.

That is the cleanest solution because it fixes the actual integration gap while preserving the deeper architectural commitments: game-agnostic kernel behavior, atomic microturn decisions, deterministic bounded computation, declarative refs, observer-safe preview, and test-proven correctness.

