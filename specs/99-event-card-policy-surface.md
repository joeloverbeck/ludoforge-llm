# Spec 99: Event Card Policy Surface

**Status**: Draft
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

And the kernel can resolve the current event card via `resolveCurrentEventCardState(def, state)`. But NONE of this information flows through the policy surface system into the policy evaluator.

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
| **4. Schema Ownership** | No per-game schema. Uses existing `EventCardDef` and `EventCardMetadata` interfaces. |
| **5. Determinism** | Surface resolution is a pure lookup. Same state = same card = same surface values. |
| **6. Bounded Computation** | O(1) card lookup + O(tags) tag check. No iteration over decks or cards. |
| **7. Immutability** | Read-only access to compiled metadata index. No state mutation. |
| **8. Compiler-Kernel Boundary** | Compiler builds the metadata index from YAML. Policy evaluator performs runtime lookup. |
| **11. Testing as Proof** | Golden tests for compiled metadata index. Integration tests for FITL event card surface resolution. Cross-game test with Texas Hold'em (no event decks — graceful no-op). |
| **12. Branded Types** | Card IDs should use a branded `EventCardId` type if not already branded. |

## Design

### Part A: Compiled Card Metadata Index

At compile time, the agent compiler builds a `CompiledCardMetadataIndex` from `GameDef.eventDecks`:

```typescript
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
```

This index is stored in `GameDef.agents.cardMetadataIndex` and built by the compiler from the event deck definitions already present in the GameDef.

**Compilation step** (in `compile-agents.ts`): After compiling library items and profiles, iterate `GameDef.eventDecks[].cards[]` and extract `{ deckId, cardId, tags, metadata }` for each card. Flatten metadata to scalar values only (drop arrays — they're not addressable in policy expressions). Store as a lookup table.

### Part B: Active Card Resolution

Add a runtime provider for the "current active card" — the top card of the event draw pile that drives the current turn in card-driven turn flows.

**Resolution logic** (agent layer, not kernel):
1. Find the event deck definition in `GameDef.eventDecks`
2. Read the draw zone's token list from `GameState.zones[drawZone]`
3. The top card token's `props.cardId` (or the token ID pattern) identifies the active card
4. Look up the card in the `CompiledCardMetadataIndex`

This is a read-only operation on existing game state. No kernel changes needed.

### Part C: Policy Surface References

Add new ref paths to the policy expression system (in `compile-agents.ts` → `resolveRuntimeRef`):

| Ref Path | Type | Description |
|----------|------|-------------|
| `activeCard.id` | `id` | Current event card ID (or `undefined` if no card-driven turn flow) |
| `activeCard.deckId` | `id` | Deck that the current card belongs to |
| `activeCard.hasTag.TAG` | `boolean` | Whether the card has the specified tag |
| `activeCard.metadata.KEY` | `number` or `id` | Scalar metadata value by key |

These are compiled as a new ref kind `activeCardRef` in the `CompiledAgentPolicyRef` union:

```typescript
| {
    readonly kind: 'activeCardRef';
    readonly field: 'id' | 'deckId';
  }
| {
    readonly kind: 'activeCardTagRef';
    readonly tag: string;
  }
| {
    readonly kind: 'activeCardMetadataRef';
    readonly key: string;
  }
```

**Resolution at runtime** (in `policy-evaluation-core.ts` → `resolveRef`): Resolve the active card via the runtime provider (Part B), then read the requested field from the `CompiledCardMetadataIndex`.

### Part D: Visibility Configuration

Extend `agents.visibility` to support card surface visibility:

```yaml
agents:
  visibility:
    activeCard:
      identity:
        current: public
      tags:
        current: public
      metadata:
        current: public
```

This controls whether the policy evaluator can access card identity, tags, and metadata. Games with hidden event cards can set these to `hidden` or `seat`-restricted.

### Part E: YAML Authoring Examples

**State feature for pivotal card detection**:
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

**Conditional event preference**:
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

**Metadata-based scoring** (e.g., if game authors add faction affinity metadata):
```yaml
# In event card YAML:
# metadata:
#   vcFavorability: 3   # author-assigned score for VC

scoreTerms:
  preferFavorableEvents:
    when:
      ref: feature.isEvent
    weight: 1
    value:
      coalesce:
        - { ref: activeCard.metadata.vcFavorability }
        - 0
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

1. **Compilation test**: `CompiledCardMetadataIndex` correctly extracts card IDs, tags, and scalar metadata from FITL event deck.
2. **Surface resolution test**: `activeCard.id` resolves to the correct card ID given a known game state with a specific card on the draw pile.
3. **Tag resolution test**: `activeCard.hasTag.pivotal` returns `true` for pivotal event cards, `false` for non-pivotal.
4. **Metadata resolution test**: `activeCard.metadata.period` returns the correct period string.
5. **No-deck graceful degradation**: Games without event decks (Texas Hold'em) return `undefined` for all `activeCard.*` refs. Policy expressions using `coalesce` handle this cleanly.
6. **Visibility test**: When `activeCard.identity.current` is set to `hidden`, refs return `undefined`.
7. **Golden test**: FITL policy catalog golden includes the `cardMetadataIndex`.
8. **Evolution integration test**: A policy profile with event tag scoring compiles and runs through the tournament harness.

## Risks

- **Metadata richness**: The raw `EventCardMetadata` may not contain enough strategic information for sophisticated scoring. Mitigation: Game authors can add arbitrary metadata fields in YAML. Spec 100 adds compiler-derived effect summaries.
- **Active card resolution complexity**: Different games may structure their draw piles differently (tokens vs. dedicated state). Mitigation: Resolution logic uses the existing `EventDeckDef.drawZone` contract — the kernel already maintains this.
- **Index size**: 130 FITL cards × ~5 fields each = small. No memory concern.
