# 99EVECARPOLSUR-002: Build card metadata index during event deck compilation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compile-event-cards.ts, compile-game-spec.ts (index construction and wiring)
**Deps**: 99EVECARPOLSUR-001

## Problem

The `CompiledCardMetadataIndex` type exists but nothing populates it. The compiler must build the index from `EventDeckDef` cards after `lowerEventDecks` completes, flattening metadata to scalar values only and storing it on the compiled `GameDef`.

## Assumption Reassessment (2026-03-31)

1. `lowerEventDecks` is exported from `packages/engine/src/cnl/compile-event-cards.ts:133` — confirmed. It returns compiled `EventDeckDef[]`.
2. `EventCardDef.tags` is `readonly string[] | undefined` and `metadata` is `EventCardMetadata | undefined` where values can be `string | number | boolean | readonly string[]` — confirmed at `types-events.ts:89-103`.
3. The `GameDef` is assembled in `compile-game-spec.ts` (or equivalent top-level compiler) — need to verify exact wiring location.

## Architecture Check

1. Building the index inside the event card compilation module keeps card-related compilation logic co-located.
2. The index is a pure data derivation from already-compiled event decks — no new compilation passes or state needed.
3. Array-valued metadata fields are excluded (not scalar-addressable in policy expressions), maintaining the type contract.

## What to Change

### 1. Add `buildCardMetadataIndex` function in `compile-event-cards.ts`

Create a function that iterates all compiled event decks and their cards, extracting `{ deckId, cardId, tags, metadata }` for each card. Filter metadata to scalar values only (drop `readonly string[]` entries).

```typescript
export function buildCardMetadataIndex(
  eventDecks: readonly EventDeckDef[],
): CompiledCardMetadataIndex {
  const entries: Record<string, CompiledCardMetadataEntry> = {};
  for (const deck of eventDecks) {
    for (const card of deck.cards) {
      const scalarMetadata: Record<string, string | number | boolean> = {};
      if (card.metadata !== undefined) {
        for (const [key, value] of Object.entries(card.metadata)) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            scalarMetadata[key] = value;
          }
        }
      }
      entries[card.id] = {
        deckId: deck.id,
        cardId: card.id,
        tags: card.tags ?? [],
        metadata: scalarMetadata,
      };
    }
  }
  return { entries };
}
```

### 2. Wire the index into the compiled GameDef

In the top-level compilation function that assembles the `GameDef` object, call `buildCardMetadataIndex` when `eventDecks` is present and attach the result as `cardMetadataIndex`. Grep for where `eventDecks` is assigned to the `GameDef` literal to find the exact insertion point.

## Files to Touch

- `packages/engine/src/cnl/compile-event-cards.ts` (modify — add `buildCardMetadataIndex`)
- `packages/engine/src/cnl/compile-game-spec.ts` or equivalent top-level compiler (modify — wire index onto GameDef)

## Out of Scope

- Surface ref families and parsing (ticket 003)
- Visibility changes (ticket 004)
- Runtime resolution (ticket 005)
- Modifying event deck compilation logic itself — this is a post-processing step

## Acceptance Criteria

### Tests That Must Pass

1. Compilation test: FITL GameDef includes `cardMetadataIndex` with entries for all event cards.
2. Scalar filtering: cards with array-valued metadata fields have those fields excluded from the index entry.
3. Tags propagation: cards with `tags` have them in the index; cards without `tags` get empty arrays.
4. No-deck case: Texas Hold'em GameDef has `cardMetadataIndex` as `undefined` or with empty entries.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every card in every `EventDeckDef` has exactly one entry in the index, keyed by `cardId`.
2. No array-valued metadata appears in `CompiledCardMetadataEntry.metadata`.
3. The index is a pure function of the event decks — deterministic, no state dependency.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-event-cards.test.ts` — add tests for `buildCardMetadataIndex`: correct extraction, scalar filtering, empty tags default, multi-deck handling.
2. `packages/engine/test/integration/` — verify FITL compiled GameDef includes the index with expected card count.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "cardMetadata"` (targeted)
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - Added `buildCardMetadataIndex` function to `packages/engine/src/cnl/compile-event-cards.ts` — iterates compiled event decks, extracts scalar-only metadata per card, returns `CompiledCardMetadataIndex`.
  - Wired the index into the `GameDef` literal in `packages/engine/src/cnl/compiler-core.ts` — conditionally present when `eventDecks` is non-null.
  - Added 9 unit tests in `packages/engine/test/unit/cnl/build-card-metadata-index.test.ts`.
  - Added 2 integration tests in `packages/engine/test/integration/card-metadata-index-compilation.test.ts` (FITL has all cards indexed; Texas Hold'em has no index).
- **Deviations**: Ticket referenced `compile-game-spec.ts` which does not exist; the actual wiring location is `compiler-core.ts` as the ticket's own guidance anticipated ("or equivalent top-level compiler").
- **Verification**: 5171/5171 engine tests pass, lint 0 warnings, typecheck clean.
