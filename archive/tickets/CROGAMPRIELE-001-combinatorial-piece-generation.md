# CROGAMPRIELE-001: Combinatorial piece generation compiler pass (A1)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler pipeline (new expansion pass), GameSpecDoc types
**Deps**: None (independent compiler pass)

## Problem

Texas Hold'em defines 52 piece types individually (~200 lines of repetitive YAML). Any card game with piece types that are a cartesian product of dimensions (suit x rank) faces the same verbosity. A `generate:` block in pieceCatalog data assets should expand into individual `pieceType` + `inventory` entries at compile time.

## Assumption Reassessment (2026-03-01)

1. `PieceCatalogPayload` exists in `types-core.ts:284` with `pieceTypes: readonly PieceTypeCatalogEntry[]` and `inventory: readonly PieceInventoryEntry[]`.
2. `PieceTypeCatalogEntry.runtimeProps?: Readonly<Record<string, string | number | boolean>>` exists (`types-core.ts:275`) — generated dimension/derived values go here.
3. `GameSpecDataAsset` has `payload: unknown` (`game-spec-doc.ts:130`), so the expansion function interprets pieceCatalog payloads dynamically.
4. Data assets are scanned in `compileExpandedDoc` → `deriveSectionsFromDataAssets`. The new expansion pass runs before this, so it only needs to rewrite the `doc.dataAssets` array entry's payload — downstream compilation handles the rest.
5. `KNOWN_DATA_ASSET_KINDS` includes `'pieceCatalog'` (`types-core.ts:256`).

## Architecture Check

1. Expansion at compile time is cleaner than runtime interpretation — the GameDef sees only individual piece types with no trace of the `generate` pattern.
2. This is game-agnostic: any game with regular piece patterns benefits. No game-specific identifiers are introduced.
3. No backwards-compatibility shims — specs using `generate:` must be explicitly authored; existing individual declarations remain supported.

## What to Change

### 1. Add `GameSpecPieceGenerateBlock` type to `game-spec-doc.ts`

Define a new interface for the `generate:` syntax used inside pieceCatalog `payload.pieceTypes`:

```typescript
export interface GameSpecPieceGenerateDimension {
  readonly name: string;
  readonly values: readonly (string | number)[];
}

export interface GameSpecPieceGenerateDerivedProp {
  readonly from: string;
  readonly map: Readonly<Record<string, string | number>>;
  readonly default?: string;
}

export interface GameSpecPieceGenerateBlock {
  readonly generate: {
    readonly idPattern: string;
    readonly seat: string;
    readonly statusDimensions: readonly string[];
    readonly transitions: readonly unknown[];
    readonly dimensions: readonly GameSpecPieceGenerateDimension[];
    readonly derivedProps?: Readonly<Record<string, GameSpecPieceGenerateDerivedProp>>;
    readonly inventoryPerCombination: number;
  };
}
```

### 2. Create `expand-piece-generation.ts`

New file implementing `expandPieceGeneration(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] }`.

Algorithm:
1. Iterate `doc.dataAssets`, find entries with `kind === 'pieceCatalog'`.
2. For each, inspect `payload.pieceTypes` for entries with a `generate` key.
3. Compute cartesian product of `dimensions[].values`.
4. For each combination, evaluate `derivedProps` (map lookup with optional default using `{dimensionName}` substitution).
5. Build `pieceType` entry: `id` from `idPattern` with placeholders substituted, `seat`/`statusDimensions`/`transitions` copied, `runtimeProps` containing all dimension + derived values.
6. Build `inventory` entry: `{ pieceTypeId: generatedId, seat: generate.seat, total: inventoryPerCombination }`.
7. Replace the `generate` entry with the expanded individual entries in the payload.
8. Return new doc with rewritten dataAssets array.

Validation (emit diagnostics on failure):
- `idPattern` must contain at least one `{...}` placeholder.
- All `{...}` placeholders must reference a dimension name or derived prop name.
- `derivedProps[].from` must reference a declared dimension name.
- Generated IDs must be unique (within the pieceCatalog).
- `dimensions` must have at least 1 entry with at least 1 value.

### 3. Create unit tests

Test file covering:
- Standard 52-card deck expansion (4 suits x 13 ranks).
- Single dimension expansion.
- Derived props with map + default.
- Duplicate ID detection.
- Missing placeholder error.
- Invalid `derivedProps.from` reference error.
- Mixed generate + individual pieceTypes in same catalog.
- No pieceCatalog assets = no-op.
- `inventoryPerCombination` > 1.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add generate block types)
- `packages/engine/src/cnl/expand-piece-generation.ts` (new)
- `packages/engine/test/unit/expand-piece-generation.test.ts` (new)

## Out of Scope

- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- `expandTemplates` orchestrator (CROGAMPRIELE-008)
- Any other expansion passes (002-005)
- Kernel type changes (006, 007)
- JSON Schema updates (009)
- Game spec migrations (010, 011)
- Runtime interpretation of `generate` blocks — they compile away completely

## Acceptance Criteria

### Tests That Must Pass

1. Cartesian product of 2 dimensions (4x13) produces 52 individual pieceType entries with correct IDs and runtimeProps.
2. Derived props are evaluated correctly: map hit uses mapped value, map miss uses default with `{dim}` substitution, no default uses raw value.
3. Each generated pieceType has an accompanying inventory entry with `total: inventoryPerCombination`.
4. Duplicate generated IDs produce a diagnostic error.
5. Invalid `idPattern` (no placeholders) produces a diagnostic error.
6. Unresolved `{...}` placeholders in `idPattern` produce a diagnostic error.
7. Invalid `derivedProps.from` (referencing non-existent dimension) produces a diagnostic error.
8. Mixed `generate` + individual entries in same pieceCatalog are handled correctly.
9. Doc with no pieceCatalog assets passes through unchanged.
10. Existing suite: `pnpm turbo test`

### Invariants

1. `expandPieceGeneration` is a pure function: same input doc produces same output doc.
2. Output doc's pieceCatalog payloads contain only individual `PieceTypeCatalogEntry` entries — no `generate` blocks remain.
3. No mutation of the input `GameSpecDoc`.
4. Diagnostics use `CNL_COMPILER_DIAGNOSTIC_CODES` patterns consistent with existing compiler diagnostics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-piece-generation.test.ts` — covers all 9 scenarios above. Rationale: validates the expansion algorithm, edge cases, and error reporting.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-piece-generation.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

All deliverables implemented:

- **`game-spec-doc.ts`**: Added `GameSpecPieceGenerateDimension`, `GameSpecPieceGenerateDerivedProp`, `GameSpecPieceGenerateBlock` interfaces.
- **`compiler-diagnostic-codes.ts`**: Added `COMPILER_DIAGNOSTIC_CODES_PIECE_GENERATION` group with 8 error codes, merged into `CNL_COMPILER_DIAGNOSTIC_CODES`.
- **`expand-piece-generation.ts`** (new, ~270 lines): Pure expansion pass with cartesian product, derived prop evaluation, pattern substitution, and 8-check validation.
- **`cnl/index.ts`**: Added barrel export.
- **`expand-piece-generation.test.ts`** (new, 13 tests): Covers 52-card deck, single dimension, derived props, duplicate ID, missing placeholder, invalid derivedProps.from, mixed generate+individual, no pieceCatalog, inventoryPerCombination > 1, unresolved placeholder, empty dimensions, empty values, multiple pieceCatalog assets.

Verification: build passes, 3181 tests pass (0 failures), typecheck clean, lint clean.
