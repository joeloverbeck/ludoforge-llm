# 100COMEVEEFF-004: Wire annotation builder into compiler pipeline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler core
**Deps**: `archive/tickets/100COMEVEEFF-002.md`, `tickets/100COMEVEEFF-003.md`

## Problem

The annotation builder (ticket 003) exists as an isolated module. It must be called during GameDef assembly in the compiler pipeline so that compiled GameDefs include `cardAnnotationIndex`. Without this wiring, annotations are never produced.

## Assumption Reassessment (2026-03-31)

1. `compiler-core.ts` at `packages/engine/src/cnl/compiler-core.ts:731` calls `buildCardMetadataIndex(sections.eventDecks)` and spreads the result into GameDef. The annotation builder call goes immediately after this, following the same conditional pattern.
2. The annotation builder needs the event decks AND parts of the partially-assembled GameDef (globalVars, perPlayerVars, zones) for variable scope and seat resolution. At line 731, these sections are already compiled and available.
3. JSON Schema (ticket 002) must be in place so the compiled GameDef passes validation.

## Architecture Check

1. Single call site, same pattern as `buildCardMetadataIndex`. Minimal compiler-core diff.
2. The annotation builder is called with already-compiled data — no circular dependencies.
3. Optional field: if `sections.eventDecks` is null, no `cardAnnotationIndex` is emitted. Existing games without events continue working unchanged.

## What to Change

### 1. Import `buildEventAnnotationIndex` in `compiler-core.ts`

Add import from `./compile-event-annotations.js`.

### 2. Call annotation builder after metadata index

Around line 731, after the `cardMetadataIndex` spread:

```typescript
...(sections.eventDecks === null ? {} : {
  cardAnnotationIndex: buildEventAnnotationIndex(
    sections.eventDecks,
    { globalVars: compiledGlobalVars, perPlayerVars: compiledPerPlayerVars, zones: compiledZones }
  )
}),
```

The exact parameter shape depends on what the builder signature requires (defined in ticket 003).

### 3. Integration test

Add a test that compiles the FITL production spec and asserts:
- `gameDef.cardAnnotationIndex` is defined
- `gameDef.cardAnnotationIndex.entries` is a non-empty record
- At least one entry has a non-zero `effectNodeCount`

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/integration/cnl/compile-event-annotations-integration.test.ts` (new)

## Out of Scope

- The annotation builder implementation itself (ticket 003)
- Surface ref parsing or resolution (tickets 005/006)
- Golden tests or cross-game validation (ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles with `cardAnnotationIndex` populated
2. `cardAnnotationIndex.entries` is a non-empty record with entries keyed by card ID
3. At least one annotation entry has non-zero numeric fields
4. Texas Hold'em compiles with an empty or absent `cardAnnotationIndex` (no event decks)
5. GameDef JSON validates against the updated schema
6. Existing suite: `pnpm turbo test`

### Invariants

1. `cardAnnotationIndex` is only present when event decks exist
2. GameDef assembly order: event decks → metadata index → annotation index (metadata first, annotations second)
3. No mutation of existing compiler-core logic — additive change only

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/cnl/compile-event-annotations-integration.test.ts` — compile FITL, assert annotations populated and schema-valid

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
