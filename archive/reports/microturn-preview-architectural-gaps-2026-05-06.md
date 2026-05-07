# Microturn Preview — Architectural Gaps and Open Questions

**Date**: 2026-05-06
**Author**: Improve-loop investigation during `fitl-arvn-agent-evolution` campaign restart
**Trigger**: User question — "in your experiments with the new preview capabilities for this microturn structure, do you have reasons to believe there are bugs or architectural gaps in the implementation?"
**Engine state**: post-Spec-145 (`bounded-synthetic-completion-preview`), post-Spec-146 (`scoped-draft-state-for-preview-drive`), post-Spec-151, post-Spec-154
**Goal**: Catalog observed gaps with concrete trace evidence and propose solution directions for external research (search for relevant academic literature and other engine implementations).

---

## TL;DR

After Spec 145 landed, the agent-side preview pipeline now resolves `previewOutcome: ready` for action-selection candidates instead of `unresolved` — that part of the rework works. However, two campaign-restart experiments (`exp-001`, `exp-002`, summarized below) plus direct trace inspection surface **six architectural gaps** that compound to limit how much policy-quality lift the rework actually delivers:

1. **Default `preview.topK = 4` is too tight for FITL-shaped games** (10–13 candidates per action-selection are typical). Default leaves 64% of candidates `gated` (verified: 36% ready rate on baseline; 75% on `topK: 10`).
2. **The top-K gating heuristic is circular**: it ranks candidates by *move-only score* (no preview), then gates everything below rank `K`. Candidates that need preview to be ranked correctly are precisely the ones gated out before preview runs.
3. **`greedy` completion produces uniform projected margins for ~33% of decisions** even when all candidates resolve to `ready`. Preview is "ready" but the synthetic completion picks alphabetical options (e.g., govern → `aid` mode for FITL), which often don't change the margin-driving variables. The completion drove successfully but the *projection* is degenerate.
4. **Inner microturns (`chooseOne`, `chooseN`) get no preview at all**: `previewUsage.mode: "disabled"` everywhere on the inner frontier. The only mechanism for differentiating per-option preference is `scopes: [completion]` considerations.
5. **`agentGuided` completion depends on the retired authoring surface**: it invokes `selectBestCompletionChooseOneValue`, which evaluates `scopes: [completion]` considerations — the very surface the cookbook (`docs/agent-dsl-cookbook.md:127-144`) tells operators not to use. There is no working modern surface for "during preview, ARVN should pick patronage, not aid."
6. **Trace diagnostic gap**: chooseOne / chooseNStep candidates always have `scoreContributions: []` in the agent-decision trace, even when a completion-scope consideration matched and produced a non-zero score. The actual scoring happens in `selectBestCompletionChooseOneValue` but is never surfaced.

Issues #2, #3, and #5 are the load-bearing ones for policy quality. #1 and #4 are tractable. #6 is a tooling gap that makes the others harder to debug.

---

## Context — How the gaps surfaced

### Campaign background

`campaigns/fitl-arvn-agent-evolution/` is an iterative-improvement campaign optimizing a Fire in the Lake policy agent (ARVN seat). The prior campaign halted on 2026-04-25 specifically because of this defect (musings cite "preview unresolved/notDecisionComplete for every action-selection candidate", caught via traces showing 173/196 = 88% of decisions tied at score 0). Spec 145 was authored in response and has since been implemented and merged.

When the campaign was restarted on 2026-05-06, the user asked the loop to test prior anti-preview lessons against the reworked engine, since Spec 145 + 146 + 151 + 154 expanded the preview pipeline.

### Concrete observations (campaign restart — 2 experiments before halt)

| exp | change | compositeScore | preview ready rate | decisions differentiated |
|-----|--------|---------------:|-------------------:|-------------------------:|
| baseline | (current main) | -10 | 95/263 = 36.1% | 1/5 non-coup |
| exp-001 | re-add `preferPatronageMode` (replicate prior +5.5 win) | -11 | (similar) | 4/30 chooseOnes flipped |
| exp-002 | add `preview.topK: 10` | -9 (ACCEPT) | **192/255 = 75.3%** | **16/24** |

`exp-002` confirmed: bumping `topK` from default 4 to 10 nearly doubles preview readiness and gives a real (+1) lift, but plateaus *short* of the global lesson's expected ">80% ready rate". And readiness ≠ differentiation: 8/24 differentiated decisions still report identical projected margin across all ready candidates, which is what surfaced gap #3 below.

### Files inspected

- `packages/engine/src/agents/policy-preview.ts` (1093 lines) — preview driver, classifier, drive loop
- `packages/engine/src/agents/policy-eval.ts` (1228 lines) — gating heuristic, candidate scoring loop
- `packages/engine/src/agents/policy-agent.ts` — chooseFrontierDecision (inner-microturn path)
- `packages/engine/src/cnl/compile-agents.ts` (lines 772–950) — preview config validation
- `archive/specs/145-bounded-synthetic-completion-preview.md` — design spec
- `archive/reports/polprevdrive-001-investigation.md` — POLPREVDRIVE-001 investigation (perf cost of the new driver)
- `campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json` (baseline + exp-002 versions)

---

## Gap 1: Default `preview.topK = 4` is too tight for FITL

### Evidence

- Baseline trace (default `topK=4`, no override): action-selection candidates = 263 across 26 decisions, **previewOutcome: ready=95, gated=163** (62% gated).
- `exp-002` trace (`topK: 10` override): candidates = 255 across 24 decisions, **ready=192, gated=58** (23% gated).
- FITL action-selection commonly publishes 9–13 candidates (events alone often produce 3–5 candidates per card).

### Code path

`packages/engine/src/agents/policy-eval.ts:586`:

```ts
: Math.min(profile.preview.topK ?? 4, activeCandidates.length);
```

Default is hardcoded to `4`. Spec 145 §D7 chose this value as a "conservative default" but acknowledged "Setting it to `Infinity` previews every candidate (faithful but expensive). Setting it to 1 effectively disables preview-derived discrimination..."

### Why it matters

The global lesson promoted by the prior campaign says:

> After Spec 145, expect previewOutcome: 'ready' rate above ~80% on full FITL games for non-stochastic action-selection candidates. Rates well below this in new campaigns suggest completionDepthCap is too tight, preview.topK is too tight, or preview.mode is disabled.

The default never reaches that target on FITL. Operators have to know to override.

### Open question for research

What heuristic should drive `topK` on a per-game-shape basis? Options:

- **Auto-scale**: `topK = max(K_MIN, min(candidateCount, K_MAX))` — preview every candidate up to a hard ceiling. POLPREVDRIVE-001 reports the driver costs 51% of total sampled time, so unlimited topK is risky.
- **Profile-declared minimum**: surface `topK` as a required field (no default), forcing each profile to declare. Catches drift but adds friction.
- **Adaptive**: start at the spec default, and if the previous decision's `previewGatedCount` was non-zero, double `topK` for the next decision (up to a cap). Decision-time adaptation tracks actual gate pressure.
- **Game-shape probe**: run a one-off per-game probe at GameDef compile time to estimate "typical action-selection candidate count" and bake the right `topK` into the compiled profile.

External research direction: how do similar bounded-rollout systems (TAG, OpenSpiel, PyTAG) decide how many candidates to evaluate when not all candidates can be afforded? Is there literature on adaptive candidate-set sizing for forward-model agents?

---

## Gap 2: Top-K gating is circular — preview-needed candidates are systematically gated out

### Evidence

`packages/engine/src/agents/policy-eval.ts:1020-1048` (`pickTopKByMoveOnlyScore`):

```ts
function pickTopKByMoveOnlyScore(
  evaluation: PolicyEvaluationContext,
  considerations: Readonly<Record<string, CompiledPolicyConsideration>>,
  candidates: readonly CandidateEntry[],
  moveOnlyConsiderationIds: readonly string[],
  topK: number,
): ReadonlySet<string> {
  ...
  const ranked = candidates.map((candidate) => ({
    candidate,
    score: moveOnlyConsiderationIds.reduce((total, considerationId) => (
      total + evaluation.evaluateConsideration(considerations, considerationId, candidate)
    ), 0),
  }));
  ranked.sort(...);  // by score desc, then stableMoveKey
  return new Set(ranked.slice(0, topK).map(...));
}
```

The picker's score uses **only the move-only considerations** — it deliberately excludes the consideration that depends on `feature.projectedSelfMargin` (which itself depends on `preview.victory.currentMargin.self`). This is necessary because preview hasn't run yet at the gating step.

But this creates a circular dependency: a candidate whose only differentiation comes *from* preview cannot be ranked above its peers at the gate. So the gate selects whichever candidates have static action-tag preferences, and gates out everything else.

### Concrete consequence

In ARVN's profile, `preferGovernWeighted` adds +1000 to govern candidates (move-only), `preferTrainWeighted` adds +300, etc. So govern survives the gate; train, sweep, patrol, assault, raid all tie at 0 in move-only scoring and the gate cuts them by alphabetical tiebreak. The agent then has no preview signal for the gated actions.

For a profile that *only* has preview-derived considerations (e.g., a "let preview decide everything" profile that the post-Spec-145 design supposedly enables), the gate randomly picks 4 candidates by stableMoveKey alphabetical and ignores the rest. The promise of "preview-driven scoring" doesn't survive the gate.

### Why this is structural, not tunable

Setting `topK` very large mitigates but doesn't eliminate the issue. The cost cliff (POLPREVDRIVE-001 documents `driveSyntheticCompletion` as 51% of sampled time even at default `topK=4`) means an unbounded gate is impractical. Some form of pre-preview ranking is required.

### Open question for research

Pre-preview ranking heuristics that don't require the very signal preview computes. Options:

- **Surrogate score**: a fast approximate margin estimate computed from move structure (e.g., "this move places N tokens in zone Z; estimate +N margin"). Has to be cheap and local. Could lean on existing token-state indices.
- **Diversity gating**: instead of picking top-K by score, pick candidates that span the action-type space (e.g., 1 representative per `actionId`). Guarantees preview signal for every action type at the cost of within-type comparison.
- **Two-pass gating**: first pass evaluates *all* candidates with a 1-microturn-deep preview (fast, just one `applyPublishedDecision`); second pass runs full bounded synthetic completion only for the top-K from the first pass.
- **Cached preview results**: if the same candidate (by `stableMoveKey`) was evaluated in a prior turn at the same game state digest, reuse the prior preview outcome. This breaks the circular dependency for repeat-decisions but doesn't help first encounters.

External research: Monte Carlo Tree Search progressive widening, AlphaZero's PUCT exploration, and similar selection heuristics handle exactly this trade-off. How do they pre-rank actions when value estimates aren't yet available? Could a learned-or-handcrafted prior over action types serve as a surrogate?

---

## Gap 3: `greedy` completion produces uniform projected margins for ~33% of decisions

### Evidence

In `exp-002` trace (with `topK: 10`, almost all candidates resolved to `ready`):

- 24 actionSelection decisions evaluated.
- **8 / 24 decisions** report all `ready` candidates with **identical** `preferProjectedSelfMargin` contribution. The driver completed (no `depthCap`, no `noPreviewDecision`) but every candidate projects to the same margin.
- Sample: govern decision at `marginBefore=-15`, 9 ready candidates (3 events + govern + patrol + 4 others). All show `preferProjectedSelfMargin=-4500` (margin = -15 × `projectedMarginWeight=300`). `previewDriveDepth` varies (events at depth 2; govern at depth 4; patrol at depth 5) — the driver advanced through different microturn sequences but the projected margin is identical for all.

### Mechanism

Per Spec 145 §D5:

> `greedy` — at each inner `chooseOne`, pick the first option in legality-precedence order (via the existing `selectChoiceOptionsByLegalityPrecedence`); at each inner `chooseN`, pick the first `min` legal options in legality-precedence order. Deterministic, side-effect free, no agent invocation.

`selectChoiceOptionsByLegalityPrecedence` resolves to alphabetical for FITL's value-based chooseOne microturns. So:

- Govern action selected → inner `governMode` chooseOne with options `["aid", "patronage"]` → greedy picks `"aid"` (alphabetical < "patronage") → `var.global.aid += population × 3`, **patronage unchanged**, **COIN-control unchanged** → projected margin = pre-action margin.
- Train action selected → similar story: each inner `chooseOne` picks alphabetical first → no margin-impactful state changes within the bounded depth.
- Patrol/Sweep/Assault: spaces selected alphabetically → not the ARVN-strategically-optimal targets → no margin change.

Only **events** with direct effect on victory variables (e.g., card with `var.global.patronage += N` in its effect list) show differentiated projected margins after greedy completion, because the effect runs unconditionally at the action header rather than depending on inner-microturn picks.

### Why this is hidden by `previewOutcome: ready`

`ready` means the driver successfully advanced through the compound turn and resolved the `preview.*` refs against the resulting state. It doesn't mean the projection is *meaningful*. A greedy completion that happens to pick state-neutral options will produce a `ready` outcome with a constant projected margin. The trace gives no signal that the projection is degenerate.

### Open question for research

Two related questions:

(a) **Is greedy completion the right baseline?** Greedy by alphabetical legality precedence is deterministic and bounded but adversarial to the agent's intent. The synthetic state it produces is the "if I randomly close my own action, how does the world look?" projection — not "if I close my action sensibly, how does the world look?". The latter is what scoring needs.

(b) **Is `agentGuided` reachable for new authoring profiles?** See Gap 5 below — `agentGuided` exists but routes through `scopes: [completion]` considerations that the cookbook deprecates.

External research: forward-model agents that simulate inner decisions — what completion policy do they use? Is "argmax local heuristic" (i.e., quick scoring at each inner step using a cheap evaluator) viable? How do MCTS rollouts trade rollout-policy quality vs. cost? Is there literature on cheap "soft" rollout policies that approximate the agent's own policy without recursion?

---

## Gap 4: Inner microturns (`chooseOne`, `chooseNStep`) get no preview

### Evidence

Every chooseOne / chooseNStep agent decision in the trace has:

```json
{
  "previewUsage": {
    "mode": "disabled",
    "evaluatedCandidateCount": 0,
    "refIds": [],
    "unknownRefs": [],
    "outcomeBreakdown": { "ready": 0, ... all zeros }
  }
}
```

Code (`packages/engine/src/agents/policy-agent.ts:118,136-152`):

```ts
const emptyPreviewUsage = (): PolicyEvaluationMetadata['previewUsage'] => ({
  mode: 'disabled',
  ...
});
```

`chooseFrontierDecision` always uses `emptyPreviewUsage()` — preview is structurally not invoked at inner microturns.

### Why this matters

The ARVN govern-mode chooseOne (`aid` vs `patronage`) is the canonical example. Both candidates score 0 from move-scope considerations (which are the only kind evaluated for actionSelection); inner microturns have no scoring path other than `matchGuidedCompletionDecision` (which evaluates `scopes: [completion]` considerations). With no completion-scope considerations declared, `chooseStructuralFrontierDecision` falls through to `progressBias` + `pickRandom` over equal-progress candidates, biased by `stableMoveKey` alphabetical.

Outcome: the agent **never gets a per-option preview signal** for inner microturns. It cannot ask "if I pick patronage here, what's my margin afterward?" It can only ask "is one option flagged as preferred by a completion-scope consideration?"

### Why Spec 145 didn't address this

Spec 145 §"Preview only via `decision.*` and `option.value` retired refs" explicitly considered and rejected per-option preview:

> These already work post-Spec-140 (verified in this campaign by exp-003) but are option-level, not move-level. They cannot answer "what is ARVN's margin after Govern in zone X?". Rejected — wrong abstraction level for `preferProjectedSelfMargin`.

The reasoning is coherent for action-selection — preview belongs at the move level, not the option level. But this leaves inner-microturn scoring with no preview path at all, and the cookbook's deprecation of completion-scope considerations + `option.value` removes the only working alternative.

### Open question for research

Two architectural directions:

(a) **Per-option synthetic completion**: at a chooseOne, drive the completion forward for *each option* (commit option, then drive remaining microturns greedily) and surface the resulting margin per option. Same shape as Spec 145 but at one finer granularity. Cost: O(option-count × depth-cap) per inner microturn instead of O(candidate-count × depth-cap) per action-selection. Could be expensive on chooseN with many options, but FITL chooseOnes are typically 2-4 options.

(b) **Macro-scope considerations**: a new authoring surface that says "at any chooseOne where the decisionKey contains `governMode`, prefer option `patronage`." Game-aware but expressible without retired refs. Doesn't compute projected margins — it expresses authored preferences. Lower-power but lower-cost than per-option preview.

External research: how do other tabletop-game forward-model engines treat sub-decisions? Is there a "decision tree with per-leaf evaluator" pattern that scopes preview to inner-decision granularity? Does AlphaZero's MCTS treat sub-decisions any differently from primary decisions?

---

## Gap 5: `agentGuided` depends on retired authoring surface

### Evidence

`packages/engine/src/agents/policy-preview.ts:394-415`:

```ts
const pickAgentGuidedChooseOneDecision = (
  state: GameState,
  def: GameDef,
  microturn: ChooseOneMicroturn,
  input: CreatePolicyPreviewRuntimeInput,
): Decision | undefined => {
  const guided = input.agentGuidedDeps;
  if (guided === undefined) {
    return undefined;
  }
  const request = createChooseOneRequest(microturn);
  const selected = selectBestCompletionChooseOneValue({
    state, def, catalog: guided.catalog, playerId, seatId,
    profile: guided.profile, runtime,
  }, request, { requirePositiveScore: false })?.value;
  ...
};
```

`selectBestCompletionChooseOneValue` (in `packages/engine/src/agents/completion-guidance-choice.ts`) evaluates the profile's `scopes: [completion]` considerations using `option.value` references. Without such considerations declared, it returns `undefined` and the agentGuided picker falls back to `greedy` (per `policy-preview.ts:482-483`).

### Cookbook says

`docs/agent-dsl-cookbook.md` (~line 127):

> Do not copy these patterns into new shipped profiles:
>
> - `scopes: [completion]`
> - `decision.type`, `decision.name`, `decision.targetKind`, `decision.optionCount`
> - `option.value`
> - `candidate.param.*`
> - `preview.phase1`
> - `preview.phase1CompletionsPerAction`
>
> They encourage reasoning about unpublished sub-decisions instead of the current atomic frontier.
> They were the exact surfaces that became misleading during the microturn overhaul.

### The contradiction

- Engine implements `agentGuided` as the "faithful" completion policy and routes it through completion-scope considerations.
- Cookbook tells operators not to author completion-scope considerations.
- Therefore: a profile that follows current cookbook guidance gets `agentGuided` ≡ `greedy`.
- Therefore: Gap 3 (uniform projected margins under greedy) is unfixable for cookbook-compliant profiles.

The prior campaign's `exp-003` (`preferPatronageMode`, completion-scope, `option.value`, weight 10) demonstrated that this surface mechanically still works — `exp-001` of the restart campaign reproduced the flip (4/4 govern modes flipped from aid to patronage). But operators have to use a deprecated surface to make `agentGuided` non-trivial.

### Open question for research

Three viable directions:

(a) **Un-deprecate completion-scope** in the cookbook with caveats. Make it the documented surface for inner-microturn preference, with explicit notes about scope and bounded use. Risk: the cookbook deprecation was deliberate (to align with microturn semantics post-Spec-140); reverting requires understanding why it was deprecated and whether those reasons still hold.

(b) **Replace completion-scope with a microturn-aware surface**. New refs (e.g., `microturn.kind`, `microturn.decisionKey`, `microturn.option.value`) that mean the same thing as the retired refs but are explicit about the fact that they fire at published microturn boundaries, not unpublished sub-decisions. The semantics are identical; the rename + scoping is what makes them coherent with the post-Spec-140 contract.

(c) **Move per-option preference into the move-level scoring**. Express "prefer govern with patronage mode" as a candidateFeature that inspects the action's expected mode-pick (looking forward into the action's structure). Less expressive than running the completion, but doesn't need a new authoring surface.

External research: how do other policy-DSL or rule-DSL systems handle per-option preferences when the option set is published one decision at a time? Are there examples of "deprecate-without-replacement" bites that other game engines have hit?

---

## Gap 6: Trace diagnostic gap for chooseOne candidates

### Evidence

`packages/engine/src/agents/policy-agent.ts:62-75`:

```ts
const traceCandidatesForFrontier = (
  traceLevel: PolicyDecisionTraceLevel,
  frontier: readonly FrontierCandidate[],
): PolicyEvaluationMetadata['candidates'] => traceLevel === 'verbose'
  ? frontier.map((candidate) => ({
      ...
      score: candidate.score,
      prunedBy: [],
      scoreContributions: [],   // ← always empty
      previewRefIds: [],
      unknownPreviewRefs: [],
    }))
  : [];
```

Every chooseOne / chooseNStep candidate trace has `scoreContributions: []`, even when a completion-scope consideration matched and produced a non-zero score. The actual term-by-term breakdown happens inside `selectBestCompletionChooseOneValue` but is never surfaced.

In `exp-001`'s trace, the patronage-mode option correctly received `score=10` (from `preferPatronageMode` weight=10), but the trace shows `scoreContributions: []` — no way to see *which* consideration produced the score, *why* it fired, or whether multiple considerations interacted.

### Why this matters

When debugging "why did the agent pick aid over patronage at this chooseOne?" the trace gives the final score (0 vs 10) but no path to the rule that produced it. With multiple completion-scope considerations declared (e.g., `preferPatronageMode` + `preferHighPopulationTarget`), the operator can't see which one dominated. This is the same diagnostic level the actionSelection trace had pre-Spec-145; Spec 145 raised it for actionSelection but did not propagate the change to the inner-microturn trace path.

### Open question for research

How rich should the inner-microturn trace be? A faithful term-by-term breakdown (mirror the actionSelection candidate trace shape) doubles the trace size on heavy-microturn games but pays for itself in debuggability. Could be controlled by `traceLevel: 'verbose-frontier'` as an opt-in tier.

---

## Cross-cutting analysis

The six gaps compound:

- **Gap 1 + Gap 2**: tighten `topK` and gate by move-only score → many candidates never get preview, and the ones that do are pre-selected to need it least.
- **Gap 3 + Gap 5**: greedy completion produces uniform projected margins → operators reach for `agentGuided` → it depends on retired surface → operators end up authoring deprecated patterns or accepting degenerate projections.
- **Gap 4 + Gap 6**: inner microturns have no preview AND no inner-trace scoring breakdown → the only signal at chooseOne / chooseN is "did a guided-completion match fire?", with no visibility into why. This is the chosen abstraction level (one atomic decision at a time), but the absence of per-option preview combined with the absence of trace-level scoring makes inner-microturn evolution effectively blind.

### Where the prior campaign's lessons land now

| Prior global lesson | Status post-engine-rework |
|---------------------|---------------------------|
| "Faction-agent campaigns hit architectural ceiling: every action-selection candidate's preview returns `unresolved`" | **OBSOLETE** — preview now resolves to `ready` (Gap 1, 2 still constrain coverage). |
| "After Spec 145, expect previewOutcome: 'ready' rate above ~80%" | **NOT REACHED at default** — `topK=4` gives 36% ready rate; `topK=10` gives 75%. |
| "preferStrongNormalizedMargin REGRESSES ARVN" | **UNTESTED in restart** — current profile uses it, but ablation experiment was not run. |
| "Govern-patronage strictly dominates Train for direct ARVN margin" | **STILL APPLIES at action-tag level** — preview's projected margin doesn't differentiate enough to overturn this. |
| "Adding action-tag bonuses dies when dominant action is always available" | **STILL APPLIES**. |
| "completion-scoped considerations work for option-equality breaking" | **STILL TRUE**. exp-001 reproduced the flip mechanically (4/4 chooseOne picks flipped from aid to patronage); the campaign-level metric regression was butterfly-effect, not a mechanism failure. |

---

## Recommended research questions for external LLM input

Highest leverage first:

1. **Can the top-K gating heuristic be redesigned to avoid the circular dependency** without unbounded preview cost? (Gap 2). MCTS progressive widening, AlphaZero's PUCT, and similar selection heuristics handle exactly this trade-off in tree search; what carries over to a one-microturn-deep bounded preview?
2. **What is the right rollout policy for synthetic completion in a single-candidate-state-projection setting** where the goal is "what is *my* projected margin if I close out this action sensibly?" rather than "what does game state look like after a random rollout?" (Gap 3). Literature on "soft" rollout policies, MCTS with prior, learned policy networks would be relevant — but bounded to sub-millisecond per candidate, no NN.
3. **Should per-option preview be added at inner-microturn granularity** (e.g., `chooseOne`-level synthetic completion), and at what cost? (Gap 4). Is there a tabletop-game forward-model engine (TAG, OpenSpiel, others) that does this?
4. **How should DSL deprecation handle "no replacement" cases** — what's the right way to surface "this is retired but the engine still supports it because there's no working alternative for use case X"? (Gap 5). Pattern from other game DSLs / rule engines.
5. **Is there a class of "structural" pre-preview ranking heuristics** (cheap, syntactic over move shape) that could replace move-only-score gating with something that doesn't systematically exclude preview-needy candidates? (Gap 2).
6. **Adaptive `topK` policies** in bounded-rollout systems — game-shape-aware defaults, online adaptation, or static profile-declared minimums (Gap 1).

---

## What I did NOT investigate (open follow-ups)

- **`preview.completion: agentGuided` end-to-end test**. Hypothesis: profile = current main + `preferPatronageMode` library item + `preview.completion: agentGuided`. Expected: `agentGuided` picks patronage at govern-mode chooseOne during preview drive, producing differentiated projected margins for govern vs train vs sweep at the action-selection level. Risk: the cookbook-deprecated path — but this is exactly the diagnostic that would tell us whether the deprecation should be revisited. Did not run because the user requested this report instead of more experiments.
- **`previewCompletionDepthCap` tuning**. Default = 8. Some FITL compound turns retire in 4–5 microturns; others may approach the cap. Could explain a sub-fraction of the uniform-margin cases.
- **`Phase1` preview** (`preview.phase1: true`). Cookbook lists this as retired. Engine still supports it (`policy-preview.ts:357,377`). Did not test.
- **Cross-game generalization**. The investigation focused on FITL; Texas Hold'em compound turns retire in ≤3 microturns, so Gap 3 may not bite there. Worth confirming.

---

## Appendix: trace excerpts

### Identical-margin decision (`exp-002` trace, decision 1)

```
=== IDENTICAL margins decision ===
actionId: govern marginBefore: -15
agentDecision.previewUsage: {
  "mode":"exactWorld",
  "evaluatedCandidateCount":9,
  "refIds":["victoryCurrentMargin.currentMargin.self"],
  "unknownRefs":[],
  "outcomeBreakdown":{"ready":9,"stochastic":0,"unknownRandom":0,
    "unknownHidden":0,"unknownUnresolved":0,"unknownDepthCap":0,
    "unknownNoPreviewDecision":0,"unknownGated":0,"unknownFailed":0}
}
Ready cand depth/policy/state:
  action=event   driveDepth=2 policy=greedy refIds=[victoryCurrentMargin.currentMargin.self]
  action=event   driveDepth=2 policy=greedy refIds=[victoryCurrentMargin.currentMargin.self]
  action=event   driveDepth=2 policy=greedy refIds=[victoryCurrentMargin.currentMargin.self]
  action=govern  driveDepth=4 policy=greedy refIds=[victoryCurrentMargin.currentMargin.self]
  action=patrol  driveDepth=5 policy=greedy refIds=[victoryCurrentMargin.currentMargin.self]
```

All 9 candidates `ready`, all driving to depth 2–5, all yielding identical `preferProjectedSelfMargin = -4500` (= margin -15 × `projectedMarginWeight` 300).

### Differentiated decision (`exp-002` trace, decision 4)

```
=== DIFFERENTIATED decision ===
actionId: govern marginBefore: -9
  action=assault driveDepth=1 policy=greedy margin=-2700
  action=event   driveDepth=5 policy=greedy margin=-3600   ← card-66 with side-specific effect
  action=event   driveDepth=1 policy=greedy margin=-2700
  action=event   driveDepth=1 policy=greedy margin=-3600   ← different side
  action=event   driveDepth=2 policy=greedy margin=-2700
```

When events with direct margin-affecting effects (different `side` of the same card) are in the candidate set, preview *does* differentiate. The 900-point spread (3 vs 3.3 = "300 points of projectedMargin × 1 unit of margin difference") is the meaningful signal.

### Gating heuristic

```ts
// packages/engine/src/agents/policy-eval.ts:1020-1048
function pickTopKByMoveOnlyScore(...) {
  const ranked = candidates.map((candidate) => ({
    candidate,
    score: moveOnlyConsiderationIds.reduce((total, considerationId) => (
      total + evaluation.evaluateConsideration(considerations, considerationId, candidate)
    ), 0),
  }));
  ranked.sort((left, right) => {
    const scoreOrder = right.score - left.score;
    return scoreOrder === 0
      ? left.candidate.stableMoveKey.localeCompare(right.candidate.stableMoveKey)
      : scoreOrder;
  });
  return new Set(ranked.slice(0, topK).map((entry) => entry.candidate.stableMoveKey));
}
```

`moveOnlyConsiderationIds` excludes considerations that depend on `feature.projectedSelfMargin` because preview hasn't run yet. Hence the circular dependency described in Gap 2.
