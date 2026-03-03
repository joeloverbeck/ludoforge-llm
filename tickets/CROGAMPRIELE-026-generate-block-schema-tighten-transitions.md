# CROGAMPRIELE-026: Tighten PieceGenerateBlockSchema transitions and statusDimensions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel schema
**Deps**: `archive/tickets/CROGAMPRIELE-001-combinatorial-piece-generation.md`, `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-010-texas-holdem-spec-migration.md`

## Problem

`PieceGenerateBlockSchema` in `schemas-gamespec.ts` has two overly permissive fields:

1. **`transitions: z.array(z.unknown())`** — A completely untyped escape hatch. `PieceStatusTransitionSchema` already exists and is well-defined. Malformed transitions in generate blocks pass schema validation without any signal. Since `PieceCatalogPayloadSchema` is the Zod source of truth for JSON Schema generation, the generated JSON Schema will accept anything in the `transitions` array.

2. **`statusDimensions: z.array(z.union([PieceStatusDimensionSchema, StringSchema]))`** — `PieceStatusDimensionSchema` is `z.union([z.literal('activity'), z.literal('tunnel')])`, which is a strict subset of `StringSchema` (`z.string().min(1)`). The union is effectively equivalent to just `z.array(StringSchema)` — the enum branch never determines validation. If the intent is to support both known dimensions AND arbitrary custom ones, a comment should clarify. If the intent is to validate known dimensions, the `StringSchema` escape defeats it.

## Assumption Reassessment (2026-03-03)

1. `PieceGenerateBlockSchema` at `schemas-gamespec.ts:54-68` uses `z.unknown()` for transitions. **Verified.**
2. `PieceStatusTransitionSchema` exists and is used by `PieceTypeCatalogEntrySchema`. **Verified.**
3. `PieceStatusDimensionSchema` is `z.union([z.literal('activity'), z.literal('tunnel')])`. **Verified.**
4. Texas Hold'em generate block uses `statusDimensions: []` and `transitions: []`, so neither field is exercised by current test data. **Verified.**
5. After expansion, concrete entries ARE validated by `PieceTypeCatalogEntrySchema` which uses the strict schemas. **Verified.**

## Architecture Check

1. Tightening the generate block schema catches malformed specs earlier, at Zod parse time rather than after expansion. This is consistent with the "fail fast" principle — authors get immediate feedback.
2. The `statusDimensions` decision depends on whether the engine will support custom dimensions beyond `activity`/`tunnel`. If yes, `StringSchema` is correct but needs a comment. If no, `PieceStatusDimensionSchema` alone is correct.
3. No game-specific logic — this is pure schema infrastructure.
4. No backwards-compatibility shims.

## What to Change

### 1. Replace `z.unknown()` with `PieceStatusTransitionSchema` for transitions

```typescript
transitions: z.array(PieceStatusTransitionSchema),
```

This ensures generate blocks declare valid transitions at parse time.

### 2. Clarify or tighten `statusDimensions`

**Option A** (if custom dimensions are planned): Keep `z.union([PieceStatusDimensionSchema, StringSchema])` but add a comment explaining the intent.

**Option B** (if only known dimensions): Use `z.array(PieceStatusDimensionSchema)` to match `PieceTypeCatalogEntrySchema`.

Recommend Option A with comment, since the brainstorming spec mentions extensibility.

## Files to Touch

- `packages/engine/src/kernel/schemas-gamespec.ts` (modify — tighten `PieceGenerateBlockSchema`)

## Out of Scope

- Adding new status dimensions
- Changes to `PieceTypeCatalogEntrySchema`
- Changes to the expansion pipeline logic

## Acceptance Criteria

### Tests That Must Pass

1. Texas Hold'em spec with `generate:` block (transitions: [], statusDimensions: []) still parses.
2. A generate block with a valid `PieceStatusTransition` in `transitions` parses.
3. A generate block with a malformed transition entry is rejected at parse time.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Generate block transitions are validated to the same schema as concrete piece type transitions.
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/schemas-gamespec.test.ts` — Add test: generate block with valid transition parses.
2. `packages/engine/test/unit/kernel/schemas-gamespec.test.ts` — Add test: generate block with malformed transition is rejected.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
