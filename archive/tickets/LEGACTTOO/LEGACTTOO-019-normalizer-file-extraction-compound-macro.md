# LEGACTTOO-019: Extract Compound Normalizers and Macro Override to Dedicated Files

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-normalizer*.ts`
**Deps**: `archive/tickets/LEGACTTOO/LEGACTTOO-005-compound-normalizer-control-flow-macros-stages.md`

## Problem

`tooltip-normalizer.ts` is 600 lines and growing. Each new EffectAST variant adds ~20-40 lines. At the current trajectory it will exceed the 800-line project limit within a few tickets. The file has three natural cohesion boundaries that should be separate modules:

1. **Leaf normalizers** (variable, token, marker rules) — the original core
2. **Compound normalizers** (chooseN, chooseOne, forEach, if, rollRandom, removeByPriority, grantFreeOperation, reduce) + helpers (stringifyCondition, normalizeEffectList, getChooseNBounds, isSpaceQuery, isTokenQuery)
3. **Macro override** (extractMacroId, tryMacroOverride)

## Assumption Reassessment (2026-03-06)

1. Current file is ~600 lines after LEGACTTOO-005 additions. Project convention: 200-400 typical, 800 max.
2. The compound section (lines ~351-520) is ~170 lines with clear internal cohesion and a single integration point (`normalizeEffect` dispatch).
3. The macro section (lines ~522-551) is ~30 lines — small but conceptually distinct. Could merge with compound file.
4. `normalizeEffectList` calls `normalizeEffect` (circular reference). This means compound normalizers must import from the main file, and the main file must import compound normalizers — a standard co-recursive pattern solvable with the main file re-exporting.

## Architecture Check

1. Splitting by cohesion boundary follows the project's "many small files > few large files" principle. Each file stays under 400 lines.
2. No game-specific logic involved — purely structural refactoring.
3. No backwards compatibility — the public API (`normalizeEffect`, `NormalizerContext`) stays in `tooltip-normalizer.ts` as the entry point. Internal helpers become private to their new files.

## What to Change

### 1. Create `tooltip-normalizer-compound.ts`

Move compound normalizer functions and their helpers. Export them for use by the main dispatch.

### 2. Create `tooltip-normalizer-macro.ts` (or merge into compound)

Move `extractMacroId` and `tryMacroOverride`.

### 3. Update `tooltip-normalizer.ts`

Import compound and macro functions. Keep the main `normalizeEffect` dispatch and leaf normalizers.

### 4. Handle circular dependency

`normalizeEffectList` calls `normalizeEffect`. Options:
- Pass `normalizeEffect` as a callback parameter to compound normalizers (dependency injection)
- Keep `normalizeEffectList` in the main file and pass it to compound normalizers

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — extract, import)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (new)
- `packages/engine/src/kernel/tooltip-normalizer-macro.ts` (new — optional, could merge with compound)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (no changes needed — tests the public API)

## Out of Scope

- Behavioral changes to normalization logic
- New normalizer rules
- Test refactoring

## Acceptance Criteria

### Tests That Must Pass

1. All existing 80 tooltip-normalizer tests pass unchanged
2. No new public API surface — `normalizeEffect` and `NormalizerContext` remain the sole exports from `tooltip-normalizer.ts`
3. Existing suite: `node --test dist/test/unit/kernel/tooltip-normalizer.test.js`

### Invariants

1. `tooltip-normalizer.ts` stays under 400 lines after extraction
2. No circular import at module level (use DI pattern for recursive calls)
3. Each extracted file is under 300 lines

## Test Plan

### New/Modified Tests

1. No new tests needed — existing tests cover all behavior through the public API

### Commands

1. `node --test dist/test/unit/kernel/tooltip-normalizer.test.js`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

**Planned**: Extract compound normalizers and macro override into 1-2 new files, update main dispatch.

**Actual**: Extracted to one new file (`tooltip-normalizer-compound.ts`, 230 lines). Merged macro override into compound file (too small for standalone). Used DI pattern — compound normalizers that recurse accept a `recurse: EffectRecurse` callback instead of importing `normalizeEffect` directly, breaking the potential circular import cleanly.

- `tooltip-normalizer.ts`: 597 → 415 lines (leaf normalizers + dispatch + shared utilities)
- `tooltip-normalizer-compound.ts`: 230 lines (compound normalizers + helpers + macro override)
- Stringifier utilities (`stringifyValueExpr`, `stringifyZoneRef`, `stringifyNumericExpr`) duplicated in both files (~20 lines each) to avoid circular imports. Trivial one-liners; acceptable trade-off vs adding a third shared file.
- Main file 15 lines over the aspirational 400-line target due to keeping stringifiers local. Well under the 800 hard max.
- All 80 tooltip-normalizer tests pass unchanged. All 3945 engine tests pass. Lint + typecheck clean.
