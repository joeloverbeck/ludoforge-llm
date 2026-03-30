# Spec 95: Policy-Guided Move Completion

**Status**: COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 15 (implemented), Spec 93 (completed)
**Benefits from**: Spec 96 (richer state features for guidance criteria)
**Estimated effort**: 5-8 days
**Origin**: FITL VC agent evolution campaign -- 18 experiments proved that random inner-decision resolution creates a hard ceiling. The PolicyAgent can only compare among 3 randomly-generated completions, not influence which completions are generated.

## Problem Statement

The PolicyAgent's move completion pipeline resolves inner decisions (chooseOne/chooseN within action pipelines) **randomly** via PRNG. The policy profile's strategic preferences are consulted only AFTER inner decisions are resolved -- too late to influence target zone selection, piece placement choices, or sub-action selection.

Current flow in `PolicyAgent.chooseMove`:

```
1. legalMoves() -> template moves (outer action selected, inner decisions pending)
2. preparePlayableMoves() -> evaluatePlayableMoveCandidate() resolves inner decisions via PRNG
   Generates up to completionsPerTemplate=3 random resolutions per template
3. evaluatePolicyMove() scores the completed moves using policy features/scoreTerms
4. Agent picks highest-scoring completed move
```

The bottleneck is step 2: `evaluatePlayableMoveCandidate` calls the kernel's effect execution engine, which resolves chooseOne/chooseN by consuming PRNG bits. The policy never participates.

### Empirical Evidence

The FITL VC agent evolution campaign (18 experiments across 2 campaign runs) proved:

- **Weight ceiling**: All action-type weight changes (Rally 2-5, Tax 1.5-5, Event 1-4) produce identical outcomes once the action-type RANKING is correct (Rally > Tax > Event). The ranking is a threshold effect -- specific weight values don't matter.

- **Candidate indistinguishability**: Within the same action type, ALL completed candidates score identically because features only check `candidate.actionId`. At key decision points (Rally with 41 candidates), 6 candidates tie and `stableMoveKey` picks alphabetically.

- **Inner decision blindness**: The agent can't prefer "Rally in high-population zone" over "Rally in empty jungle" because zone selection is resolved randomly before scoring. Similarly, it can't prefer "replace-with-base" over "place-guerrilla" in zones where base placement advances the victory formula.

- **Tiebreaker cascades**: Changing tiebreakers (paramCount, rng) either regresses or has zero effect because different random completions produce the same game trajectories with these 15 seeds.

- **Preview works for completed moves** (Spec 93): `projectedSelfMargin` CAN now differentiate completed candidates. But with only 3 random completions per template, the differentiation is limited to whatever the PRNG happened to generate.

### Why More Random Completions Don't Help

Increasing `completionsPerTemplate` from 3 to 10 or 20 would increase the chance of finding good inner decisions, but:

1. Cost scales linearly with completions (each calls `evaluatePlayableMoveCandidate`)
2. Random sampling is wasteful -- most completions explore uninteresting parts of the decision space
3. The PRNG is deterministic, so the same 3 (or 10 or 20) completions are always generated for the same state

Policy-guided completion generates BETTER completions, not more.

## Goals

- Enable the policy profile to influence inner decision resolution during move completion
- Maintain engine agnosticism: guidance criteria live in YAML, not game-specific code
- Maintain determinism: policy evaluation is deterministic (same state + same policy = same choice)
- Maintain bounded computation: same or fewer completion attempts, just smarter selection
- Make the guided completion path opt-in per profile (existing random completion remains default)
- Minimal kernel changes (thread an existing optional callback through one more layer)

## Non-Goals

- Multi-ply search or tree search (lookahead beyond the immediate move)
- New kernel types or interfaces (reuse existing `choose` callback)
- Changes to `legalMoves()` enumeration
- Opponent modeling or theory-of-mind reasoning
- Unbounded completion attempts or retry loops
- Breaking the `Agent.chooseMove` contract
- Correlated chooseN scoring (selecting optimal subsets) -- v1 scores items independently

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | Guidance criteria live in YAML policy profiles. The kernel's existing `choose` callback is generic -- the agent builds it, the kernel calls it. No game-specific logic in the kernel. |
| #2 Evolution-First | Completion guidance criteria are YAML `completionScoreTerms` -- evolution can mutate their `when` conditions, weights, and value expressions. The mutation surface is preserved. |
| #5 Determinism | The `choose` callback is a pure function of snapshot state + policy. Same state + same policy + same PRNG = identical guided completion. No floating-point, no external state. |
| #6 Bounded Computation | Each inner decision evaluates a FINITE set of options (the chooseOne/chooseN candidates). Scoring uses the same bounded expression evaluator as action-type scoring. Total work per completion is bounded by `sum(options per decision)`. |
| #7 Immutability | The `choose` callback closes over an immutable snapshot of the pre-move state. The kernel's internal state evolution during effect execution is not exposed to the callback. The kernel provides filtered option lists reflecting execution progress. |
| #8 Compiler-Kernel Boundary | The compiler compiles `completionScoreTerms` from YAML. The kernel threads the generic `choose` callback without knowing its implementation. The agent builds the callback using compiled scoring terms. Clean separation. |
| #10 Architectural Completeness | Fixes the root cause (random inner decisions) rather than papering over it (more tiebreakers, paramCount hacks). Reuses the existing `choose` callback pattern instead of inventing a parallel interface. |

## Proposed Design

### Core Concept: Reuse Existing `choose` Callback

The kernel's `completeMoveDecisionSequence` already accepts an optional `choose` callback in `CompleteMoveDecisionSequenceOptions`:

```typescript
// Already exists in move-decision-completion.ts
export interface CompleteMoveDecisionSequenceOptions extends ResolveMoveDecisionSequenceOptions {
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly chooseStochastic?: (
    request: ChoiceStochasticPendingRequest,
  ) => Readonly<Record<string, MoveParamScalar>> | undefined;
}
```

Currently, `evaluatePlayableMoveCandidate` does NOT thread this callback through -- it uses an internal PRNG-based resolver. The change threads the optional `choose` parameter through `evaluatePlayableMoveCandidate` -> `completeTemplateMove` -> `completeMoveDecisionSequence`.

**No new kernel types are needed.** The `choose` callback's existing signature (`ChoicePendingRequest -> MoveParamValue | undefined`) provides all necessary information:
- `request.type`: 'chooseOne' | 'chooseN'
- `request.name`: the bind name (e.g., "$targetSpaces")
- `request.options`: available choices with legality info
- `request.targetKinds`: 'zone' | 'token' (what type of thing is being chosen)

### Integration Points

#### 1. Kernel threading: `evaluatePlayableMoveCandidate` accepts optional `choose`

Minimal change -- add an optional `choose` parameter and thread it through:

```
evaluatePlayableMoveCandidate(def, state, move, rng, runtime, budgets, choose?)
  -> completeTemplateMove(def, state, move, rng, runtime, budgets, choose?)
    -> completeMoveDecisionSequence(def, state, move, { choose, ... })
```

When `choose` is not provided (default), behavior is identical to current PRNG-based resolution. This preserves backward compatibility for RandomAgent, GreedyAgent, and any profile without `completionGuidance`.

#### 2. PolicyAgent builds `choose` callback from profile

The PolicyAgent creates a `choose` callback that:
1. **Closes over** the immutable pre-move snapshot state (`input.state`) and compiled `completionScoreTerms`
2. **Receives** a `ChoicePendingRequest` from the kernel
3. **Scores** each legal option in `request.options` against the profile's `completionScoreTerms`
4. **Returns** the highest-scoring option, or `undefined` to fall back to random

```typescript
// In policy-agent.ts
function buildCompletionChooseCallback(
  state: GameState,
  def: GameDef,
  profile: CompiledAgentProfile,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
): ((request: ChoicePendingRequest) => MoveParamValue | undefined) | undefined {
  if (!profile.completionGuidance?.enabled) return undefined;

  const scoreTermIds = profile.use.completionScoreTerms;
  if (!scoreTermIds || scoreTermIds.length === 0) return undefined;

  return (request: ChoicePendingRequest): MoveParamValue | undefined => {
    const legalOptions = request.options.filter(o => o.legality !== 'illegal');
    if (legalOptions.length <= 1) return undefined; // No meaningful choice

    const evaluator = new CompletionGuidanceEvaluator(
      state, def, catalog, playerId, request, scoreTermIds,
    );

    let bestScore = -Infinity;
    let bestValue: MoveParamValue | undefined;

    for (const option of legalOptions) {
      const score = evaluator.scoreOption(option.value);
      if (score > bestScore) {
        bestScore = score;
        bestValue = option.value;
      }
    }

    // If all scores are 0 (no terms matched), fall back to random
    return bestScore > 0 ? bestValue : undefined;
  };
}
```

#### 3. `completionScoreTerms` library section

A new section in the agent library, parallel to existing `scoreTerms` but with a different reference domain. Follows the same `CompiledAgentScoreTerm` structure:

```yaml
library:
  completionScoreTerms:
    preferHighPopZone:
      when:
        eq:
          - { ref: decision.targetKind }
          - zone
      weight: { param: zonePopWeight }
      value:
        zoneTokenAgg:
          zone: { ref: option.value }   # Dynamic zone ref (new extension)
          owner: self
          prop: type
          aggOp: count

    preferBaseOverGuerrilla:
      when:
        and:
          - { eq: [{ ref: decision.type }, "chooseOne"] }
          - { eq: [{ ref: decision.targetKind }, "unknown"] }  # enum choices
      weight: { param: basePrefWeight }
      value:
        if:
          when: { eq: [{ ref: option.value }, "replace-with-base"] }
          then: { literal: 1 }
          else: { literal: 0 }

    avoidLowValueZones:
      when:
        eq:
          - { ref: decision.targetKind }
          - zone
      weight: { param: avoidLowValueWeight }
      value:
        neg:
          - if:
              when:
                in:
                  - { ref: option.value }
                  - ["jungle-1", "jungle-2"]  # Example: hardcoded low-value zones
              then: { literal: 1 }
              else: { literal: 0 }
```

Each `completionScoreTerm` has the same shape as a regular scoreTerm (`when`, `weight`, `value`, `unknownAs`, `clamp`). The `when` condition filters which inner decisions the term applies to -- decisions where no term's `when` matches score 0, causing fallback to random. This provides feature-based selectivity without a separate filtering mechanism.

#### 4. New reference domains for completion scoring

Available only within `completionScoreTerms` evaluation:

| Ref Kind | Ref ID | Type | Source |
|----------|--------|------|--------|
| `decisionIntrinsic` | `type` | `'chooseOne' \| 'chooseN'` | `ChoicePendingRequest.type` |
| `decisionIntrinsic` | `name` | string | `ChoicePendingRequest.name` |
| `decisionIntrinsic` | `targetKind` | `'zone' \| 'token' \| 'unknown'` | First of `ChoicePendingRequest.targetKinds`, or `'unknown'` |
| `decisionIntrinsic` | `optionCount` | number | `ChoicePendingRequest.options.length` |
| `optionIntrinsic` | `value` | string \| number | The current option being scored |

Plus all existing `currentSurface.*` refs (globalVars, perPlayerVars, derivedMetrics, victory) -- evaluated against the snapshot state.

YAML shorthand in expressions:
```yaml
{ ref: decision.type }        # -> { kind: 'ref', ref: { kind: 'decisionIntrinsic', intrinsic: 'type' } }
{ ref: decision.targetKind }  # -> { kind: 'ref', ref: { kind: 'decisionIntrinsic', intrinsic: 'targetKind' } }
{ ref: option.value }         # -> { kind: 'ref', ref: { kind: 'optionIntrinsic', intrinsic: 'value' } }
```

#### 5. `zoneTokenAgg` extension: dynamic zone reference

Currently `zoneTokenAgg.zone` accepts only a static string zone ID. This spec extends it to accept either a string or an `AgentPolicyExpr`:

```typescript
// Before (types-core.ts):
{ kind: 'zoneTokenAgg'; zone: string; owner: string; prop: string; aggOp: AgentPolicyZoneTokenAggOp }

// After:
{ kind: 'zoneTokenAgg'; zone: string | AgentPolicyExpr; owner: string; prop: string; aggOp: AgentPolicyZoneTokenAggOp }
```

When `zone` is an expression, it is evaluated at scoring time to produce a zone ID string. This enables:
```yaml
zoneTokenAgg:
  zone: { ref: option.value }  # Score the zone being chosen
  owner: self
  prop: type
  aggOp: count
```

Changes in `policy-eval.ts`: if `zone` is an object (expression), evaluate it first; if the result is not a valid zone ID string, return `undefined` (unknown).

Changes in `policy-expr.ts`: accept `zone` as either string or nested expression during compilation.

#### 6. Profile opt-in via `completionGuidance`

```yaml
profiles:
  vc-evolved:
    params:
      rallyWeight: 3
      taxWeight: 2
      zonePopWeight: 1
      basePrefWeight: 2
    completionGuidance:
      enabled: true
      fallback: random  # "random" (default) or "first" for deterministic fallback
    use:
      completionScoreTerms:
        - preferHighPopZone
        - preferBaseOverGuerrilla
      pruningRules: [...]
      scoreTerms: [...]
      tieBreakers: [...]
```

When `completionGuidance.enabled` is `false` or absent, the profile uses pure PRNG completion (backward compatible).

The `fallback` field controls what happens when the `choose` callback returns `undefined` (no completionScoreTerms matched or all scored 0):
- `random` (default): fall back to PRNG selection (current behavior)
- `first`: select the first legal option (fully deterministic, no PRNG consumption)

### chooseN Handling

For `chooseN` decisions (select K from N), the kernel calls the `choose` callback once per item selection in a sequential loop. Each call presents the remaining options. The scoring callback scores each remaining option independently and returns the best one.

This is **greedy per-item scoring** -- it doesn't optimize the full K-subset holistically. For v1, this covers the primary use cases (zone selection order, token type preference). Correlated subset scoring is a future enhancement.

### State Visibility

The `choose` callback **closes over the pre-move snapshot state** (`input.state`). It does NOT see the evolving state as the kernel executes effects within the move.

This is correct because:
1. The kernel's `ChoicePendingRequest.options` list IS filtered by execution state (e.g., stacking limits, zone availability after prior placements)
2. The callback expresses strategic preference using the snapshot ("I prefer high-population zones"), not execution tracking
3. Foundation #7 (Immutability) -- the callback works with an immutable snapshot
4. Foundation #8 (Compiler-Kernel Boundary) -- the agent doesn't need to understand kernel execution internals

### Completion Flow with Guidance

```
PolicyAgent.chooseMove(input):
  1. Build choose callback from profile's completionGuidance config
     (closes over input.state, compiled completionScoreTerms)
  2. preparePlayableMoves(input, { guidance: { choose } })
     For each template move:
       evaluatePlayableMoveCandidate(def, state, move, rng, runtime, budgets, choose)
         -> completeTemplateMove(def, state, move, rng, runtime, budgets, choose)
           -> completeMoveDecisionSequence(def, state, move, { choose })
             For each inner decision:
               choose(request) -> scored selection or undefined -> random fallback
  3. evaluatePolicyMove(completedMoves) with preview (Spec 93)
  4. Pick highest-scoring completed move
```

### Bounded Computation Analysis

For a Rally action with 5 target zones and 2 options per zone (place-guerrilla / replace-with-base):

- Without guidance: 5 random choices = 5 PRNG draws
- With guidance: 5 scoring evaluations, each comparing 2 options = 10 expression evaluations

Each expression evaluation is the same bounded cost as a normal candidateFeature evaluation. Total additional cost per completion: `O(decisions * options * terms)`. With typical FITL values (~5 decisions, ~3 options, ~3 terms), this is ~45 expression evaluations per completion -- comparable to scoring 15 candidates in the normal path.

The `when` conditions on individual completionScoreTerms short-circuit evaluation for non-matching decisions, reducing actual cost further.

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/playable-candidate.ts` | Add optional `choose` callback param, thread to `completeTemplateMove` |
| `packages/engine/src/kernel/move-completion.ts` | Thread optional `choose` through to `completeMoveDecisionSequence` |
| `packages/engine/src/agents/policy-agent.ts` | Build `choose` callback from profile, pass to `preparePlayableMoves` |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Thread `choose` through to `evaluatePlayableMoveCandidate` |
| `packages/engine/src/agents/policy-eval.ts` | New `CompletionGuidanceEvaluator` -- scores options using `completionScoreTerms` |
| `packages/engine/src/agents/policy-runtime.ts` | Add `decisionIntrinsic.*` and `optionIntrinsic.*` reference resolution |
| `packages/engine/src/agents/policy-expr.ts` | Compile `completionScoreTerms`; extend `zoneTokenAgg.zone` to accept expression |
| `packages/engine/src/cnl/compile-agents.ts` | Compile `completionGuidance` section and `completionScoreTerms` from YAML |
| `packages/engine/src/cnl/validate-agents.ts` | Validate `completionGuidance` references and `completionScoreTerms` |
| `packages/engine/src/cnl/game-spec-doc.ts` | Add `completionGuidance` to profile type, `completionScoreTerms` to library type |

### Testing Strategy

- **Unit**: `CompletionGuidanceEvaluator` with known options returns correct selection based on completionScoreTerms
- **Unit**: `zoneTokenAgg` with expression zone ref evaluates correctly
- **Unit**: `when` conditions on completionScoreTerms filter correctly (zone decisions vs enum decisions)
- **Unit**: Profile without `completionGuidance` uses random (backward compatible)
- **Unit**: `choose` callback returns `undefined` when all scores are 0 -- random fallback
- **Unit**: `choose` callback with `fallback: "first"` returns first legal option when scores are 0
- **Integration**: Compile FITL spec with guidance-enabled profile, verify compilation succeeds
- **Integration**: Run guided completion for a known FITL Rally template, verify inner decisions match scoring criteria
- **Integration**: Verify that `choose` callback's snapshot state doesn't see mid-execution changes
- **E2E**: Full FITL simulation with guidance-enabled VC agent, verify determinism (same seed = same result)
- **E2E**: Compare guided vs unguided VC agent outcomes across 15 seeds -- verify guided completion produces different (better) completions
- **Golden**: Updated policy catalog golden for FITL with guidance config
- **Property**: Guided completion never selects options outside the legal set
- **Property**: Guided completion never increases total completion count
- **Property**: Guided completion maintains determinism (same seed + same policy = same result)

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - The completion-guidance path was implemented across the compiler, runtime, scorer, chooser, and policy-agent layers through the 95POLGUIMOVCOM ticket series.
  - Production FITL now authors VC completion guidance in `data/games/fire-in-the-lake/92-agents.md`.
  - The runtime chooser now handles `chooseN` guidance as legal subset selection instead of only scalar `chooseOne` picks.
  - Production FITL guidance is proven through integration and golden coverage instead of only synthetic unit fixtures.
- Deviations from original plan:
  - Delivery was split across focused tickets rather than one spec-sized implementation.
  - The first production FITL guidance term is intentionally narrow (`$targetSpaces` multi-select completion) because the current policy surface still lacks richer generic zone-value refs; that broader surface remains the cleaner future direction.
  - The authored production step exposed a real `chooseN` contract gap that the spec’s narrative assumed away; the implementation fixed that gap before enabling production guidance.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
