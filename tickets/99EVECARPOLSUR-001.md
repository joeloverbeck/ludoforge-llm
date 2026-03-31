# 99EVECARPOLSUR-001: Add compiled card metadata types and GameDef field

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — types-core.ts (new types, GameDef extension)
**Deps**: Spec 99

## Problem

The policy evaluator cannot access event card metadata because there is no compiled lookup structure for card identity, tags, and scalar metadata fields. A `CompiledCardMetadataIndex` type and corresponding `GameDef` field are needed as the foundation for all subsequent card surface work.

## Assumption Reassessment (2026-03-31)

1. `GameDef` is defined at `packages/engine/src/kernel/types-core.ts:621` — confirmed, currently has `eventDecks?: readonly EventDeckDef[]` but no card metadata index.
2. `EventCardDef` is in `packages/engine/src/kernel/types-events.ts:93` with `id`, `tags?`, `metadata?` fields — confirmed, matches spec.
3. `EventCardMetadata` at `types-events.ts:89` uses `readonly [key: string]: string | number | boolean | readonly string[]` — confirmed. Array values must be excluded from the compiled index (not scalar-addressable).
4. `CompiledAgentPolicySurfaceRefFamily` at `types-core.ts:338` currently has 5 families — confirmed, no card families exist yet.

## Architecture Check

1. Placing the index on `GameDef` (not `AgentPolicyCatalog`) maintains clean separation: card metadata is game definition data derived from event deck compilation, not agent-specific policy data.
2. The index uses generic `cardId`, `deckId`, `tags`, `metadata` fields — no game-specific logic. Any game with event decks gets an index.
3. No backwards-compatibility shims — this is a purely additive change (optional field on `GameDef`).

## What to Change

### 1. Add `CompiledCardMetadataEntry` and `CompiledCardMetadataIndex` types

In `packages/engine/src/kernel/types-core.ts`, add:

```typescript
export interface CompiledCardMetadataEntry {
  readonly deckId: string;
  readonly cardId: string;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface CompiledCardMetadataIndex {
  readonly entries: Readonly<Record<string, CompiledCardMetadataEntry>>;
}
```

Place these near the other compiled agent policy types (around line 480+).

### 2. Add `cardMetadataIndex` to `GameDef`

Add an optional field to the `GameDef` interface:

```typescript
readonly cardMetadataIndex?: CompiledCardMetadataIndex;
```

Place it logically near `eventDecks` (around line 646).

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)

## Out of Scope

- Building the index at compile time (ticket 002)
- Surface ref families and parsing (ticket 003)
- Visibility catalog changes (ticket 004)
- Runtime resolution (ticket 005)
- JSON Schema updates for GameDef (not required — schemas are generated from types)

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compiles with no errors: `pnpm -F @ludoforge/engine build`
2. Existing test suite passes unchanged: `pnpm -F @ludoforge/engine test`

### Invariants

1. `CompiledCardMetadataEntry.metadata` excludes array-valued fields (only `string | number | boolean`).
2. `GameDef.cardMetadataIndex` is optional — existing GameDefs without event decks remain valid.
3. Index is keyed by `cardId` — one entry per card across all decks.

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a type-only change. Compilation is the test.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
