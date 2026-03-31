# Spec 99: Event Card Policy Surface

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 15 (completed — policy IR foundation)
**Blocks**: Spec 100 (effect annotations need card identity to look up summaries)
**Benefits from**: Spec 98 (preview tolerance enables projected event outcomes)
**Estimated effort**: 5-8 days

## Problem Statement

The agent policy evaluator is completely blind to event cards. When an `event` action is among the legal moves, the agent can detect `candidate.actionId == "event"` and apply a flat `eventWeight` preference, but it cannot:

1. See WHICH card is currently available (card ID, title)
2. Read card tags (`pivotal`, `momentum`, `capability`)
3. Read card metadata (`period`, faction affinity, `seatOrder`)
4. Distinguish shaded vs. unshaded sides
5. Evaluate whether the event helps or hurts the deciding faction
6. Identify pivotal events and their special significance

**Consequence**: Every event card is treated identically. The agent applies the same flat weight to "Gulf of Tonkin" (game-changing US escalation) and "Burning Bonze" (minor local effect). A real player carefully evaluates each event before deciding whether to play it, operate instead, or pass to deny it to opponents.

This was confirmed in the FITL VC agent evolution campaign: removing `eventWeight` entirely (exp-015) had zero effect on outcomes — events are either the only option or never chosen over Rally/Tax. The agent cannot make informed event decisions.

### Scope of the Problem

The kernel already stores event card definitions in `GameDef.eventDecks[].cards[]` with rich metadata:

```typescript
interface EventCardDef {
  readonly id: string;
  readonly title: string;
  readonly sideMode: 'single' | 'dual';
  readonly order?: number;
  readonly tags?: readonly string[];
  readonly metadata?: EventCardMetadata;  // { [key: string]: string | number | boolean | string[] }
  readonly playCondition?: ConditionAST;
  readonly unshaded?: EventSideDef;
  readonly shaded?: EventSideDef;
}
```

And the kernel can resolve the current event card via `resolveCurrentEventCardState(def, state)` (in `event-execution.ts:209-229`). But NONE of this information flows through the policy surface system into the policy evaluator.

## Goals

- Expose event card identity and metadata to the policy evaluator through the existing surface visibility pattern
- Enable policy profiles to score event actions based on card tags, metadata fields, and faction affinity
- Maintain engine agnosticism: the surface system reads generic card fields, not game-specific semantics
- Enable evolution: card metadata is authored in YAML, card tags are authored in YAML, all evolvable
- Support any game with event decks (not just FITL)

## Non-Goals

- Evaluating event EFFECTS (what the card does) — that's Spec 100
- Evaluating event PRECONDITIONS (when the card is playable) — that's Spec 101
- Adding game-specific event categories (like "VC-favorable") to the engine
- Modifying event execution or the turn flow
- Supporting multi-deck card comparison (only the current active card)

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | Reads generic `EventCardDef` fields (id, tags, metadata). No game-specific logic. Works for any game with event decks. |
| **2. Evolution-First** | Card tags and metadata live in GameSpecDoc YAML. Policy scoring criteria live in YAML. All evolvable by LLMs. |
| **6. Schema Ownership** | No per-game schema. Uses existing `EventCardDef` and `EventCardMetadata` interfaces. New surface families are generic (not card-specific types). |
| **7. Specs Are Data** | Card metadata index is a compiled lookup table — no executable code, no eval. |
| **8. Determinism** | Surface resolution is a pure lookup. Same state = same card = same surface values. |
| **10. Bounded Computation** | O(1) card lookup via index + O(tags) tag membership check. No iteration over decks or cards at resolution time. |
| **11. Immutability** | Read-only access to compiled metadata index. No state mutation. |
| **12. Compiler-Kernel Boundary** | Compiler builds the metadata index from YAML. Agent compiler validates ref paths and visibility at compile time. Runtime performs state-dependent resolution. |
| **15. Architectural Completeness** | Extends the existing surface family system rather than creating parallel ref kinds. Reuses all visibility, parsing, and resolution infrastructure without duplication. |
| **16. Testing as Proof** | Golden tests for compiled metadata index. Integration tests for FITL event card surface resolution. Cross-game test with Texas Hold'em (no event decks — graceful no-op). |
| **17. Branded Types** | Card IDs should use a branded `EventCardId` type if not already branded. |

## Design

### Part A: Compiled Card Metadata Index

At compile time, build a `CompiledCardMetadataIndex` from `GameDef.eventDecks`. This index lives on `GameDef` directly — it is game definition data derived from event deck compilation, not agent policy data.

```typescript
// In types-core.ts
interface CompiledCardMetadataEntry {
  readonly deckId: string;
  readonly cardId: string;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  // Array-valued metadata fields are excluded (not scalar-addressable in policy expressions)
}

interface CompiledCardMetadataIndex {
  readonly entries: Readonly<Record<string, CompiledCardMetadataEntry>>;
  // keyed by cardId
}

// On GameDef:
readonly cardMetadataIndex?: CompiledCardMetadataIndex;
```

**Compilation step** (in `compile-event-cards.ts`): After compiling event decks via `lowerEventDecks`, iterate `eventDecks[].cards[]` and extract `{ deckId, cardId, tags, metadata }` for each card. Flatten metadata to scalar values only (drop arrays — they're not addressable in policy expressions). Store as a lookup table keyed by `cardId`.

**Rationale for location**: The card metadata index is derived from event deck definitions, not from authored agent policy YAML. Placing it on `GameDef` (not inside `AgentPolicyCatalog`) maintains clean separation: the agent compiler reads the index but doesn't own it.

### Part B: Active Card Resolution

The "active card" is the currently revealed event card — the top token in the event deck's **discard zone** (face-up after being drawn from the draw pile).

**Resolution logic** (agent layer, not kernel):
1. Call `resolveCurrentEventCardState(def, state)` from `event-execution.ts:209-229` — this iterates `GameDef.eventDecks`, checks `discardZone[0]` for each deck, extracts the `cardId` from the top token's props, and returns `{ deckId, card }` or `null`
2. Look up the card's `cardId` in `GameDef.cardMetadataIndex.entries`
3. Return `CompiledCardMetadataEntry | undefined`

This is a read-only operation on existing game state. No kernel changes needed. The resolution is O(decks) for finding the active card + O(1) for the index lookup.

### Part C: Surface Family Extension

Extend the existing surface family system with three new families. This reuses all visibility, parsing, and resolution infrastructure — no new ref kinds or switch cases in `resolveRef`.

**New families** (added to `CompiledAgentPolicySurfaceRefFamily` in `types-core.ts`):

```typescript
export type CompiledAgentPolicySurfaceRefFamily =
  | 'globalVar'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'    // NEW: card id, deck id
  | 'activeCardTag'         // NEW: tag membership check
  | 'activeCardMetadata';   // NEW: scalar metadata value
```

**Ref paths** (parsed by extended `parseAuthoredPolicySurfaceRef` in `policy-surface.ts`):

| Ref Path | Family | ID | Compile-Time Type |
|----------|--------|----|-------------------|
| `activeCard.id` | `activeCardIdentity` | `'id'` | `id` |
| `activeCard.deckId` | `activeCardIdentity` | `'deckId'` | `id` |
| `activeCard.hasTag.TAG` | `activeCardTag` | tag name | `boolean` |
| `activeCard.metadata.KEY` | `activeCardMetadata` | metadata key | `unknown` |

Preview variants (`preview.activeCard.*`) are supported through the existing `resolvePreviewRuntimeRef` path in `compile-agents.ts`, which strips the `preview.` prefix and delegates to `resolveSurfaceRuntimeRef` with `preview: true`.

**Type `unknown` for metadata**: Card metadata values are heterogeneous — `period` is a string, `vcFavorability` is a number. The compile-time type is `unknown` (matching the precedent set by `option.value` in completionScoreTerms). Authors wrap metadata refs in stateFeatures with explicit type annotations:

```yaml
stateFeatures:
  cardPeriod:
    type: id
    expr:
      ref: activeCard.metadata.period
  cardFavorability:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.metadata.vcFavorability }
        - 0
```

**Resolution at runtime** (in `policy-runtime.ts` → surface resolution provider): The existing `resolveSurface` method dispatches on `ref.family`. Extend it to handle the three new families by calling the active card resolution logic from Part B, then extracting the requested field:

- `activeCardIdentity` with `id: 'id'` → `entry.cardId`
- `activeCardIdentity` with `id: 'deckId'` → `entry.deckId`
- `activeCardTag` with `id: tagName` → `entry.tags.includes(tagName)`
- `activeCardMetadata` with `id: key` → `entry.metadata[key]`

If no active card exists (no event decks, empty discard zones), all refs return `undefined`. The `coalesce` operator (already implemented in `policy-evaluation-core.ts:460-467`) handles fallback values in expressions.

### Part D: Visibility Configuration

Extend `CompiledAgentPolicySurfaceCatalog` with three new flat categories, consistent with the existing `globalVars`, `perPlayerVars`, `derivedMetrics`, and `victory` pattern:

```typescript
interface CompiledAgentPolicySurfaceCatalog {
  // Existing:
  readonly globalVars: Readonly<Record<string, CompiledAgentPolicySurfaceVisibility>>;
  readonly perPlayerVars: Readonly<Record<string, CompiledAgentPolicySurfaceVisibility>>;
  readonly derivedMetrics: Readonly<Record<string, CompiledAgentPolicySurfaceVisibility>>;
  readonly victory: {
    readonly currentMargin: CompiledAgentPolicySurfaceVisibility;
    readonly currentRank: CompiledAgentPolicySurfaceVisibility;
  };
  // NEW — flat categories, not nested under a parent:
  readonly activeCardIdentity: CompiledAgentPolicySurfaceVisibility;
  readonly activeCardTag: CompiledAgentPolicySurfaceVisibility;
  readonly activeCardMetadata: CompiledAgentPolicySurfaceVisibility;
}
```

**YAML authoring** (in game agent profiles):

```yaml
agents:
  visibility:
    activeCardIdentity:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardTag:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardMetadata:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
```

Games with hidden event cards can set these to `hidden` or use `seatVisible` for seat-restricted access. Each category has independent visibility — a game might expose card identity but hide metadata.

**Compilation** (in `compile-agents.ts` → `lowerSurfaceVisibility`): Parse the three new visibility entries from authored YAML and store them in the catalog. If omitted, default to `hidden` (opt-in visibility, matching the principle that surfaces must be explicitly declared).

### Part E: YAML Authoring Examples

**State features for card tag detection** (wrapping boolean refs):

```yaml
stateFeatures:
  currentCardIsPivotal:
    type: boolean
    expr:
      ref: activeCard.hasTag.pivotal

  currentCardIsMomentum:
    type: boolean
    expr:
      ref: activeCard.hasTag.momentum
```

**Conditional event preference using card tags**:

```yaml
scoreTerms:
  stronglyPreferPivotalEvents:
    when:
      and:
        - { ref: feature.isEvent }
        - { ref: feature.currentCardIsPivotal }
    weight: 10
    value:
      boolToNumber:
        ref: feature.isEvent

  avoidMomentumEvents:
    when:
      and:
        - { ref: feature.isEvent }
        - { ref: feature.currentCardIsMomentum }
    weight: -3
    value:
      boolToNumber:
        ref: feature.isEvent
```

**Metadata-based scoring with typed stateFeature wrappers**:

```yaml
# In event card YAML:
# metadata:
#   vcFavorability: 3   # author-assigned score for VC

stateFeatures:
  cardFavorability:
    type: number
    expr:
      coalesce:
        - { ref: activeCard.metadata.vcFavorability }
        - 0

scoreTerms:
  preferFavorableEvents:
    when:
      ref: feature.isEvent
    weight: 1
    value:
      ref: feature.cardFavorability
```

### Part F: Card Tag Enrichment (FITL-Specific, in Game Data)

To make the surface immediately useful, FITL event card YAML should be enriched with strategic tags:

```yaml
# Example: Card 1 (Gulf of Tonkin)
tags:
  - us-favorable      # Unshaded side benefits US
  - escalation        # Major game state change
```

This is a DATA change in `data/games/fire-in-the-lake/41-events/*.md`, not an engine change. Game authors (or LLM evolution) add tags that the policy evaluator can read.

**Important**: This enrichment is OPTIONAL. The spec delivers the infrastructure. Game-specific tags are added incrementally as the evolution campaign identifies which tags are useful.

## Testing Requirements

1. **Compilation test**: `CompiledCardMetadataIndex` correctly extracts card IDs, tags, and scalar metadata from FITL event deck. Array-valued metadata fields are excluded.
2. **Surface resolution test**: `activeCard.id` resolves to the correct card ID given a known game state with a specific card token in the discard zone.
3. **Tag resolution test**: `activeCard.hasTag.pivotal` returns `true` for pivotal event cards, `false` for non-pivotal.
4. **Metadata resolution test**: `activeCard.metadata.period` returns the correct period string via a stateFeature wrapper with `type: id`.
5. **No-deck graceful degradation**: Games without event decks (Texas Hold'em) return `undefined` for all `activeCard.*` refs. Policy expressions using `coalesce` handle this cleanly.
6. **Visibility test**: When `activeCardIdentity` visibility is set to `hidden`, card identity refs return `undefined`.
7. **Preview test**: `preview.activeCard.id` resolves through the preview surface path, returning the active card in the previewed state.
8. **Golden test**: FITL policy catalog golden fixture includes the `cardMetadataIndex` on GameDef and updated `surfaceVisibility` with card categories.
9. **Evolution integration test**: A policy profile with event tag scoring compiles and runs through the tournament harness.

## Files Modified

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Add `CompiledCardMetadataEntry`, `CompiledCardMetadataIndex` types. Add `cardMetadataIndex` to `GameDef`. Add 3 new families to `CompiledAgentPolicySurfaceRefFamily`. Extend `CompiledAgentPolicySurfaceCatalog` with 3 new visibility entries. |
| `packages/engine/src/cnl/compile-event-cards.ts` | Build `CompiledCardMetadataIndex` after compiling event decks. |
| `packages/engine/src/agents/policy-surface.ts` | Extend `parseAuthoredPolicySurfaceRef` for `activeCard.*` ref paths. Extend `getPolicySurfaceVisibility` for 3 new families. |
| `packages/engine/src/agents/policy-runtime.ts` | Extend surface resolution provider to resolve active card families via `resolveCurrentEventCardState` + index lookup. |
| `packages/engine/src/cnl/compile-agents.ts` | Extend `lowerSurfaceVisibility` to parse and compile new visibility categories from authored YAML. |
| `data/games/fire-in-the-lake/92-agents.md` | Add visibility entries for `activeCardIdentity`, `activeCardTag`, `activeCardMetadata`. |

## Risks

- **Metadata richness**: The raw `EventCardMetadata` may not contain enough strategic information for sophisticated scoring. Mitigation: Game authors can add arbitrary metadata fields in YAML. Spec 100 adds compiler-derived effect summaries.
- **Active card resolution complexity**: Different games may structure their draw/discard piles differently (tokens vs. dedicated state). Mitigation: Resolution logic uses the existing `resolveCurrentEventCardState` function which operates on the `EventDeckDef.discardZone` contract — the kernel already maintains this.
- **Index size**: 130 FITL cards x ~5 fields each = small. No memory concern.
- **Type safety of metadata**: Metadata refs are typed `unknown` at compile time, requiring stateFeature wrappers. This adds YAML verbosity but prevents type errors. Mitigation: The `coalesce` operator provides clean fallback patterns.
