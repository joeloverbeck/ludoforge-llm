# Spec 100: Compiled Event Effect Annotations

**Status**: Draft
**Priority**: P2
**Complexity**: L
**Dependencies**: Spec 99 (event card policy surface — provides card identity for annotation lookup)
**Benefits from**: Spec 98 (preview tolerance — enables projected event outcomes alongside static annotations)
**Estimated effort**: 5-8 days

## Problem Statement

Spec 99 gives the agent access to event card IDENTITY (which card, what tags, what metadata). But tags and metadata are author-supplied labels — they don't capture what the event actually DOES. A real player reads the card text and reasons about its effects: "this event places 3 VC guerrillas in a city" or "this event removes all NVA bases from Laos."

Without effect-level reasoning, the agent must rely on game authors (or LLM evolution) to manually tag every card with strategic annotations. For FITL's 130 cards × 2 sides = 260 distinct effects, manual annotation is expensive and error-prone.

The compiler already has full access to event effect ASTs. At compile time, we can walk each card's effect tree and extract **strategic feature summaries** — simple numeric metrics describing what each side does for each faction. These summaries are game-agnostic (derived from generic effect AST operations) and automatically updated when game data evolves.

## Goals

- Extract per-card, per-side strategic metrics from event effect ASTs at compile time
- Store metrics in a compiled lookup table accessible to the policy evaluator
- Enable policies to score events based on what they do, not just what they're labeled
- Maintain engine agnosticism: metrics are derived from generic effect AST operations
- Support evolution: as event YAML changes, annotations update automatically

## Non-Goals

- Exact effect simulation (conditionals, loops, and decision-dependent branches make exact prediction impossible at compile time)
- Runtime effect preview (that's the preview system, Spec 98)
- Semantic understanding of effects (e.g., "this event helps VC win" — that's a game-level judgment, not a computable metric)
- Analyzing non-event effects (action pipeline effects, trigger effects)

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Walks generic `EffectAST` nodes. No game-specific logic. The same analyzer works for FITL, Texas Hold'em, or any future game. |
| **2. Evolution-First** | Annotations are derived from YAML-authored effects. When effects evolve, annotations update automatically. No manual labeling required. |
| **5. Determinism** | Static analysis at compile time. Same spec = same annotations. |
| **6. Bounded Computation** | Effect ASTs are bounded (no general recursion, bounded `forEach`, bounded triggers). Walking the tree is O(total effect nodes). |
| **7. Immutability** | Read-only analysis of immutable AST structures. |
| **8. Compiler-Kernel Boundary** | Analysis is a compiler responsibility (structure and reference analysis). No kernel changes. |
| **11. Testing as Proof** | Golden tests for FITL card annotations. Property tests that annotation counts are non-negative. Cross-game test with Texas Hold'em (no events = empty annotations). |

## Design

### Part A: Effect Annotation Schema

Each event side (unshaded/shaded) is summarized with a flat, numeric feature vector:

```typescript
interface CompiledEventSideAnnotation {
  // Token effects per seat (keyed by seat ID)
  readonly tokenPlacements: Readonly<Record<string, number>>;   // moveToken/addToken effects placing tokens for each seat
  readonly tokenRemovals: Readonly<Record<string, number>>;     // removeToken/moveToken effects removing tokens for each seat

  // Variable effects
  readonly globalVarModifications: number;    // count of setVar/addVar effects on global variables
  readonly perPlayerVarModifications: number; // count of setVar/addVar effects on per-player variables

  // Structural properties
  readonly grantsOperation: boolean;          // whether this side has freeOperationGrants
  readonly grantOperationSeats: readonly string[]; // which seats receive free operations
  readonly hasEligibilityOverride: boolean;   // whether this side modifies eligibility
  readonly hasLastingEffect: boolean;         // whether this side creates momentum/lasting effects
  readonly hasBranches: boolean;              // whether this side has conditional branches

  // Complexity indicator
  readonly effectNodeCount: number;           // total effect AST nodes (proxy for card complexity)
}

interface CompiledEventCardAnnotation {
  readonly cardId: string;
  readonly unshaded?: CompiledEventSideAnnotation;
  readonly shaded?: CompiledEventSideAnnotation;
}

interface CompiledEventAnnotationIndex {
  readonly entries: Readonly<Record<string, CompiledEventCardAnnotation>>;
  // keyed by cardId
}
```

### Part B: Effect AST Walker

A new compiler module `compile-event-annotations.ts` walks each event card's effect ASTs:

```
For each EventCardDef in each EventDeckDef:
  For each side (unshaded, shaded):
    Walk the EventSideDef.effects tree
    Walk EventSideDef.branches[].effects trees
    Walk EventSideDef.targets[].effects trees
    Count occurrences of:
      - moveToken effects → increment tokenPlacements[targetSeat] or tokenRemovals[sourceSeat]
      - setVar/addVar effects → increment globalVarModifications or perPlayerVarModifications
    Read structural properties:
      - freeOperationGrants → grantsOperation = true, record seat IDs
      - eligibilityOverrides → hasEligibilityOverride = true
      - lastingEffects → hasLastingEffect = true
      - branches → hasBranches = true
    Count total nodes → effectNodeCount
```

**Conservative counting**: The walker counts effects that MIGHT fire, including effects inside conditional branches (`if.then`, `if.else`). This is intentionally over-counting — it's a heuristic, not an exact prediction. For policy scoring, "this card potentially places 3 VC guerrillas" is useful even if the actual count depends on game state.

**Seat resolution**: For `moveToken` effects, the target seat is determined by:
- If the zone owner is a literal seat ID → that seat
- If the zone owner is `self` or `active` → resolved based on the card's `seatOrder` metadata (first seat in order is the "intended" seat)
- If the zone owner is dynamic (expression) → attributed to a special `'dynamic'` seat key

### Part C: Policy Expression Operator

Add a new policy expression operator `cardAnnotation` for looking up compiled event annotations:

```yaml
# YAML syntax
cardAnnotation:
  card: { ref: activeCard.id }    # card ID expression
  side: unshaded                  # 'unshaded' | 'shaded'
  metric: tokenPlacements         # annotation field name
  seat: self                      # optional: seat ID or 'self' for per-seat metrics
```

Compiled to:

```typescript
{
  kind: 'cardAnnotation';
  card: AgentPolicyExpr;          // expression resolving to card ID
  side: 'unshaded' | 'shaded';
  metric: string;                 // field name in CompiledEventSideAnnotation
  seat?: string | 'self';         // for per-seat metrics
}
```

**Type analysis**: Returns `number` (or `boolean` for boolean fields like `grantsOperation`). The analyzer validates that `metric` is a known field name and that `seat` is provided for per-seat fields.

### Part D: YAML Authoring Examples

**Prefer events that place tokens for my faction**:
```yaml
scoreTerms:
  preferEventsPlacingMyTokens:
    when:
      ref: feature.isEvent
    weight: 2
    value:
      coalesce:
        - cardAnnotation:
            card: { ref: activeCard.id }
            side: unshaded
            metric: tokenPlacements
            seat: self
        - 0
```

**Avoid events that remove my tokens**:
```yaml
scoreTerms:
  penalizeEventsRemovingMyTokens:
    when:
      ref: feature.isEvent
    weight: -3
    value:
      coalesce:
        - cardAnnotation:
            card: { ref: activeCard.id }
            side: unshaded
            metric: tokenRemovals
            seat: self
        - 0
```

**Prefer events that grant free operations to my faction**:
```yaml
stateFeatures:
  eventGrantsMyOperation:
    type: boolean
    expr:
      coalesce:
        - cardAnnotation:
            card: { ref: activeCard.id }
            side: unshaded
            metric: grantsOperation
        - false
```

**Composite event quality score**:
```yaml
stateFeatures:
  eventUnshadedQuality:
    type: number
    expr:
      add:
        - mul:
            - 2
            - coalesce:
                - cardAnnotation:
                    card: { ref: activeCard.id }
                    side: unshaded
                    metric: tokenPlacements
                    seat: self
                - 0
        - mul:
            - -1
            - coalesce:
                - cardAnnotation:
                    card: { ref: activeCard.id }
                    side: unshaded
                    metric: tokenRemovals
                    seat: self
                - 0
```

### Part E: Shaded vs. Unshaded Evaluation

In FITL's card-driven turn flow, the first eligible player chooses to play the event (unshaded) or operate. The second eligible player gets the opposite — if first player operated, second can play the event (and may choose shaded). The specific side selection logic is game-specific and handled by the turn flow, not the policy.

For policy scoring purposes, the agent can evaluate BOTH sides and compare:
- If `eventUnshadedQuality > 0` → event is beneficial, prefer playing it
- If `eventShadedQuality > eventUnshadedQuality` → opponent would benefit more from shaded, consider playing it to deny them

This requires the agent to evaluate quality for both sides, which the `cardAnnotation` operator supports via the `side` parameter.

## Testing Requirements

1. **Walker test**: Verify annotation counts for a known FITL event card (e.g., Gulf of Tonkin: unshaded places US tokens, shaded removes US aid).
2. **Conservative counting test**: Verify that conditional branches contribute to counts (both if/else branches counted).
3. **Per-seat attribution test**: Verify `tokenPlacements` correctly attributes to the right seats based on zone ownership.
4. **Index completeness test**: All 130 FITL event cards produce annotations.
5. **Policy integration test**: A scoreTerm using `cardAnnotation` compiles and produces numeric values during policy evaluation.
6. **Cross-game test**: Texas Hold'em (no event decks) produces an empty annotation index. Policies using `cardAnnotation` get `undefined` → `coalesce` to fallback.
7. **Golden test**: FITL annotation index golden fixture for regression testing.
8. **Evolution test**: Modify one card's effects in YAML, recompile, verify annotations update.

## Risks

- **Annotation accuracy**: Conservative counting over-estimates. A card with `if condition: place 3 tokens; else: place 0 tokens` reports `tokenPlacements: 3` even when the condition is usually false. Mitigation: This is a heuristic signal, not an exact prediction. Over-estimation is better than under-estimation for safety-oriented scoring.
- **Dynamic seat resolution**: Effects targeting dynamic zones (expression-computed seats) can't be attributed at compile time. Mitigation: Attributed to `'dynamic'` key, which the policy can check separately.
- **Complexity**: Effect AST walking is a new compiler responsibility. The walker must handle all effect kinds (moveToken, setVar, forEach, if, let, etc.). Mitigation: Bounded by principle 6. Start with counting the most common effect types (moveToken, setVar) and ignore exotic ones (rollRandom, removeByPriority) in v1.
- **Spec 99 dependency**: Card annotations are useless without card identity. Spec 99 must be implemented first.
