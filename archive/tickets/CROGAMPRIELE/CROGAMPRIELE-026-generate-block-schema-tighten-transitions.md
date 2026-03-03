# CROGAMPRIELE-026: Tighten PieceGenerateBlockSchema transitions and statusDimensions

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel schema
**Deps**: `archive/tickets/CROGAMPRIELE-001-combinatorial-piece-generation.md`, `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-010-texas-holdem-spec-migration.md`

## Problem

`PieceGenerateBlockSchema` in `schemas-gamespec.ts` has two overly permissive fields:

1. **`transitions: z.array(z.unknown())`** — A completely untyped escape hatch. `PieceStatusTransitionSchema` already exists and is well-defined. Malformed transitions in generate blocks pass schema validation without any signal. Since `PieceCatalogPayloadSchema` is the Zod source of truth for JSON Schema generation, the generated JSON Schema will accept anything in the `transitions` array.

2. **`statusDimensions: z.array(z.union([PieceStatusDimensionSchema, StringSchema]))`** — `PieceStatusDimensionSchema` was `z.union([z.literal('activity'), z.literal('tunnel')])`, which is a strict subset of `StringSchema` (`z.string().min(1)`). The union is effectively equivalent to just `z.array(StringSchema)` — the enum branch never determines validation.

## Assumption Reassessment (2026-03-03)

1. `PieceGenerateBlockSchema` at `schemas-gamespec.ts:54-68` uses `z.unknown()` for transitions. **Verified.**
2. `PieceStatusTransitionSchema` exists and is used by `PieceTypeCatalogEntrySchema`. **Verified.**
3. `PieceStatusDimensionSchema` was `z.union([z.literal('activity'), z.literal('tunnel')])` — hardcoded game-specific enums. **Verified.**
4. Texas Hold'em generate block uses `statusDimensions: []` and `transitions: []`, so neither field is exercised by current test data. **Verified.**
5. ~~After expansion, concrete entries ARE validated by `PieceTypeCatalogEntrySchema` which uses the strict schemas.~~ **INCORRECT** — expansion tests use custom dimensions like `'location'` which would fail the old enum-based `PieceStatusDimensionSchema`. The expansion function does not re-validate output through Zod schemas. This was a deeper inconsistency.
6. **NEW**: `PieceStatusDimensionSchema` and `PieceStatusValueSchema` hardcoded game-specific enum values (`'activity'`, `'tunnel'`, `'underground'`, `'active'`, `'untunneled'`, `'tunneled'`), violating the Agnostic Engine Rule. **Verified.**
7. **NEW**: Expansion test at `expand-piece-generation.test.ts:33` had a malformed transition `{ from: 'deck', to: 'hand' }` missing the required `dimension` field. This was silently accepted due to `z.unknown()`. **Verified.**

## Architecture Check

1. The original ticket proposed tightening `transitions` to `PieceStatusTransitionSchema`, but that schema's `dimension` field was restricted to `PieceStatusDimensionSchema` (only `'activity'`/`'tunnel'`). This would make it impossible for generate blocks to use custom dimensions — inconsistent with the `statusDimensions` field remaining flexible.
2. **Root cause**: `PieceStatusDimensionSchema` and `PieceStatusValueSchema` were game-specific enums hardcoded in kernel schemas, violating the Agnostic Engine Rule. The fix: make both schemas game-agnostic (`StringSchema.min(1)`), then both generate blocks and concrete entries use the same validation.
3. This is a cleaner architecture: `PieceStatusTransitionSchema` enforces structure (`{dimension, from, to}`) while accepting any game-defined string values.

## What Was Changed

### 1. Made PieceStatus schemas game-agnostic

`PieceStatusDimensionSchema`: `z.union([z.literal('activity'), z.literal('tunnel')])` → `StringSchema.min(1)`
`PieceStatusValueSchema`: `z.union([z.literal('underground'), ...])` → `StringSchema.min(1)`

### 2. Tightened PieceGenerateBlockSchema

`transitions`: `z.array(z.unknown())` → `z.array(PieceStatusTransitionSchema)`
`statusDimensions`: `z.array(z.union([PieceStatusDimensionSchema, StringSchema]))` → `z.array(PieceStatusDimensionSchema)` (now equivalent since `PieceStatusDimensionSchema` is `StringSchema.min(1)`)

### 3. Fixed malformed test data

`expand-piece-generation.test.ts:33`: Added missing `dimension: 'location'` to transition object.

### 4. Added schema validation tests

Four new tests in `schemas-top-level.test.ts`:
- Generate block with valid transitions parses
- Generate block with malformed transition (missing dimension) is rejected
- Generate block with custom (non-game-specific) dimensions and values parses
- Concrete piece type with custom dimensions and values parses

## Files Touched

- `packages/engine/src/kernel/schemas-gamespec.ts` (modified — game-agnostic schemas + tightened generate block)
- `packages/engine/test/unit/expand-piece-generation.test.ts` (modified — fixed malformed transition)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modified — 4 new tests)

## Acceptance Criteria

### Tests That Must Pass

1. Texas Hold'em spec with `generate:` block (transitions: [], statusDimensions: []) still parses. **PASS**
2. A generate block with a valid `PieceStatusTransition` in `transitions` parses. **PASS**
3. A generate block with a malformed transition entry is rejected at parse time. **PASS**
4. Existing suite: `pnpm turbo test` — 3451 tests, 0 failures. **PASS**
5. `pnpm turbo typecheck` — clean. **PASS**
6. `pnpm turbo lint` — clean. **PASS**

### Invariants

1. Generate block transitions are validated to the same schema as concrete piece type transitions. **SATISFIED**
2. No game-specific logic introduced — game-specific enums removed. **SATISFIED**
3. Agnostic Engine Rule compliance restored. **SATISFIED**

## Outcome

**Originally planned**: Tighten `transitions` from `z.unknown()` to `PieceStatusTransitionSchema`; clarify `statusDimensions` with a comment.

**Actually changed**: Scope expanded to fix root cause — made `PieceStatusDimensionSchema` and `PieceStatusValueSchema` game-agnostic (`StringSchema.min(1)`) to resolve Agnostic Engine Rule violation. This enabled cleanly tightening both `transitions` and `statusDimensions` in the generate block while keeping them consistent with `PieceTypeCatalogEntrySchema`. Fixed pre-existing malformed test data. Added 4 new schema validation tests.
