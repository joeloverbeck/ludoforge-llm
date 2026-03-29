# Spec 95: Policy-Guided Move Completion

**Status**: Draft
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
- No changes to kernel code (legal move enumeration, viability probing, effect execution)

## Non-Goals

- Multi-ply search or tree search (lookahead beyond the immediate move)
- Changes to the kernel's effect execution engine
- Changes to `legalMoves()` enumeration
- Opponent modeling or theory-of-mind reasoning
- Unbounded completion attempts or retry loops
- Breaking the `Agent.chooseMove` contract

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | Guidance criteria live in YAML policy profiles. Engine code is game-agnostic -- it evaluates options using the compiled policy, not game-specific logic. |
| #2 Evolution-First | Completion guidance criteria are YAML scoreTerms/features -- evolution can mutate them just like action-type scoring. The mutation surface (parameters, weights, features) is preserved. |
| #5 Determinism | Policy evaluation is a pure function of state + policy. Same state + same policy + same PRNG = identical guided completion. No floating-point, no external state. |
| #6 Bounded Computation | Each inner decision evaluates a FINITE set of options (the chooseOne/chooseN candidates). Scoring each option uses the same bounded expression evaluator as action-type scoring. Total work per completion is bounded by `sum(options per decision)`. |
| #7 Immutability | Policy evaluation reads state but never mutates it. The completion engine produces new state objects as before. |
| #10 Architectural Completeness | Fixes the root cause (random inner decisions) rather than papering over it (more tiebreakers, paramCount hacks). |

## Proposed Design

### Core Concept: Inner-Decision Scoring Callback

The kernel's `evaluatePlayableMoveCandidate` resolves inner decisions by calling a decision resolver. Currently this resolver consumes PRNG bits to pick randomly. The change introduces a **scoring callback** that the PolicyAgent provides:

```typescript
interface InnerDecisionGuidance {
  /**
   * Score a set of options for a chooseOne/chooseN decision.
   * Returns the option(s) to select, or undefined to fall back to random.
   *
   * @param decisionId - The binding name of the decision (e.g., "$targetSpaces", "$noBaseChoice")
   * @param options - The available options (zone IDs, enum values, token IDs)
   * @param state - The game state at this point in effect execution
   * @param context - Additional context (current bindings, effect path)
   */
  scoreOptions(
    decisionId: string,
    options: readonly string[],
    state: GameState,
    context: InnerDecisionContext,
  ): readonly string[] | undefined;
}
```

### Integration Points

#### 1. `evaluatePlayableMoveCandidate` accepts an optional guidance callback

The kernel's playable candidate evaluator already resolves decisions via an internal decision handler. The change adds an optional `guidance` parameter that, when provided, is consulted before the random fallback:

```
For each inner decision (chooseOne/chooseN):
  1. If guidance callback provided → call guidance.scoreOptions()
  2. If guidance returns a selection → use it
  3. If guidance returns undefined → fall back to random (PRNG)
```

This is NOT a kernel change in the sense of adding game-specific logic. The kernel calls a generic callback; the callback's implementation lives in the agent layer.

#### 2. PolicyAgent provides guidance from profile's scoring criteria

The PolicyAgent creates an `InnerDecisionGuidance` implementation that evaluates each option against the profile's candidateFeatures and scoreTerms. For a chooseOne with options `["place-guerrilla", "replace-with-base"]`:

1. Construct a temporary candidate-like context for each option
2. Evaluate relevant candidateFeatures (e.g., `choosesReplaceWithBase`)
3. Apply scoreTerms with weights
4. Return the highest-scoring option

#### 3. YAML configuration: `completionGuidance` in profile

Profiles opt in to guided completion with a new `completionGuidance` section:

```yaml
profiles:
  vc-evolved:
    params:
      rallyWeight: 3
      taxWeight: 2
    completionGuidance:
      enabled: true
      # Which scoreTerms apply to inner decisions (subset of profile's scoreTerms)
      innerScoreTerms:
        - preferBasePlacement
        - preferGuerrillaGrowth
      # Fallback for decisions not covered by scoreTerms
      fallback: random  # or "first" for deterministic default
    use:
      pruningRules: [...]
      scoreTerms: [...]
      tieBreakers: [...]
```

#### 4. Inner-decision-specific candidateFeatures

Existing candidateFeatures reference `candidate.param.*` which resolves against the outer move's params. For inner decisions, a new reference domain `innerOption.*` exposes the current option being evaluated:

```yaml
candidateFeatures:
  choosesReplaceWithBase:
    type: boolean
    expr:
      eq:
        - { ref: innerOption.value }
        - replace-with-base
```

The `innerOption.value` ref is only available during completion guidance evaluation. During normal candidate scoring, it returns undefined.

### Completion Flow with Guidance

```
PolicyAgent.chooseMove(input):
  1. Build guidance callback from profile's completionGuidance config
  2. preparePlayableMoves(input, { guidance })
     For each template move:
       evaluatePlayableMoveCandidate(def, state, move, rng, runtime, guidance)
         For each inner decision:
           If guidance.scoreOptions returns a selection → use it
           Else → random (PRNG)
  3. evaluatePolicyMove(completedMoves) with preview (Spec 93)
  4. Pick highest-scoring completed move
```

### Bounded Computation Analysis

For a Rally action with 5 target zones and 2 options per zone (place-guerrilla / replace-with-base):

- Without guidance: 5 random choices = 5 PRNG draws
- With guidance: 5 scoring evaluations, each comparing 2 options = 10 expression evaluations

Each expression evaluation is the same bounded cost as a normal candidateFeature evaluation. Total additional cost per completion: `O(decisions * options * features)`. With typical FITL values (~5 decisions, ~3 options, ~3 features), this is ~45 expression evaluations per completion -- comparable to scoring 15 candidates in the normal path.

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/kernel/playable-candidate.ts` | Accept optional `InnerDecisionGuidance` callback |
| `packages/engine/src/agents/policy-agent.ts` | Build guidance callback from profile, pass to `preparePlayableMoves` |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Thread guidance through to `evaluatePlayableMoveCandidate` |
| `packages/engine/src/agents/policy-eval.ts` | Implement `scoreOptions` using profile's innerScoreTerms |
| `packages/engine/src/agents/policy-runtime.ts` | Add `innerOption.*` reference resolution |
| `packages/engine/src/cnl/compile-agents.ts` | Compile `completionGuidance` section from YAML |
| `packages/engine/src/cnl/validate-agents.ts` | Validate `completionGuidance` references |
| `packages/engine/src/cnl/game-spec-doc.ts` | Add `completionGuidance` to profile type |
| `packages/engine/src/kernel/types-core.ts` | Add `InnerDecisionGuidance` interface, `innerOption` ref kind |

### Testing Strategy

- **Unit**: Guidance callback with known options returns correct selection
- **Unit**: Profile without `completionGuidance` uses random (backward compatible)
- **Integration**: Compile FITL spec with guidance-enabled profile, verify compilation succeeds
- **Integration**: Run guided completion for a known FITL Rally template, verify inner decisions match scoring criteria
- **E2E**: Full FITL simulation with guidance-enabled VC agent, verify determinism (same seed = same result)
- **Golden**: Updated policy catalog golden for FITL with guidance config
- **Property**: Guided completion never selects options outside the legal set
- **Property**: Guided completion never increases total completion count
