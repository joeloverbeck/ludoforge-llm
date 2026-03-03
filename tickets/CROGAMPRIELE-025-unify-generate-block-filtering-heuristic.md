# CROGAMPRIELE-025: Unify generate-block filtering heuristic

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cnl validator
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-010-texas-holdem-spec-migration.md`

## Problem

Two files filter generate blocks from concrete piece type entries using different heuristics:

- `piece-catalog.ts:38-40` — negative exclusion: `!('generate' in entry)`
- `validate-extensions.ts:113-114` — positive inclusion: `'id' in entry`

Both are semantically equivalent today (concrete entries have `id`, generate blocks have `generate` but not `id`). However, if a future change adds an `id` field to generate blocks (e.g., for diagnostic provenance tracking or deduplication), the positive-inclusion approach would silently include generate blocks in the concrete set, causing downstream validation errors.

## Assumption Reassessment (2026-03-03)

1. `piece-catalog.ts:38-40` uses `!('generate' in entry)`. **Verified.**
2. `validate-extensions.ts:113-114` uses `typeof entry === 'object' && entry !== null && 'id' in entry`. **Verified.**
3. `PieceGenerateBlockSchema` does not have an `id` field at the top level — `id` is only inside the nested `generate` object (as `idPattern`). **Verified.**
4. `PieceTypeCatalogEntrySchema` has a required `id` field at the top level. **Verified.**

## Architecture Check

1. Negative exclusion (`!('generate' in entry)`) is more robust because it explicitly identifies the template pattern rather than relying on a coincidental absence. It is also self-documenting: "filter out entries that are generate blocks."
2. No game-specific logic — this is pure compiler infrastructure.
3. No backwards-compatibility shims. One line changes.

## What to Change

### 1. Update `validate-extensions.ts` filtering to use negative exclusion

Change:
```typescript
const concretePieceTypes = rawPieceTypes.filter(
  (entry: unknown) => typeof entry === 'object' && entry !== null && 'id' in entry,
);
```
To:
```typescript
const concretePieceTypes = rawPieceTypes.filter(
  (entry: unknown) => typeof entry === 'object' && entry !== null && !('generate' in entry),
);
```

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify — line 113-114)

## Out of Scope

- Extracting a shared `isGenerateBlock` type guard (could be done but is overkill for two call sites)
- Changes to `piece-catalog.ts` (already uses the preferred pattern)
- Changes to the `PieceGenerateBlockSchema`

## Acceptance Criteria

### Tests That Must Pass

1. Texas Hold'em spec with `generate:` block compiles successfully.
2. Mixed `generate:` + concrete entries in piece catalog validate correctly.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Both filtering locations use the same heuristic.
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

None required — existing tests cover the behavior. This is a defensive consistency fix.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
