# Spec 100: Compiled Event Effect Annotations

**Status**: Draft
**Priority**: P2
**Complexity**: L
**Dependencies**: Spec 99 (event card policy surface — provides card identity, `cardMetadataIndex`, and `activeCard.*` surface refs for annotation lookup)
**Blocks**: Spec 101 (strategic condition proximity metrics — can consume annotations to reason about condition closeness)
**Benefits from**: Spec 98 (preview tolerance — enables projected event outcomes alongside static annotations)
**Estimated effort**: 5-8 days

## Problem Statement

Spec 99 gives the agent access to event card IDENTITY (which card, what tags, what metadata). But tags and metadata are author-supplied labels — they don't capture what the event actually DOES. A real player reads the card text and reasons about its effects: "this event places 3 VC guerrillas in a city" or "this event removes all NVA bases from Laos."

Without effect-level reasoning, the agent must rely on game authors (or LLM evolution) to manually tag every card with strategic annotations. For FITL's 130 cards × 2 sides = 260 distinct effects, manual annotation is expensive and error-prone.

The compiler already has full access to event effect ASTs. At compile time, we can walk each card's effect tree and extract **strategic feature summaries** — simple numeric metrics describing what each side does for each faction. These summaries are game-agnostic (derived from generic effect AST operations) and automatically updated when game data evolves.

## Goals

- Extract per-card, per-side strategic metrics from event effect ASTs at compile time
- Store metrics in a compiled `cardAnnotationIndex` on `GameDef`, accessible to the policy evaluator via surface refs
- Enable policies to score events based on what they do, not just what they're labeled
- Maintain engine agnosticism: metrics are derived from generic effect AST operations
- Support evolution: as event YAML changes, annotations update automatically
- Reuse Spec 99's `activeCard.*` surface ref pattern for policy access

## Non-Goals

- Exact effect simulation (conditionals, loops, and decision-dependent branches make exact prediction impossible at compile time)
- Runtime effect preview (that's the preview system, Spec 98)
- Semantic understanding of effects (e.g., "this event helps VC win" — that's a game-level judgment, not a computable metric)
- Analyzing non-event effects (action pipeline effects, trigger effects)

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Walks generic `EffectAST` nodes via `_k` discriminant tags. No game-specific logic. The same analyzer works for FITL, Texas Hold'em, or any future game. |
| **2. Evolution-First** | Annotations are derived from YAML-authored effects. When effects evolve, annotations update automatically. No manual labeling required. |
| **5. One Rules Protocol** | Annotations are compiled once and consumed by any client (agent, runner, analytics) through the same surface ref mechanism. |
| **8. Determinism** | Static analysis at compile time. Same spec = same annotations. |
| **10. Bounded Computation** | Effect ASTs are bounded (no general recursion, bounded `forEach`, bounded triggers). Walking the tree is O(total effect nodes). |
| **11. Immutability** | Read-only analysis of immutable AST structures. |
| **12. Compiler-Kernel Boundary** | Analysis is a compiler responsibility (structure and reference analysis). No kernel changes beyond the new type and GameDef field. |
| **15. Architectural Completeness** | Extends Spec 99's `activeCard.*` surface ref pattern rather than introducing a new expression kind. Reuses existing parse → resolve → visibility infrastructure. |
| **16. Testing as Proof** | Golden tests for FITL card annotations. Property tests that annotation counts are non-negative. Cross-game test with Texas Hold'em (no events = empty annotations). |

## Design

### Part A: Effect Annotation Schema

Each event side (unshaded/shaded) is summarized with a flat, numeric feature vector covering all strategically relevant effect kinds:

```typescript
interface CompiledEventSideAnnotation {
  // --- Token effects (per seat, keyed by seat ID) ---
  readonly tokenPlacements: Readonly<Record<string, number>>;     // moveToken/createToken effects placing tokens for each seat
  readonly tokenRemovals: Readonly<Record<string, number>>;       // moveToken/destroyToken effects removing tokens for each seat
  readonly tokenCreations: Readonly<Record<string, number>>;      // createToken effects only (subset of placements)
  readonly tokenDestructions: Readonly<Record<string, number>>;   // destroyToken effects only (subset of removals)

  // --- Marker effects ---
  readonly markerModifications: number;       // count of setMarker/shiftMarker effects (space-level markers)
  readonly globalMarkerModifications: number; // count of setGlobalMarker/flipGlobalMarker/shiftGlobalMarker effects

  // --- Variable effects ---
  readonly globalVarModifications: number;    // count of setVar/addVar effects on global variables
  readonly perPlayerVarModifications: number; // count of setVar/addVar effects on per-player variables
  readonly varTransfers: number;              // count of transferVar effects

  // --- Deck effects ---
  readonly drawCount: number;                 // count of draw effects
  readonly shuffleCount: number;              // count of shuffle effects

  // --- Structural properties ---
  readonly grantsOperation: boolean;          // whether this side has freeOperationGrants
  readonly grantOperationSeats: readonly string[]; // which seats receive free operations
  readonly hasEligibilityOverride: boolean;   // whether this side modifies eligibility
  readonly hasLastingEffect: boolean;         // whether this side creates momentum/lasting effects
  readonly hasBranches: boolean;              // whether this side has conditional branches
  readonly hasPhaseControl: boolean;          // whether this side has gotoPhaseExact/advancePhase/push/popInterruptPhase
  readonly hasDecisionPoints: boolean;        // whether this side has chooseOne/chooseN effects

  // --- Complexity indicator ---
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

**GameDef placement** — new top-level field, parallel to `cardMetadataIndex`:

```typescript
// In GameDef:
readonly cardAnnotationIndex?: CompiledEventAnnotationIndex;
```

### Part B: Effect AST Walker

A new compiler module `compile-event-annotations.ts` walks each event card's effect ASTs. The walker reuses the recursive descent pattern from `effect-compiler-patterns.ts:walkEffects` (lines 931-972), which already handles all control-flow nesting: `if.then/else`, `forEach.effects/in`, `let.in`, `reduce.in`, `rollRandom.in`, `evaluateSubset.compute/in`, `removeByPriority.in`.

**Complete traversal for each EventSideDef**:

```
For each EventCardDef in each EventDeckDef:
  For each side (unshaded, shaded):
    Walk ALL effect arrays on the side:
      1. side.effects
      2. side.branches[].effects
      3. side.targets[].effects
      4. side.lastingEffects[].setupEffects
      5. side.lastingEffects[].teardownEffects
      6. side.branches[].targets[].effects
      7. side.branches[].lastingEffects[].setupEffects
      8. side.branches[].lastingEffects[].teardownEffects

    For each effect array, recursively walk nested effects via _k dispatch:
      - if._k: walk then + else
      - forEach._k: walk effects + in
      - let._k: walk in
      - reduce._k: walk in
      - rollRandom._k: walk in
      - evaluateSubset._k: walk compute + in
      - removeByPriority._k: walk in

    For each leaf effect, dispatch on _k to count:
      Token effects:
        - moveToken → tokenPlacements[targetSeat]++ or tokenRemovals[sourceSeat]++
        - createToken → tokenCreations[targetSeat]++, tokenPlacements[targetSeat]++
        - destroyToken → tokenDestructions[sourceSeat]++, tokenRemovals[sourceSeat]++
        - moveAll → tokenPlacements['dynamic']++, tokenRemovals['dynamic']++
        - moveTokenAdjacent → tokenPlacements['dynamic']++, tokenRemovals['dynamic']++
      Marker effects:
        - setMarker/shiftMarker → markerModifications++
        - setGlobalMarker/flipGlobalMarker/shiftGlobalMarker → globalMarkerModifications++
      Variable effects:
        - setVar/addVar on global → globalVarModifications++
        - setVar/addVar on perPlayer → perPlayerVarModifications++
        - transferVar → varTransfers++
      Deck effects:
        - draw → drawCount++
        - shuffle → shuffleCount++
      Phase control:
        - gotoPhaseExact/advancePhase/pushInterruptPhase/popInterruptPhase → hasPhaseControl = true
      Decision points:
        - chooseOne/chooseN → hasDecisionPoints = true
      All effects → effectNodeCount++

    Read structural properties from EventSideDef directly:
      - freeOperationGrants → grantsOperation = true, record seat IDs
      - eligibilityOverrides → hasEligibilityOverride = true
      - lastingEffects → hasLastingEffect = true
      - branches → hasBranches = true
```

**Conservative counting**: The walker counts effects that MIGHT fire, including effects inside conditional branches (`if.then`, `if.else`). This is intentionally over-counting — it's a heuristic, not an exact prediction. For policy scoring, "this card potentially places 3 VC guerrillas" is useful even if the actual count depends on game state.

**Seat resolution for token effects**: For `moveToken` and `createToken` effects, the target seat is determined by:
- If the zone owner is a literal seat ID → that seat
- If the zone owner is `self` or `active` → resolved based on the card's `seatOrder` metadata (first seat in order is the "intended" seat)
- If the zone owner is dynamic (expression) → attributed to a special `'dynamic'` seat key

**Variable scope resolution for setVar/addVar**: The walker distinguishes global vs. per-player variables by checking whether the variable ID appears in `GameDef.globalVars` or `GameDef.perPlayerVars`.

### Part C: Surface Ref Extension

Extend Spec 99's `activeCard.*` surface ref pattern with annotation paths. This reuses all existing visibility, parsing, and resolution infrastructure — no new expression kinds needed.

**New ref paths** (added to `parseAuthoredPolicySurfaceRef` in `policy-surface.ts`):

| Ref Path | Family | Compile-Time Type | Example |
|----------|--------|--------------------|---------|
| `activeCard.annotation.SIDE.tokenPlacements.SEAT` | `activeCardAnnotation` | `number` | `activeCard.annotation.unshaded.tokenPlacements.us` |
| `activeCard.annotation.SIDE.tokenRemovals.SEAT` | `activeCardAnnotation` | `number` | `activeCard.annotation.shaded.tokenRemovals.nva` |
| `activeCard.annotation.SIDE.tokenCreations.SEAT` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.tokenDestructions.SEAT` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.markerModifications` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.globalMarkerModifications` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.globalVarModifications` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.perPlayerVarModifications` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.varTransfers` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.drawCount` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.shuffleCount` | `activeCardAnnotation` | `number` | |
| `activeCard.annotation.SIDE.grantsOperation` | `activeCardAnnotation` | `boolean` | |
| `activeCard.annotation.SIDE.hasEligibilityOverride` | `activeCardAnnotation` | `boolean` | |
| `activeCard.annotation.SIDE.hasLastingEffect` | `activeCardAnnotation` | `boolean` | |
| `activeCard.annotation.SIDE.hasBranches` | `activeCardAnnotation` | `boolean` | |
| `activeCard.annotation.SIDE.hasPhaseControl` | `activeCardAnnotation` | `boolean` | |
| `activeCard.annotation.SIDE.hasDecisionPoints` | `activeCardAnnotation` | `boolean` | |
| `activeCard.annotation.SIDE.effectNodeCount` | `activeCardAnnotation` | `number` | |

Where `SIDE` is `unshaded` or `shaded`, and `SEAT` is a literal seat ID or `self` (resolved to the evaluating agent's seat at runtime).

**New surface family** (added to `CompiledAgentPolicySurfaceRefFamily`):

```typescript
export type CompiledAgentPolicySurfaceRefFamily =
  | 'globalVar'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'    // Spec 99
  | 'activeCardTag'         // Spec 99
  | 'activeCardMetadata'    // Spec 99
  | 'activeCardAnnotation'; // NEW: Spec 100
```

**Visibility configuration** (in game agent profiles):

```yaml
agents:
  visibility:
    activeCardAnnotation:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
```

**Resolution at runtime** (in `policy-runtime.ts`): When resolving an `activeCardAnnotation` family ref:
1. Resolve the active card ID via `resolveCurrentEventCardState(def, state)` (existing function)
2. Look up the card's annotation in `GameDef.cardAnnotationIndex.entries[cardId]`
3. Extract the requested side → metric → optional seat value
4. If the annotation or side doesn't exist, return `undefined` (handled by `coalesce`)

### Part D: YAML Authoring Examples

**Prefer events that place tokens for my faction**:
```yaml
stateFeatures:
  eventPlacesMyTokens:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.tokenPlacements.self }
        - 0

scoreTerms:
  preferEventsPlacingMyTokens:
    when:
      ref: feature.isEvent
    weight: 2
    value:
      ref: feature.eventPlacesMyTokens
```

**Avoid events that remove my tokens**:
```yaml
stateFeatures:
  eventRemovesMyTokens:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.tokenRemovals.self }
        - 0

scoreTerms:
  penalizeEventsRemovingMyTokens:
    when:
      ref: feature.isEvent
    weight: -3
    value:
      ref: feature.eventRemovesMyTokens
```

**Prefer events that grant free operations to my faction**:
```yaml
stateFeatures:
  eventGrantsMyOperation:
    type: boolean
    expr:
      coalesce:
        - { ref: activeCard.annotation.unshaded.grantsOperation }
        - false
```

**Detect marker-heavy events** (strategically significant in FITL for support/opposition shifts):
```yaml
stateFeatures:
  eventModifiesMarkers:
    type: number
    expr:
      add:
        - coalesce:
            - { ref: activeCard.annotation.unshaded.markerModifications }
            - 0
        - coalesce:
            - { ref: activeCard.annotation.unshaded.globalMarkerModifications }
            - 0
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
                - { ref: activeCard.annotation.unshaded.tokenPlacements.self }
                - 0
        - mul:
            - -1
            - coalesce:
                - { ref: activeCard.annotation.unshaded.tokenRemovals.self }
                - 0
        - coalesce:
            - { ref: activeCard.annotation.unshaded.markerModifications }
            - 0
```

### Part E: Shaded vs. Unshaded Evaluation

In FITL's card-driven turn flow, the first eligible player chooses to play the event (unshaded) or operate. The second eligible player gets the opposite — if first player operated, second can play the event (and may choose shaded). The specific side selection logic is game-specific and handled by the turn flow, not the policy.

For policy scoring purposes, the agent can evaluate BOTH sides and compare:
- If `eventUnshadedQuality > 0` → event is beneficial, prefer playing it
- If `eventShadedQuality > eventUnshadedQuality` → opponent would benefit more from shaded, consider playing it to deny them

This requires the agent to evaluate quality for both sides, which the `activeCard.annotation.SIDE.*` ref pattern supports naturally via the `SIDE` path segment.

## Testing Requirements

1. **Walker test**: Verify annotation counts for a known FITL event card (e.g., Gulf of Tonkin: unshaded places US tokens, shaded removes US aid).
2. **Conservative counting test**: Verify that conditional branches contribute to counts (both if/else branches counted).
3. **Per-seat attribution test**: Verify `tokenPlacements` correctly attributes to the right seats based on zone ownership.
4. **Marker annotation test**: Verify `markerModifications` and `globalMarkerModifications` counts for a card with support/opposition shifts.
5. **Index completeness test**: All 130 FITL event cards produce annotations.
6. **Surface ref resolution test**: `activeCard.annotation.unshaded.tokenPlacements.us` resolves to the correct count given a known game state.
7. **Self-seat resolution test**: `activeCard.annotation.unshaded.tokenPlacements.self` resolves differently for each agent seat.
8. **Cross-game test**: Texas Hold'em (no event decks) produces an empty annotation index. Surface refs using `coalesce` fall back cleanly.
9. **Golden test**: FITL annotation index golden fixture for regression testing.
10. **Evolution test**: Modify one card's effects in YAML, recompile, verify annotations update.
11. **Visibility test**: When `activeCardAnnotation` visibility is `hidden`, annotation refs return `undefined`.
12. **Preview test**: `preview.activeCard.annotation.unshaded.tokenPlacements.us` resolves through the preview surface path.

## Files Modified

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Add `CompiledEventSideAnnotation`, `CompiledEventCardAnnotation`, `CompiledEventAnnotationIndex` types. Add `cardAnnotationIndex` to `GameDef`. Add `activeCardAnnotation` to `CompiledAgentPolicySurfaceRefFamily`. Extend `CompiledAgentPolicySurfaceCatalog` with `activeCardAnnotation` visibility entry. |
| `packages/engine/src/kernel/schemas-core.ts` | Add JSON Schema for `cardAnnotationIndex` field on GameDef. |
| `packages/engine/src/cnl/compile-event-annotations.ts` | **NEW**: Effect AST walker that builds `CompiledEventAnnotationIndex` from compiled event decks. Reuses recursive descent pattern from `effect-compiler-patterns.ts:walkEffects`. |
| `packages/engine/src/cnl/compiler-core.ts` | Call `buildEventAnnotationIndex()` after `buildCardMetadataIndex()` in GameDef assembly (~line 731). Store result in `cardAnnotationIndex`. |
| `packages/engine/src/agents/policy-surface.ts` | Extend `parseAuthoredPolicySurfaceRef` for `activeCard.annotation.*` ref paths. Extend `getPolicySurfaceVisibility` for `activeCardAnnotation` family. |
| `packages/engine/src/agents/policy-runtime.ts` | Extend surface resolution provider to resolve `activeCardAnnotation` refs via `resolveCurrentEventCardState` + annotation index lookup. |
| `packages/engine/src/cnl/compile-agents.ts` | Extend `lowerSurfaceVisibility` to parse and compile `activeCardAnnotation` visibility from authored YAML. Extend `resolveSurfaceRuntimeRef` to handle annotation paths. |
| `data/games/fire-in-the-lake/92-agents.md` | Add visibility entry for `activeCardAnnotation`. |

## Risks

- **Annotation accuracy**: Conservative counting over-estimates. A card with `if condition: place 3 tokens; else: place 0 tokens` reports `tokenPlacements: 3` even when the condition is usually false. Mitigation: This is a heuristic signal, not an exact prediction. Over-estimation is better than under-estimation for safety-oriented scoring.
- **Dynamic seat resolution**: Effects targeting dynamic zones (expression-computed seats) can't be attributed at compile time. Mitigation: Attributed to `'dynamic'` seat key, which the policy can check separately.
- **Variable scope resolution**: Distinguishing global vs. per-player variables requires checking against `GameDef.globalVars`/`perPlayerVars` lists during annotation building. The annotation builder runs after variable lowering, so these lists are available.
- **Walker completeness**: The walker must handle all 34 effect kinds. Unrecognized kinds contribute only to `effectNodeCount`. Mitigation: The walker uses `_k` discriminant tags for exhaustive dispatch, and the existing `walkEffects` pattern handles all control-flow nesting.
- **Spec 99 dependency**: Card annotations are useless without card identity. Spec 99 must be implemented first (already completed).
