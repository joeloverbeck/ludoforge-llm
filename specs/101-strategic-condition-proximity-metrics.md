# Spec 101: Strategic Condition Proximity Metrics

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 15 (completed — policy IR foundation)
**Benefits from**: Spec 99 (event card surface — enables linking conditions to specific event cards)
**Estimated effort**: 4-6 days

## Problem Statement

Skilled board game players engage in **multi-turn planning**: they take actions NOW to enable a powerful move LATER. In Fire in the Lake, the most prominent example is pivotal events — each faction has a pivotal event card with a `playCondition` that must be satisfied before the event can be played. Skilled VC players spend multiple turns building up opposition and guerrilla presence specifically to satisfy their pivotal event's condition, because the pivotal event has game-changing effects.

The current agent policy DSL has no mechanism for this kind of forward-looking behavior. The agent can only evaluate the CURRENT game state and the IMMEDIATE action. It cannot:

1. Check whether a named condition (like a pivotal event's `playCondition`) is currently satisfied
2. Measure how "close" the game state is to satisfying a condition
3. Score actions that move the state toward satisfying a strategic condition
4. Track progress toward multi-turn objectives

**Consequence**: The agent makes purely myopic decisions — best action NOW without regard for enabling future plays. For games like FITL where multi-turn positioning is critical, this is a severe strategic limitation.

### Broader Applicability

Multi-turn planning toward conditions isn't FITL-specific:
- Any game with conditional event cards benefits (pivotal events, triggered abilities)
- Games with unlock conditions (tech trees, prerequisites)
- Games with threshold-based scoring (reaching N points enables a special action)
- Any game where achieving a condition grants a significant reward

## Goals

- Allow game authors to declare named strategic conditions in the `agents` section
- Compile these conditions into evaluatable policy expressions
- Provide both boolean (is satisfied?) and numeric (how close?) metrics
- Enable policy profiles to score actions that move toward satisfying strategic conditions
- Maintain engine agnosticism: conditions are authored in YAML, evaluated by the policy evaluator

## Non-Goals

- Tree search or lookahead (evaluating action sequences that lead to condition satisfaction)
- Condition planning (generating a plan of actions to satisfy a condition)
- Automated condition discovery (inferring which conditions matter from game rules)
- Runtime evaluation of `ConditionAST` from the kernel layer inside the policy evaluator

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Conditions are authored in YAML using generic policy expressions. No game-specific logic in the engine. |
| **2. Evolution-First** | Strategic conditions live in GameSpecDoc YAML. Thresholds, weights, and target values are evolvable. |
| **5. Determinism** | Condition evaluation uses the same deterministic policy expression evaluator. |
| **6. Bounded Computation** | Conditions are single expression evaluations — O(1) per condition, no iteration. Proximity is a simple ratio computation. |
| **7. Immutability** | Read-only evaluation against immutable game state. |
| **8. Compiler-Kernel Boundary** | Strategic conditions are compiled from YAML by the compiler. The policy evaluator handles runtime evaluation. No kernel `ConditionAST` evaluation in the agent layer — conditions are expressed using the policy expression DSL (which is a subset of game expressions). |
| **11. Testing as Proof** | Unit tests for condition evaluation, integration tests with FITL pivotal events, cross-game tests. |

## Design

### Part A: Strategic Condition Declaration

Add a `strategicConditions` section to the `agents.library` in GameSpecDoc:

```yaml
agents:
  library:
    strategicConditions:
      vcPivotalReady:
        description: "VC pivotal event play condition approximation"
        target:
          gte:
            - add:
                - globalTokenAgg:
                    tokenFilter:
                      type: vc-guerrillas
                    aggOp: count
                - globalTokenAgg:
                    tokenFilter:
                      type: vc-bases
                    aggOp: count
            - 15
        proximity:
          current:
            add:
              - globalTokenAgg:
                  tokenFilter:
                    type: vc-guerrillas
                  aggOp: count
              - globalTokenAgg:
                  tokenFilter:
                    type: vc-bases
                  aggOp: count
          threshold: 15
```

Each strategic condition has:
- `description`: Human-readable explanation (for documentation, not used at runtime)
- `target`: A policy expression that evaluates to `boolean` — is the condition satisfied?
- `proximity` (optional): Defines how to compute a 0-1 closeness metric
  - `current`: A policy expression that evaluates to `number` — the current value
  - `threshold`: A number — the target value
  - Proximity = `clamp(current / threshold, 0, 1)` — 0 means far, 1 means at/above threshold

### Part B: Compilation

Strategic conditions compile into library items similar to state features:

```typescript
interface CompiledStrategicCondition {
  readonly target: AgentPolicyExpr;       // boolean expression
  readonly proximity?: {
    readonly current: AgentPolicyExpr;    // numeric expression
    readonly threshold: number;
  };
}
```

The compiler:
1. Analyzes `target` as a boolean policy expression using the existing `analyzePolicyExpr` pipeline
2. If `proximity` is present, analyzes `current` as a numeric expression and validates `threshold > 0`
3. Stores compiled conditions in `AgentPolicyCatalog.library.strategicConditions`

### Part C: Policy Expression References

Strategic conditions are accessible as state features via ref paths:

| Ref Path | Type | Description |
|----------|------|-------------|
| `condition.COND_ID.satisfied` | `boolean` | Whether the condition is currently met |
| `condition.COND_ID.proximity` | `number` | 0-1 proximity metric (0 = far, 1 = at/above threshold) |

These are compiled as a new ref kind in `CompiledAgentPolicyRef`:

```typescript
| {
    readonly kind: 'strategicCondition';
    readonly conditionId: string;
    readonly field: 'satisfied' | 'proximity';
  }
```

**Runtime evaluation** (in `PolicyEvaluationContext`):
- `satisfied`: Evaluate the `target` expression and return the boolean result
- `proximity`: Evaluate the `current` expression, divide by `threshold`, clamp to [0, 1]

Both are cached like state features (evaluated once per decision point, reused across candidates).

### Part D: YAML Authoring Examples

**VC pivotal event preparation**:
```yaml
strategicConditions:
  vcPivotalReady:
    target:
      gte:
        - add:
            - globalTokenAgg:
                tokenFilter: { type: vc-guerrillas }
                aggOp: count
            - globalTokenAgg:
                tokenFilter: { type: vc-bases }
                aggOp: count
        - 15
    proximity:
      current:
        add:
          - globalTokenAgg:
              tokenFilter: { type: vc-guerrillas }
              aggOp: count
          - globalTokenAgg:
              tokenFilter: { type: vc-bases }
              aggOp: count
      threshold: 15
```

**Score actions that advance toward the pivotal condition**:
```yaml
scoreTerms:
  rewardPivotalProgress:
    weight: 2
    value:
      sub:
        - 1
        - { ref: condition.vcPivotalReady.proximity }
    # Score = 2 * (1 - proximity): high when far from goal, zero when achieved
    # This creates urgency to build forces early, diminishing as condition approaches

  stronglyPreferPivotalWhenReady:
    when:
      and:
        - { ref: feature.isEvent }
        - { ref: condition.vcPivotalReady.satisfied }
        - { ref: feature.currentCardIsPivotal }   # from Spec 99
    weight: 20
    value:
      boolToNumber:
        ref: feature.isEvent
```

**Opponent disruption awareness** (generic — works for any game):
```yaml
strategicConditions:
  opponentNearVictory:
    target:
      lte:
        - { ref: victory.currentMargin.active }
        - 3
    proximity:
      current:
        sub:
          - 35
          - { ref: victory.currentMargin.active }
      threshold: 35

scoreTerms:
  urgentDefenseWhenOpponentClose:
    when:
      gt:
        - { ref: condition.opponentNearVictory.proximity }
        - 0.8
    weight: 5
    value:
      boolToNumber:
        ref: feature.isAttack   # prefer defensive actions
```

### Part E: Interaction with Other Specs

**With Spec 99 (Event Card Surface)**:
- `condition.X.satisfied` can be combined with `activeCard.hasTag.pivotal` to create "play pivotal when ready" scoring
- Without Spec 99, conditions still work for non-event scoring (e.g., urgency-based Rally preference)

**With Spec 100 (Effect Annotations)**:
- Conditions can reference event effect annotations: "is this event card's tokenPlacement count high enough to reach my threshold?"
- Requires both specs to combine card-specific and state-level reasoning

**With Spec 98 (Preview Tolerance)**:
- Preview can show how a candidate move changes proximity: "if I Rally here, proximity goes from 0.7 to 0.8"
- Requires preview to work (Spec 98) and conditions to be evaluated against preview state

## Testing Requirements

1. **Boolean evaluation test**: `condition.vcPivotalReady.satisfied` returns `true` when token counts meet threshold, `false` otherwise.
2. **Proximity computation test**: `condition.vcPivotalReady.proximity` returns correct 0-1 value for various token counts.
3. **Clamping test**: Proximity is clamped to [0, 1] — values above threshold return 1.0, zero counts return 0.0.
4. **Compilation validation test**: Invalid conditions (non-boolean target, non-numeric current, threshold <= 0) produce compiler errors.
5. **Caching test**: Condition values are computed once per decision point, not per candidate.
6. **Score term integration test**: A scoreTerm using `condition.X.proximity` produces correct scores and influences move selection.
7. **Cross-game test**: Texas Hold'em with no strategic conditions — refs return `undefined`, policies handle via `coalesce`.
8. **FITL integration test**: VC profile with pivotal proximity scoring compiles and runs through tournament.

## Risks

- **Proxy accuracy**: The strategic condition is an APPROXIMATION of the actual pivotal event `playCondition`. The real condition may involve complex spatial requirements (e.g., "guerrillas in specific regions") that the policy expression DSL can't fully capture. Mitigation: The condition is a useful heuristic, not a precise replica. Game authors can refine the approximation as needed.
- **Computational cost**: `globalTokenAgg` in condition expressions is evaluated per decision point. For games with many zones/tokens, this adds overhead. Mitigation: Cached as state features — evaluated once, reused for all candidates. Same cost model as existing state features.
- **Condition staleness**: Conditions are evaluated against the CURRENT state. The agent can't predict whether its action will CHANGE the condition (without preview, Spec 98). Mitigation: Preview-based condition evaluation is a future enhancement after Spec 98.
- **Expression DSL limitations**: The policy expression DSL is a subset of the full kernel expression system. Some `playCondition` requirements (e.g., spatial adjacency checks, zone variable comparisons using lattice states) may not be expressible. Mitigation: The condition is an approximation authored by the game designer, not a mechanical copy of the kernel condition.
