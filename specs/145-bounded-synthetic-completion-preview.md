# Spec 145: Bounded Synthetic-Completion Preview For Action-Selection Microturns

**Status**: PROPOSED
**Priority**: P1 (blocks ARVN agent evolution and any future faction-evolution campaign that depends on candidate-level margin discrimination; observed in `campaigns/fitl-arvn-agent-evolution/` 2026-04-25)
**Complexity**: M (agent-side preview pipeline change, new bounded completion driver, profile config extension, regression-test corpus update; no kernel rule changes, no GameSpecDoc changes)
**Dependencies**:
- Spec 140 [microturn-native-decision-protocol] (archived) — establishes the atomic-microturn contract this spec extends.
- Spec 144 [probe-and-recover-microturn-publication] (archived) — its bounded continuation probe is the architectural sibling of this spec on the publication side; this spec mirrors that pattern on the agent-preview side.
- Spec 113 [preview-state-policy-surface] (archived) — defines the policy victory surface that this spec finally has the data to compute on per-candidate post-move states.
- Spec 109 [agent-preview-audit] (archived) — preserved; still the audit framework for `previewOutcome` reporting.

**Source**:
- Campaign log `campaigns/fitl-arvn-agent-evolution/musings.md` (entries `exp-001` through `exp-006`, 2026-04-25): seven experiments demonstrating that without working preview, ARVN policy-quality is bounded by action-type ranking + completion-scope option-equality tricks. exp-002, exp-004, and exp-005 each regressed because the agent had no candidate-level signal to justify the trade against the dominant Govern action.
- Trace evidence in `campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json`: `decisionBreakdown.tiedDecisions = 173` out of `totalDecisions = 196` ARVN evolved-seat decisions tied at score 0 (~88%); every action-selection candidate reported `previewOutcome: "unresolved"`, `previewFailureReason: "notDecisionComplete"`. (`decisionBreakdown` is a campaign-tournament output computed by `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`, not an engine trace field.)
- Code path: `packages/engine/src/agents/policy-preview.ts:159-186` (`classifyPreviewCandidate` rejects every `pendingAdmissible` action-selection); `packages/engine/src/agents/policy-preview.ts:406-448` (`tryApplyPreview` calls `applyMove` with `advanceToDecisionPoint: false`, so even non-rejected candidates land at the very first inner microturn with no params bound).
- DSL cookbook `docs/agent-dsl-cookbook.md:101-125` ("Preview remains useful when it stays one-step and bounded") — this spec converts the documented aspiration into a working contract.

## Brainstorm Context

**Original framing.** Spec 140 made every kernel-published decision atomic. A consequence the original spec-140 envelope did not call out: under the new contract, an action-selection microturn for any non-trivial action (Govern, March, Train, Sweep, Assault, etc.) is *never* `viability.complete` at probe time, because it always has at least one inner `chooseN` / `chooseOne` to follow. The agent-side preview helper in `policy-preview.ts` was carried forward from the pre-microturn world, where many Phase-1 action templates *were* complete after `applyMove`. The classification still rejects anything `pendingAdmissible`, which under microturns is essentially all action-selection candidates.

The downstream effect is that `preferProjectedSelfMargin` — declared in four of five shipped FITL profiles (us-baseline, arvn-baseline, arvn-evolved, nva-baseline; vc-baseline declares the `projectedMarginWeight: 5` param but does not list the consideration in its `use.considerations`, so the param is dead config) and weighted as the largest single signal in arvn-baseline (`projectedMarginWeight=8`) — silently degenerates. `preview.victory.currentMargin.self` resolves as `unresolved`; the canonical `coalesce` falls through to `feature.selfMargin` (the pre-move margin), which is identical across every non-terminal candidate at the same action-selection microturn. Each candidate then scores the same margin contribution and the entire scoring reduces to action-tag ranking + tiebreakers.

**Motivation.** Two converging needs drive this spec:

1. **Faction agent evolution.** ARVN, like VC before it, needs nuanced candidate scoring to escape the local optimum where one action type ("always Govern" for ARVN, "always Rally" for VC) dominates. Without preview, every campaign hits a ceiling at "best action-type ranking found" and further experiments either no-op or regress because they trade against the dominant type without candidate-level evidence.
2. **Foundations alignment.** F#10 (Bounded Computation) and F#19 (Decision-Granularity Uniformity) make every microturn atomic and bounded. The preview helper currently reads as if F#19 had not happened — it is the only consumer of the pre-microturn "complete vs. incomplete move" distinction that has not been migrated. Migrating it is a deferred Spec-140 chore, not a new architectural commitment.

**Prior art surveyed.**

- **TAG (Tabletop Games Framework).** Forward models implement `_advance(state, action)` and a separate `_simulate(state, action, agent)` for AI lookahead. Agents do bounded depth-N rollouts with a configurable rollout policy (random-uniform by default, scriptable). The dead-end problem is delegated to the rollout policy: if it cannot satisfy a sub-decision, the rollout returns a sentinel score. [TAG Forward Model](https://tabletopgames.ai/wiki/games/creating/forward_model.html), [TAG Tree Search agents](https://tabletopgames.ai/wiki/agents/tree_search.html).
- **OpenSpiel.** `State.LegalActions()` + `State.ApplyAction(action)` mean a "candidate" preview has nothing to extend — every action is already atomic. Their MCTS / minimax agents simply roll forward by repeated `ApplyAction`, with chance nodes resolved by sampling the chance distribution. The cleanest analogue: their evaluator interface takes `State` and returns scalar value; whatever rollout policy fills in is its concern. [OpenSpiel Algorithms](https://openspiel.readthedocs.io/en/latest/algorithms.html).
- **PyTAG.** RL policies act on the action mask at each microturn; lookahead is via the same model rolled forward with a learned or scripted rollout policy. [PyTAG](https://arxiv.org/html/2405.18123v1).

The shared pattern across all three: a bounded forward simulator + a configurable completion policy. None of them tries to enumerate all extensions of a candidate; every system commits to a *single* synthetic completion per candidate per preview, accepts the resulting state as the candidate's "outcome," and lets agents trade fidelity for cost via the completion policy and rollout depth.

This spec adopts the same shape, restricted to a single candidate's compound-turn closure (i.e., the depth needed to retire the *current* action's effect tree, not full-game rollouts). That keeps the cost predictable and avoids any temptation to build a tree-search infrastructure inside the policy preview path.

**Synthesis.** Add a bounded synthetic-completion driver to the agent preview pipeline. For each action-selection candidate, drive `applyPublishedDecision` through inner microturns belonging to the same compound turn, resolving each inner decision via a configurable completion policy, until the kernel transitions to a different seat's action-selection microturn, the move's compound turn retires, a stochastic microturn is reached, or a depth cap is hit. Surface the resulting state through the existing `PreviewOutcome` plumbing so `preview.victory.currentMargin.self` and other `preview.*` refs resolve normally.

**Alternatives explicitly considered (and rejected).**

- **Resurrect pre-microturn template completion.** Re-introducing `template-completion-search` would re-introduce the dual grammar that Spec 139 retired. Rejected — F#19 conflict.
- **Preview only via `decision.*` and `option.value` retired refs.** These already work post-Spec-140 (verified in this campaign by exp-003) but are option-level, not move-level. They cannot answer "what is ARVN's margin after Govern in zone X?". Rejected — wrong abstraction level for `preferProjectedSelfMargin`.
- **Recursive agent-self preview.** Inviting the policy agent to invoke itself for inner microturns yields the most-faithful completion but is unbounded and risks stack growth on event chains. Rejected — F#10 conflict.
- **Eager full-tree enumeration.** For each candidate, enumerate all completions and aggregate. Combinatorial; FITL March's `chooseN{min:1,max:27}` alone is intractable. Rejected — F#10 conflict.
- **Disable preview on profiles that depend on it.** Tantamount to deleting `preferProjectedSelfMargin` from every shipped profile. Throws away the largest scoring signal in the design. Rejected — design regression, not a fix.
- **Defer to agent-side caching of past completions.** Caching the completion of "Govern in zone X with patronage mode" across many calls is profitable later but does not help on first encounter; insufficient by itself. Re-considered as a future optimization, not the spec.

**User constraints reflected.** F#10 (bounded), F#11 (immutable), F#8 (deterministic), F#15 (architectural completeness — fix the gap, do not paper over), F#19 (atomic decision granularity preserved). Per-game cost must remain in the same order of magnitude as today's preview attempts (microsecond-scale, not millisecond-scale per candidate); empirical bound: under 5% added wall time on representative FITL campaigns.

## Overview

Add a **bounded synthetic-completion preview driver** to the agent-side policy preview runtime. For each action-selection candidate considered by the policy agent:

1. Probe the candidate's viability and admissibility as today.
2. If `complete` (rare under microturns, but possible for stateless actions like `pass`), apply the move once and use the resulting state as the preview outcome — unchanged from current behavior.
3. If `pendingAdmissible { continuation: 'decision' | 'decisionSet' }`, drive the kernel through inner microturns owned by the same compound turn, resolving each inner microturn via a configurable completion policy, until one of the termination conditions below is reached. Use the resulting state as the preview outcome.
4. If `pendingAdmissible { continuation: 'stochastic' }` or any inner microturn during the drive resolves to a stochastic microturn, return `PreviewOutcome.kind = 'stochastic'` exactly as today. The completion driver does not sample chance.
5. If `inadmissible`, reject with the existing reason — unchanged.

The completion driver respects two budgets:

- **Depth cap** `K_PREVIEW_DEPTH` (default 8) on the number of inner microturns resolved per candidate. If exceeded, return `PreviewOutcome.kind = 'unknown', reason = 'depthCap'`.
- **Same-seat / same-turn fence**. Drive only while the next microturn belongs to the same `(seatId, turnId)` as the originating action-selection. As soon as the kernel publishes a microturn for a different seat or a retired-turn boundary, stop and use the current state as the outcome.

Two completion policies are exposed:

- `greedy` — at each inner `chooseOne`, pick the first option in legality-precedence order (via the existing `selectChoiceOptionsByLegalityPrecedence`); at each inner `chooseN`, pick the first `min` legal options in legality-precedence order. Deterministic, side-effect free, no agent invocation.
- `agentGuided` — at each inner microturn, invoke the same `buildCompletionChooseCallback` that the live agent uses at `chooseFrontierDecision` (via `selectBestCompletionChooseOneValue` for chooseOne, and the chooseN variant in `completion-guidance-choice.ts`). When the callback returns no preferred selection, fall back to `greedy`. Faithful to the agent's own choice patterns; modestly more expensive.

Profile config exposes the choice via a new `preview.completion` field; default `greedy` for now (inexpensive, sufficient to break the 97%-tied-decisions degeneracy observed in the ARVN campaign).

Foundations alignment: this spec adds no new kernel surface, no new GameSpecDoc field, no new compiler rule. It is entirely an agent-side architectural completion of Spec 140's promise — the kernel's `applyPublishedDecision` and `publishMicroturn` are already the load-bearing primitives, and `selectChoiceOptionsByLegalityPrecedence` already exists for the greedy policy.

## Problem Statement

### The defect class

Four of five shipped FITL policy profiles list `preferProjectedSelfMargin` in their `use.considerations` and assign it a weight: us-baseline=1, arvn-baseline=8, arvn-evolved=3, nva-baseline=1. The vc-baseline profile declares `projectedMarginWeight: 5` as a param but does not include the consideration in `use.considerations`, so the param is currently dead config. The shape of `preferProjectedSelfMargin`, in YAML:

```yaml
preferProjectedSelfMargin:
  scopes: [move]
  weight:
    param: projectedMarginWeight
  value:
    ref: feature.projectedSelfMargin
```

The candidate feature it references:

```yaml
projectedSelfMargin:
  type: number
  expr:
    coalesce:
      - { ref: preview.victory.currentMargin.self }
      - { ref: feature.selfMargin }
```

Under the post-Spec-140 kernel, every action-selection candidate at a non-trivial microturn (govern, train, march, rally, ...) returns `previewOutcome: "unresolved"` because `classifyPreviewCandidate` rejects `pendingAdmissible` decisions. The `coalesce` falls through to `feature.selfMargin`, which evaluates against the *pre-move* state and is therefore the same scalar for every candidate. The whole consideration contributes a constant offset, not a discriminator.

In the ARVN campaign run, this manifested as 173 of 196 evolved-seat decisions reported as tied in `decisionBreakdown.tiedDecisions` — about 88% of decisions where the agent could not differentiate candidates. Action-tag considerations, completion-scope considerations, and `stableMoveKey` tiebreakers became the only working signals. Every experiment that tried to introduce a meaningful trade-off against the locally dominant action type regressed, because the agent had no nuanced state-projection signal to justify the trade.

### Why the existing preview machinery cannot just "stop rejecting"

`tryApplyPreview` currently calls `applyMove` with `{ advanceToDecisionPoint: false }`. Even if `classifyPreviewCandidate` did not reject `pendingAdmissible` candidates, the resulting `previewState` would be the kernel state immediately after applying the action header, sitting at the very first inner microturn. No params have been bound. Any `preview.var.global.<id>` or `preview.victory.currentMargin.self` reference reads the same values as the pre-move state, modulo whatever the action header itself mutated (typically nothing — params are bound by inner chooseN/chooseOne effects).

So removing the rejection without adding a completion driver is functionally a no-op: the projected margin still equals the current margin for nearly every action.

### Why this is a single defect, not three

The three deferred spec-140 patches that all point at this code path:

1. `policy-preview.ts:172-180` — the rejection itself.
2. `policy-preview.ts:406-448` — `tryApplyPreview`'s `advanceToDecisionPoint: false` call.
3. `docs/agent-dsl-cookbook.md:127-144` ("Retired For New Production Profiles") — the documented retirement of `decision.*` / `option.value` refs (and `scopes: [completion]`, `candidate.param.*`) without a recommended replacement for projecting candidate state. The implementation of those refs still lives at `cnl/compile-agents.ts:1873-1888` (`resolveCompletionRuntimeRef`), but the authoring guidance is in the cookbook.

A single bounded synthetic-completion driver fixes all three: rejection #1 becomes "drive the candidate through its compound turn," `tryApplyPreview` #2 is replaced by repeated `applyPublishedDecision` calls that *do* advance, and the documentation in #3 gains a positive recommendation ("use `preview.*` refs; the runtime resolves them via bounded synthetic completion") instead of being a list of don'ts.

## Design

### D1. New types

In `packages/engine/src/kernel/types-core.ts`:

```ts
export type AgentPreviewCompletionPolicy = 'greedy' | 'agentGuided';

export interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;                          // existing
  readonly completion?: AgentPreviewCompletionPolicy;       // new — default 'greedy'
  readonly completionDepthCap?: number;                     // new — default K_PREVIEW_DEPTH (8)
  readonly phase1?: boolean;                                // existing — retained for ABI shape
  readonly phase1CompletionsPerAction?: number;             // existing — retained
}
```

Phase-1 fields remain as currently-supported config. Phase-1 plumbing is still wired through `policy-preview.ts:357,377` (consults `phase1ActionPreviewIndex`), `policy-evaluation-core.ts:72,243`, `policy-runtime.ts:103,124`, and the trace fields `phase1Score` / `phase1ActionRanking` in `types-core.ts:1625-1627`. No shipped profile currently activates Phase-1, but the infrastructure is intact. Phase-1 deletion is out of scope here and would warrant its own spec; this spec leaves the Phase-1 surface unchanged.

### D2. New constant

In `packages/engine/src/agents/policy-preview.ts`:

```ts
const K_PREVIEW_DEPTH = 8;
```

Justification: traces in `campaigns/fitl-arvn-agent-evolution/traces/` show every observed compound turn for FITL action-selections retires within 7 inner microturns under the live policy agent (Govern: 1 chooseN for spaces × N=2 + 2 chooseOnes for mode + maybe 1 mandate microturn = up to 5; March is the deepest at 6; capability gates add 1). 8 leaves a small margin. Texas Hold'em compound turns retire within 3 (call/raise/check + amount). The cap is conservative; depthCap-induced fall-throughs are observable in the trace as `previewOutcome: 'unknown', reason: 'depthCap'` and inform future tuning.

### D3. Completion driver contract

Add a single function in `packages/engine/src/agents/policy-preview.ts` (kept private to this module):

```ts
function driveSyntheticCompletion(
  def: GameDef,
  startState: GameState,
  trustedMove: TrustedExecutableMove,
  policy: AgentPreviewCompletionPolicy,
  depthCap: number,
  runtime: GameDefRuntime | undefined,
  agentGuidedDeps: AgentGuidedDeps | undefined,
): DriveResult;
```

`DriveResult` is one of:

- `{ kind: 'completed'; state: GameState; depth: number }` — the move's compound turn retired (kernel transitioned to a different seat's microturn or to a terminal state) within depthCap.
- `{ kind: 'stochastic'; state: GameState; depth: number }` — a stochastic microturn was encountered before completion. Return the state at that boundary; surface as `PreviewOutcome.kind = 'stochastic'`.
- `{ kind: 'depthCap'; state: GameState; depth: number }` — depthCap reached. Return the deepest state observed; surface as `PreviewOutcome.kind = 'unknown', reason: 'depthCap'`.
- `{ kind: 'failed'; reason: string }` — kernel threw during inner advance (e.g., rollback recovery triggered, MICROTURN_CONSTRUCTIBILITY_INVARIANT, etc.). Surface as `PreviewOutcome.kind = 'unknown', reason: 'failed', failureReason: reason`.

Driver loop (pseudocode):

```
origin = publishMicroturn(def, startState, runtime)
state = applyMove(def, startState, trustedMove, { advanceToDecisionPoint: true }, runtime).state
  or, when the trusted move is an incomplete action header, applyPublishedDecision(def, startState, origin, actionSelectionDecision, { advanceToDecisionPoint: true }, runtime).state
depth = 1
loop:
  microturn = publishMicroturn(def, state, runtime)
  if microturn is terminal-equivalent or microturn.seatId != originatingSeatId or microturn.turnId != originatingTurnId:
    return { kind: 'completed', state, depth }
  if microturn.kind === 'actionSelection':
    return { kind: 'completed', state, depth }
  if microturn.kind === 'stochasticResolve':
    return { kind: 'stochastic', state, depth }
  if depth >= depthCap:
    return { kind: 'depthCap', state, depth }
  decision = pickInnerDecision(microturn, policy, agentGuidedDeps)
  if decision === undefined:
    return { kind: 'failed', reason: 'noPreviewDecision' }
  state = applyPublishedDecision(def, state, microturn, decision, kernelOptions, runtime).state
  depth += 1
```

Termination conditions enumerated:
- **Same-seat / same-turn fence**: stops as soon as the move's compound turn yields control to another seat. This is the most common termination and is the meaning of "the candidate completed."
- **Action-selection re-entry for the same seat** (rare; e.g., multi-stage events where the seat continues with a fresh action selection): also stops. The post-stage state is what the agent should evaluate against, not a deeper rollout into the next operation choice.
- **Stochastic microturn**: stops without sampling. Surfaces as the existing `stochastic` outcome class so callers (`stronglyTypedSurface`) can decide whether to admit or skip per profile mode (`exactWorld` vs. `tolerateStochastic`).
- **Depth cap**: bounded by spec; trace-observable.
- **Kernel error**: rollback or invariant; surface as `failed` with reason. Does not crash the agent or campaign run.

### D4. Decision pickers

`pickInnerDecision` is a pure function over `(microturn, policy, agentGuidedDeps)`:

For `policy === 'greedy'`:

- `chooseOne`: return the first decision in legality-precedence order. The preferred legalities are `legal` first, then `unknown`, then any others — `selectChoiceOptionsByLegalityPrecedence` already implements this. Map to a published `chooseOne` decision via `microturn.legalActions.find(d => d.kind === 'chooseOne' && JSON.stringify(d.value) === JSON.stringify(option.value))`.
- `chooseN`: return the published `chooseNStep` decision that selects the first `min(legalCount, declaredMin)` options in precedence order, then `confirm` if `canConfirm` and `min` was satisfied.

For `policy === 'agentGuided'`:

- `chooseOne`: invoke `selectBestCompletionChooseOneValue` (already exported from `completion-guidance-choice.ts`); on undefined, fall back to greedy.
- `chooseN`: invoke `buildCompletionChooseCallback`'s chooseN branch (existing); on undefined, fall back to greedy.

The two pickers are pure, deterministic, and contain no game-specific identifiers — they operate on the kernel-published microturn shape only. F#1 preserved.

### D5. Integration with `getPreviewOutcome` / `tryApplyPreview`

In `policy-preview.ts:getPreviewOutcome`, replace the current branch that calls `tryApplyPreview` with a call to the driver:

```ts
function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
  // ...cache and disposed checks unchanged...
  const trustedMove = input.trustedMoveIndex.get(candidate.stableMoveKey)
    ?? input.phase1ActionPreviewIndex?.get(candidate.actionId)?.trustedMove
    ?? null;
  if (trustedMove === null) {
    // Existing classification fallback path; will produce 'rejected' for inadmissible
    // and forward to driveSyntheticCompletion for admissible+pending.
    const classification = (deps.classifyPlayableMoveCandidate ?? deps.classifyCandidate)(
      input.def, input.state, candidate.move, input.runtime,
    );
    if (classification.kind === 'rejected') {
      return classifyPreviewOutcome(classification);
    }
    return finalizePreview(driveSyntheticCompletion(/* args */));
  }
  return finalizePreview(driveSyntheticCompletion(/* args from trustedMove */));
}
```

The first driver step may preserve the existing `applyMove` dependency hook for complete or already-bindable moves, but incomplete action-selection headers must advance through the kernel-published `actionSelection` microturn with `applyPublishedDecision`. That is the live one-rules-protocol seam for post-Spec-140 action-selection candidates.

`finalizePreview` translates `DriveResult` into `PreviewOutcome`:

- `completed` → `{ kind: 'ready' }` if rng unchanged, `{ kind: 'stochastic' }` if rng diverged but `previewMode === 'tolerateStochastic'`, otherwise `{ kind: 'unknown', reason: 'random' }`. Uses the existing `rngStatesEqual` utility for parity with current `tryApplyPreview` logic.
- `stochastic` → same family as today's `'stochastic'` outcome.
- `depthCap` → `{ kind: 'unknown', reason: 'depthCap' }` (new sub-reason; explicitly *not* `'unresolved'`, so the DSL audit can distinguish "we tried and ran out of depth" from "we never tried").
- `failed` → `{ kind: 'unknown', reason: 'failed', failureReason }`.

`classifyPreviewCandidate` no longer needs to fail `pendingAdmissible` — it returns `playable` for both `complete` and `pendingAdmissible` (decision/decisionSet). Stochastic continuation is still surfaced as `playable` because `tryApplyPreview` already handles RNG-divergence detection downstream.

### D6. Cache invariants preserved

The existing `cache: Map<string, PreviewOutcome>` keyed by `candidate.stableMoveKey` continues to work. The cache key includes the originating microturn's `stableMoveKey`, which uniquely identifies the action-selection decision. Two candidates with the same key necessarily produce the same `DriveResult` because the driver is deterministic given (state, move, policy, depthCap, runtime). Cache lifetime is unchanged: bounded to one policy-evaluation pass, disposed via `dispose()` afterward.

### D7. Cost gating: top-K preview

To honor the user constraint that per-turn cost stays bounded (target: under 5% wall-time overhead on representative campaigns), introduce a *cost gate* in `policy-evaluation-core.ts`'s candidate scoring loop:

- Compute the move-scope-only score for every candidate (the considerations that do not depend on `preview.*` refs).
- Identify the top `K_PREVIEW_TOPK` candidates by move-score (default 4). Justification: ARVN traces show a typical 8–12 action-selection candidates per microturn; previewing the top 4 captures the realistic competition for the win. Lower-ranked candidates would need a preview-derived swing exceeding the move-score gap, which observation says is rare; if regression evidence shows this default is too tight, the cap is tunable per profile. The 8–12 empirical bound should be re-verifiable as the campaign corpus evolves; the I6 measurement harness lands a small derivation script alongside the perf benchmark so future authors can re-check the floor.
- Drive synthetic completion only for those top K candidates. Lower-ranked candidates' `previewOutcome` is set to `{ kind: 'unknown', reason: 'gated' }` and `coalesce` falls through naturally. They still participate in scoring, just without the preview-derived discriminator.

This cap is implemented in the policy-evaluation pass (not in `policy-preview.ts`), so it is composable with the existing `disabled` mode (no driver invoked at all) and with the existing `tolerateStochastic` mode (stochastic outcomes admitted).

`K_PREVIEW_TOPK` is profile-configurable via `preview.topK`, default 4. Setting it to `Infinity` previews every candidate (faithful but expensive). Setting it to 1 effectively disables preview-derived discrimination since the top candidate has nothing to be ranked against.

### D8. Determinism

The driver is deterministic given:
- `def` (immutable, branded)
- `startState` (immutable)
- `trustedMove` (immutable; carries `sourceStateHash` already validated)
- `policy` (string literal)
- `depthCap` (number)
- `runtime` (forked per-run; deterministic over the run)

The pickers (`pickInnerDecision`) are deterministic functions of `(microturn, policy)` because:
- Greedy uses `selectChoiceOptionsByLegalityPrecedence`, already deterministic.
- Agent-guided uses `selectBestCompletionChooseOneValue` and the chooseN callback, already deterministic over policy state.
- No wall-clock, locale, or hash-iteration order is consulted.

Spec 140's microturn-publication contract is the load-bearing primitive: `publishMicroturn(state)` is a pure deterministic function under F#8. The driver's output is therefore a pure deterministic function of inputs. F#8 preserved.

### D9. Foundations alignment

- **F#1 (Engine Agnosticism)**: no game-specific code added. The driver operates on kernel-published microturn shapes only. Verified by a conformance test that drives the same FITL Govern microturn and a Texas Hold'em raise microturn through the driver and asserts that the same `pickInnerDecision` logic resolves both — listed in I4 below.
- **F#5 (One Rules Protocol)**: the driver invokes the same `applyPublishedDecision` and `publishMicroturn` that the simulator uses. No alternate legality oracle.
- **F#8 (Determinism)**: driver is pure; tested in I4.
- **F#10 (Bounded Computation)**: `K_PREVIEW_DEPTH` and `K_PREVIEW_TOPK` are explicit bounds. No general recursion (the loop is iterative).
- **F#11 (Immutability)**: each `applyPublishedDecision` returns a new state; the driver threads the state through the loop without mutation. The startState is never mutated. The `kernelOptions` passed in are the same `{ advanceToDecisionPoint: true }` shape the simulator already uses.
- **F#12 (Compiler-Kernel Validation Boundary)**: the new `preview.completion` and `preview.completionDepthCap` profile fields are validated at compile time (string-literal enum check; integer bounds check). Runtime semantics live in the agent module; the kernel surface is unchanged.
- **F#15 (Architectural Completeness)**: this spec replaces the `notDecisionComplete` workaround with a complete driver. No hacks remain in `policy-preview.ts` after I1.
- **F#19 (Decision-Granularity Uniformity)**: every microturn the driver consumes is atomic and kernel-published. The driver does not aggregate microturns into a compound shape — it consumes them in sequence and reports the resulting state. No client-visible compound shape is exposed.

## Design (continued)

### D10. Agent-guided completion's recursion bound

The `agentGuided` policy invokes `selectBestCompletionChooseOneValue` (via `completion-guidance-choice.ts`), which evaluates the profile's `scopes: [completion]` considerations. Those considerations are themselves AST trees evaluated over the current state — they do not invoke the policy agent's action-selection loop. Therefore `agentGuided` does **not** recurse into `chooseDecision` and is bounded by the same `K_PREVIEW_DEPTH` cap as `greedy`. F#10 preserved.

If a future spec wishes to add a "`policyRecurse` completion that does invoke `chooseDecision` recursively, it must explicitly justify the new compute envelope and add a separate recursion-depth cap orthogonal to `K_PREVIEW_DEPTH`. That spec is out of scope here.

### D11. Stochastic continuation handling

For profiles configured `previewMode: 'exactWorld'` (the default for ARVN, baseline VC, etc.), encountering a stochastic microturn during the drive returns `PreviewOutcome.kind = 'stochastic'`, which `getPreviewOutcome` translates to `{ kind: 'unknown', reason: 'random' }`. This matches today's behavior for stochastic admissibility. Profiles that opt in via `previewMode: 'tolerateStochastic'` retain the post-stochastic state as the preview outcome (existing `tryApplyPreview` behavior).

### D12. Failure surfaces preserved

Existing failure reasons (`previewRuntimeDisposed`, `sourceStateHashMismatch`, `truncatePreviewFailureReason(error)`) are preserved verbatim. The driver adds two new reasons: `'depthCap'` and `'noPreviewDecision'` (for the rare case where the picker cannot resolve a microturn, e.g., a `chooseN` request with `min: 1, max: 1` and zero legal options — kernel rollback / safety net territory; this should be impossible after Spec 144 but is reported defensively).

## Implementation

This spec is implementation-ready. Tickets follow a small linear chain.

### I1. Driver implementation and integration

- `packages/engine/src/agents/policy-preview.ts`: add `driveSyntheticCompletion`, `pickInnerDecision`, `finalizePreview`. Replace the rejection branch in `classifyPreviewCandidate` for `pendingAdmissible { decision | decisionSet }` so it returns `playable`. Update `getPreviewOutcome` per D5.
- `packages/engine/src/kernel/types-core.ts`: add `AgentPreviewCompletionPolicy`, extend `CompiledAgentPreviewConfig`. Update branded JSON schema if the config shape is exposed (it is, per `packages/engine/schemas/`).
- `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/cnl/validate-agents.ts`: accept `preview.completion` (default `greedy`), `preview.completionDepthCap` (default `K_PREVIEW_DEPTH`), `preview.topK` (default 4). Static type/range checks; reject negative or non-integer values per F#12.
- `docs/agent-dsl-cookbook.md`: in the "Preview Refs" section (lines 100-125), add the positive recommendation that `preview.*` refs now resolve via the bounded synthetic-completion driver for action-selection candidates by default, replacing the "list of don'ts" framing for new-profile authors. Cross-link the "Retired For New Production Profiles" section so readers understand `decision.*` / `option.value` are not the recommended replacement.
- Ticket: `145PREVCOMP-001`.

### I2. Policy-evaluation top-K gate

- `packages/engine/src/agents/policy-evaluation-core.ts`: split candidate scoring into "move-only score" then "preview-augmented score for top K." The split is functional, not a behavioral toggle — when `topK >= candidateCount`, behavior matches "drive every candidate."
- Ticket: `145PREVCOMP-002`.

### I3. Profile audits and golden re-bless

- `data/games/fire-in-the-lake/92-agents.md`: shipped profiles continue to work; `preview.completion` defaults to `greedy`. `arvn-baseline` and `arvn-evolved` keep `preview.mode: exactWorld`. No required edit, but the file is touched only if the audit shows a benefit from setting `preview.completion: agentGuided` on an evolved profile. Spec 145 itself does not change shipped profiles.
- Goldens that capture `previewOutcome` strings (search `packages/engine/test/fixtures/` for `notDecisionComplete`) are re-blessed in this spec because the failure reason space changes. Regression-blackbox tests covering ARVN-evolved policy traces are re-blessed in the same change per F#14.
- Ticket: `145PREVCOMP-003`.

### I4. Cross-game conformance test + agnosticism proof

- New test under `packages/engine/test/integration/agents/`: drive the same `pickInnerDecision` greedy policy against (a) FITL Govern, (b) FITL March, (c) FITL Train, (d) FITL Sweep, (e) FITL Assault, and (f) Texas Hold'em raise. Assert each production action-selection witness returns a ready preview under K_PREVIEW_DEPTH and produces a non-pre-move-equal `previewState.stateHash`. Assert FITL March returns `depthCap` when `completionDepthCap` is lowered to 2. This is the F#1 / F#19 conformance witness and the production-backed boundedness matrix split out of I1 after `145PREVCOMP-001` landed only synthetic driver-internal tests.
- Add a determinism assertion under **both** `greedy` and `agentGuided` pickers: run the driver twice on the same inputs for each policy and assert byte-identical outcomes and `previewState.stateHash` values. The per-policy split matters because `agentGuided` invokes considerations evaluation, which is a separate code path from greedy precedence selection — both are claimed deterministic in D8 and both must be witnessed.
- Ticket: `145PREVCOMP-004`.

### I5. Trace and diagnostics

- Extend `policy-diagnostics.ts` so verbose policy traces emit `previewDriveDepth`, `previewCompletionPolicy`, and the new `'depthCap'` / `'gated'` reason codes. The audit of trace fixtures is part of I3's re-bless.
- Add `previewGatedCount` to per-microturn diagnostics (count of candidates suppressed by D7's top-K gate at this microturn). This is the primary observability signal for over-suppression risk called out in the Risks section; without it, "preview.topK is tunable" is not actionable because tuners cannot see when the gate is biting.
- Add an optional `previewGatedTopFlipDetected` flag emitted when a sampled gated candidate, after a follow-up cached preview-score evaluation, would have outscored the chosen candidate. Optional/sampled because the on-the-spot computation is exactly the cost the gate exists to avoid; emit only when the underlying preview-runtime cache already holds the gated candidate's outcome (e.g., after subsequent passes within the same evaluation).
- Trace lessons file `campaigns/lessons-global.jsonl` adds an entry describing the post-145 expected `previewOutcome: 'ready'` rate as a smoke signal for future campaigns.
- Ticket: `145PREVCOMP-005`.

### I6. Performance harness

- Add a tiny benchmark under `packages/engine/test/perf/agents/`: replay 50 ARVN action-selection microturns from a captured trace; assert post-spec wall time < 1.05 × pre-spec wall time + 30 ms / candidate budget. The pre-spec baseline is captured at I1 land time. This is a CI signal, not a hard fail.
- Ticket: `145PREVCOMP-006`.

## Testing

Per F#16, every architectural property is proven by a test, not assumed.

- **Driver determinism**: I4 (byte-identical state hash on repeated drive).
- **Boundedness**: I1 unit tests assert `depth <= depthCap` on synthetic driver-internal fixtures; I4 owns the production FITL matrix where depthCap=2 forces `depthCap` on March and depthCap=8 admits Govern, March, Train, Sweep, Assault completion.
- **Same-seat fence**: unit test drives a candidate that grants a free operation to another seat (FITL event card grant) and asserts the driver stops at the seat boundary.
- **Stochastic surfacing**: unit test drives a candidate whose inner microturn is a `stochasticResolve`; asserts `kind: 'stochastic'` outcome.
- **Cache hit determinism**: unit test calls `getPreviewOutcome` twice on the same candidate within one preview-runtime instance; asserts second call hits the cache (no kernel calls counted) and returns the same outcome.
- **F#1 cross-game**: I4 conformance test.
- **F#11 input-state immutability**: unit test asserts `startState.stateHash === preDriveStateHash` after driver returns.
- **Pre-existing convergence witnesses**: ARVN-evolved campaign witnesses (1000, 1001) are re-blessed only if the resulting `compositeScore` provably improves; if a witness regresses post-spec, the kernel/agent path is wrong and the spec is fixed before re-bless.

## Migration

Per F#14, no compatibility shim. The change ships in a single PR:

1. Engine code (I1, I2, I5).
2. Tests and goldens (I3, I4).
3. Performance harness (I6).
4. ARVN campaign restart in a follow-up worktree once the spec lands; the existing `arvn-evolved` profile expectedly improves immediately due to `preferProjectedSelfMargin` re-engaging. The campaign log already documents the pre-145 ceiling for comparison.

## Out Of Scope

- **Agent recursion** (`policyRecurse` completion policy that invokes `chooseDecision` for inner microturns): explicitly deferred. Future spec if the `agentGuided` greedy fallback proves insufficient for high-stakes profiles.
- **Multi-step rollouts beyond the originating compound turn**: this spec does not extend the driver across seat boundaries. A future spec on "shallow opponent modeling" can compose on top, but it is a different problem with a different cost envelope.
- **Caching across preview-runtime instances**: today's per-pass cache is sufficient. A run-scoped cache keyed on `(stateHash, actionId, completionPolicy)` is a future optimization once the workload justifies it.
- **`preview.completion: agentGuided` default**: this spec keeps `greedy` as the default. Switching the default to `agentGuided` is a separate decision after empirical comparison on the campaign corpus.

## Risks and Mitigations

- **Risk**: the driver perturbs a profile that previously relied on `preferProjectedSelfMargin` evaluating to a constant (effectively a noop) and relied on tiebreakers. **Mitigation**: I3 audit rebenchmarks every shipped profile; any profile whose composite metric regresses materially is updated in the same PR.
- **Risk**: the greedy completion picks systematically worse inner choices than the agent's own completion would, biasing `projectedSelfMargin` downward across all candidates. **Mitigation**: `agentGuided` policy exists for profiles that show this symptom. Trace diagnostics in I5 expose the divergence.
- **Risk**: depth cap of 8 is too tight for a future game with deeper compound turns. **Mitigation**: `preview.completionDepthCap` is profile-tunable; the default is conservative and the cap-hit count is trace-observable.
- **Risk**: top-K gate suppresses preview on a candidate whose preview signal would have flipped the ranking. **Mitigation**: `preview.topK` is tunable up to `Infinity`; default 4 is an empirical floor not a hard ceiling.

## Glossary

- **Action-selection microturn**: a kernel-published microturn whose `kind === 'actionSelection'`. The agent picks one action id; the kernel transitions to the action's first inner microturn (or to the next seat's microturn if the action has zero inner decisions).
- **Compound turn**: the bounded sequence of microturns owned by the same `(seatId, turnId)` originated by an action-selection. Per F#19 the kernel never exposes the compound shape; this spec consumes it as a sequence.
- **Synthetic completion**: a deterministic mechanical resolution of a candidate's inner microturns for the purpose of preview. Synthetic because no human or full agent is consulted; mechanical because the picker is a fixed function.
- **Preview outcome**: the post-completion `GameState` plus a kind tag (`ready`, `stochastic`, `unknown`). Consumed by `preview.*` ref evaluators.
- **Top-K gate**: the cost-control mechanism in policy-evaluation that limits which candidates receive a synthetic completion.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-04-25:

- [`archive/tickets/145PREVCOMP-001.md`](../archive/tickets/145PREVCOMP-001.md) — Bounded synthetic-completion driver and profile config (covers I1)
- [`archive/tickets/145PREVCOMP-002.md`](../archive/tickets/145PREVCOMP-002.md) — Policy-evaluation top-K preview gate (covers I2)
- [`archive/tickets/145PREVCOMP-003.md`](../archive/tickets/145PREVCOMP-003.md) — Profile audit and golden re-bless (covers I3)
- [`archive/tickets/145PREVCOMP-004.md`](../archive/tickets/145PREVCOMP-004.md) — Cross-game driver conformance and per-policy determinism (covers I4)
- [`tickets/145PREVCOMP-005.md`](../tickets/145PREVCOMP-005.md) — Trace and diagnostics for driver and gate (covers I5)
- [`tickets/145PREVCOMP-006.md`](../tickets/145PREVCOMP-006.md) — Performance harness and topK derivation script (covers I6)
