# Spec 101: Strategic Condition Proximity Metrics

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 15 (completed — policy IR foundation), Spec 99 (completed — event card policy surface), Spec 100 (completed — compiled event effect annotations)
**Benefits from**: Spec 98 (completed — preview pipeline RNG tolerance enables projected condition outcomes)
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
- Support preview-based proximity delta scoring (leveraging Spec 98) so agents can prefer actions that advance toward conditions
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
| **8. Determinism** | Condition evaluation uses the same deterministic policy expression evaluator. |
| **10. Bounded Computation** | Conditions are single expression evaluations — O(1) per condition, no iteration. Proximity is a simple ratio computation. |
| **11. Immutability** | Read-only evaluation against immutable game state. |
| **12. Compiler-Kernel Boundary** | Strategic conditions are compiled from YAML by the compiler. The policy evaluator handles runtime evaluation. No kernel `ConditionAST` evaluation in the agent layer — conditions are expressed using the policy expression DSL (which is a subset of game expressions). |
| **14. No Backwards Compatibility** | New `strategicConditions` field on `CompiledAgentLibraryIndex` — no compatibility shims. SchemaVersion bumps if needed. |
| **16. Testing as Proof** | Unit tests for condition evaluation, integration tests with FITL pivotal events, cross-game tests. Compile-time validation proven by compiler diagnostic tests. |

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

**YAML type definition** (in `game-spec-doc.ts`):

```typescript
export interface GameSpecStrategicConditionDef {
  readonly description?: string;
  readonly target: GameSpecPolicyExpr;
  readonly proximity?: {
    readonly current: GameSpecPolicyExpr;
    readonly threshold: number;
  };
}
```

Add to `GameSpecAgentLibrary`:
```typescript
readonly strategicConditions?: Readonly<Record<string, GameSpecStrategicConditionDef>>;
```

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

Add to `CompiledAgentLibraryIndex` (in `types-core.ts`):
```typescript
readonly strategicConditions: Readonly<Record<string, CompiledStrategicCondition>>;
```

**Compilation pipeline** (in `compile-agents.ts`):

1. Add a `strategicConditionStatus` map to `AgentLibraryCompiler` (following the existing pattern for `stateFeatureStatus`, `candidateFeatureStatus`, etc.)
2. Add `compileStrategicCondition(id: string)` method:
   - Set status to `'compiling'` to detect cycles
   - Analyze `target` via `analyzePolicyExpr` — must produce `boolean` type
   - If `proximity` is present: analyze `current` via `analyzePolicyExpr` — must produce `number` type; validate `threshold > 0`
   - Set status to `'compiled'`
3. Store compiled conditions in `AgentPolicyCatalog.library.strategicConditions`

**Dependency tracking**: Extend `CompiledAgentDependencyRefs` (in `types-core.ts`) with:
```typescript
readonly strategicConditions: readonly string[];
```

The compiler populates this field when an expression references a strategic condition via `condition.X.satisfied` or `condition.X.proximity`. This enables the memoized compilation system to correctly order and track dependencies.

**Cross-condition references**: Strategic condition expressions (`target` and `proximity.current`) MAY reference other strategic conditions via `condition.OTHER_ID.satisfied` / `condition.OTHER_ID.proximity`. The compiler detects cycles using the status-map pattern:
- Status `'pending'` → not yet visited
- Status `'compiling'` → currently being compiled (cycle if re-encountered)
- Status `'compiled'` → done, safe to reference

This is identical to how `compileStateFeature` already handles feature-to-feature references.

**Files to modify**:
- `packages/engine/src/kernel/types-core.ts` — `CompiledStrategicCondition`, `CompiledAgentLibraryIndex`, `CompiledAgentPolicyRef`, `CompiledAgentDependencyRefs`
- `packages/engine/src/cnl/game-spec-doc.ts` — `GameSpecStrategicConditionDef`, `GameSpecAgentLibrary`
- `packages/engine/src/cnl/compile-agents.ts` — `compileStrategicCondition()`, `condition.*` ref resolution, status map

### Part C: Policy Expression References

Strategic conditions are accessible via ref paths:

| Ref Path | Type | Description |
|----------|------|-------------|
| `condition.COND_ID.satisfied` | `boolean` | Whether the condition is currently met |
| `condition.COND_ID.proximity` | `number` | 0-1 proximity metric (0 = far, 1 = at/above threshold) |

These are compiled as a new ref kind in `CompiledAgentPolicyRef` (in `types-core.ts`):

```typescript
| {
    readonly kind: 'strategicCondition';
    readonly conditionId: string;
    readonly field: 'satisfied' | 'proximity';
  }
```

**Ref path parsing** (in `policy-surface.ts`): Add parsing for `condition.COND_ID.field` ref paths, following the same pattern as `victory.currentMargin.SEAT` and `activeCard.hasTag.TAG` refs. The parser splits the ref path into segments, validates `COND_ID` exists in the compiled catalog, and validates `field` is `'satisfied'` or `'proximity'`.

**Runtime evaluation** (in `policy-evaluation-core.ts`):
- `satisfied`: Evaluate the `target` expression and return the boolean result
- `proximity`: Evaluate the `current` expression, divide by `threshold`, clamp to [0, 1]

**State-scoped evaluation**: Strategic conditions are evaluated against the **current game state**, not per-candidate. They are evaluated once per decision point, cached, and shared across all candidates. This means `condition.X.satisfied` and `condition.X.proximity` return the SAME value for every candidate at a given decision point.

To score actions based on how they **change** proximity, use preview refs (see Part D).

Both values are cached in a dedicated `strategicConditionCache` (or reuse the existing `stateFeatureCache` with a namespaced key), following the same lifecycle as state feature caching.

**Files to modify**:
- `packages/engine/src/agents/policy-surface.ts` — ref path parsing
- `packages/engine/src/agents/policy-evaluation-core.ts` — `resolveRef` case, evaluation logic, caching

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
        - { ref: activeCard.hasTag.pivotal }
    weight: 20
    value:
      boolToNumber:
        ref: feature.isEvent
```

**Preview-based proximity delta scoring** (leveraging Spec 98):
```yaml
scoreTerms:
  preferActionsAdvancingPivotal:
    weight: 3
    value:
      sub:
        - coalesce:
            - { ref: preview.condition.vcPivotalReady.proximity }
            - { ref: condition.vcPivotalReady.proximity }
        - { ref: condition.vcPivotalReady.proximity }
    # Score = proximity_after - proximity_before
    # Positive when action advances toward goal, zero when preview unavailable
    # coalesce falls back to current proximity when preview returns unknown
```

**Defensive margin awareness** (generic — works for any game with victory margins):
```yaml
strategicConditions:
  selfMarginDanger:
    description: "Am I dangerously close to losing?"
    target:
      lte:
        - { ref: victory.currentMargin.self }
        - 3
    proximity:
      current:
        sub:
          - 35
          - { ref: victory.currentMargin.self }
      threshold: 35

scoreTerms:
  urgentDefenseWhenCloseToLosing:
    when:
      gt:
        - { ref: condition.selfMarginDanger.proximity }
        - 0.8
    weight: 5
    value:
      boolToNumber:
        ref: feature.isRally
```

**Composite condition** (cross-condition reference):
```yaml
strategicConditions:
  vcPivotalReady:
    # ... as above ...

  vcHasResources:
    target:
      gte:
        - { ref: var.player.self.resources }
        - 3
    proximity:
      current: { ref: var.player.self.resources }
      threshold: 3

  vcFullyPrepared:
    description: "VC is both pivotal-ready AND has resources to exploit it"
    target:
      and:
        - { ref: condition.vcPivotalReady.satisfied }
        - { ref: condition.vcHasResources.satisfied }
    proximity:
      current:
        min:
          - { ref: condition.vcPivotalReady.proximity }
          - { ref: condition.vcHasResources.proximity }
      threshold: 1
    # Proximity = min of sub-condition proximities → both must be high for overall readiness
```

### Part E: Proximity Authoring Patterns

The proximity formula is always `clamp(current / threshold, 0, 1)`. The game author controls the direction of proximity through expression design.

**Ascending proximity** (approaching threshold from below — "need X or more"):

Use when the condition requires a value to be at or above a threshold (e.g., `guerrilla count >= 15`).

```yaml
proximity:
  current:
    globalTokenAgg:
      tokenFilter: { type: vc-guerrillas }
      aggOp: count
  threshold: 15
# At 0 guerrillas: proximity = 0.0
# At 10 guerrillas: proximity = 0.67
# At 15+ guerrillas: proximity = 1.0 (clamped)
```

**Descending proximity** (approaching threshold from above — "need X or fewer"):

Invert the value in the `current` expression so that proximity increases as the actual value decreases toward the target.

```yaml
# Condition: US troops < 20 (out of ~50 max)
proximity:
  current:
    sub:
      - 50                    # max possible troops
      - globalTokenAgg:
          tokenFilter: { type: us-troops }
          aggOp: count
  threshold: 30               # = maxPossible - targetBelow = 50 - 20
# At 50 troops: current = 0, proximity = 0.0 (far from condition)
# At 30 troops: current = 20, proximity = 0.67
# At 20 troops: current = 30, proximity = 1.0 (condition met)
```

### Part F: Interaction with Other Specs

**With Spec 99 (Event Card Policy Surface — completed)**:
- `condition.X.satisfied` can be combined with `activeCard.hasTag.pivotal` to create "play pivotal when ready" scoring
- The `activeCard.*` surface refs provide card identity and tags that complement condition-based reasoning

**With Spec 100 (Compiled Event Effect Annotations — completed)**:
- Conditions can be combined with card annotation refs: "is this event's `tokenPlacements` annotation high enough that playing it would advance my condition?"
- Example: `activeCard.annotation.unshaded.tokenPlacements.VC` combined with `condition.vcPivotalReady.proximity`

**With Spec 98 (Preview Pipeline RNG Tolerance — completed)**:
- Preview enables evaluating conditions against the post-action state
- `preview.condition.X.proximity` shows what proximity would be after taking an action
- Score terms can compute `preview.condition.X.proximity - condition.X.proximity` to prefer actions that advance toward conditions (see Part D example)

## Testing Requirements

1. **Boolean evaluation test**: `condition.vcPivotalReady.satisfied` returns `true` when token counts meet threshold, `false` otherwise.
2. **Proximity computation test**: `condition.vcPivotalReady.proximity` returns correct 0-1 value for various token counts.
3. **Clamping test**: Proximity is clamped to [0, 1] — values above threshold return 1.0, zero counts return 0.0.
4. **Compilation validation test**: Invalid conditions (non-boolean target, non-numeric current, threshold <= 0) produce compiler errors.
5. **Caching test**: Condition values are computed once per decision point, not per candidate.
6. **Score term integration test**: A scoreTerm using `condition.X.proximity` produces correct scores and influences move selection.
7. **Cross-game test**: Games without strategic conditions compile cleanly. Policy refs to non-existent conditions produce compiler diagnostics. The `condition.` ref prefix is only valid when conditions are declared.
8. **FITL integration test**: VC profile with pivotal proximity scoring compiles and runs through tournament. The test should:
   - Compile a strategic condition approximating Card 124's (VC pivotal) `playCondition`
   - Verify proximity correctly reflects guerrilla + base count
   - Verify a score term referencing `condition.vcPivotalReady.proximity` influences move selection
   - Verify preview-based proximity delta produces nonzero scores when actions change token counts
9. **Cross-condition reference test**: A composite condition referencing two sub-conditions compiles and evaluates correctly. Cycles are detected and produce compiler diagnostics.
10. **Dependency tracking test**: Compiled dependency refs correctly list referenced strategic conditions.

## Risks

- **Proxy accuracy**: The strategic condition is an APPROXIMATION of the actual pivotal event `playCondition`. The real condition may involve complex spatial requirements (e.g., "guerrillas in specific regions") that the policy expression DSL can't fully capture. Mitigation: The condition is a useful heuristic, not a precise replica. Game authors can refine the approximation as needed.
- **Computational cost**: `globalTokenAgg` in condition expressions is evaluated per decision point. For games with many zones/tokens, this adds overhead. Mitigation: Cached as state features — evaluated once, reused for all candidates. Same cost model as existing state features.
- **Condition staleness**: Conditions are evaluated against the CURRENT state. The agent can't predict whether its action will CHANGE the condition without preview. Mitigation: Preview-based condition evaluation is supported via the existing `preview.*` ref mechanism (Spec 98 completed).
- **Expression DSL limitations**: The policy expression DSL is a subset of the full kernel expression system. Some `playCondition` requirements (e.g., spatial adjacency checks, zone variable comparisons using lattice states) may not be expressible. Mitigation: The condition is an approximation authored by the game designer, not a mechanical copy of the kernel condition.
- **Cross-condition cycles**: Allowing conditions to reference other conditions introduces the possibility of cycles. Mitigation: The compiler uses the existing status-map cycle detection pattern, which is proven reliable for state features.
