# HUMREAACTTOO-005: Binding Name Sanitization

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new utility function, normalizer updates
**Deps**: None

## Problem

After macro expansion, binding names carry compiler-internal paths like `__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece`. These leak into `tokenFilter` on MoveMessage/RemoveMessage and into binding references in `stringifyValueExpr`. Users see raw compiler internals instead of meaningful labels like "US Troops" or "Guerrillas".

## Assumption Reassessment (2026-03-08)

1. `sanitizeBindingName` function does not exist anywhere in the codebase — **verified** (grep returns no matches).
2. Macro-expanded binding names with `__macro_` prefix exist in compiled GameDefs — **needs verification at implementation time** by inspecting FITL GameDef output.
3. Binding refs surface as user-visible strings in `stringifyValueExpr` (HUMREAACTTOO-001's new module) and in `normalizeRemoveByPriority` — **needs verification at implementation time**.

## Architecture Check

1. A single `sanitizeBindingName()` utility keeps sanitization logic centralized — any new location that surfaces binding names only needs to call this function.
2. The function is game-agnostic — it detects the `__macro_` prefix convention, extracts the semantic tail, and passes it through `resolveLabel()`.
3. No backwards-compatibility shims — raw binding names were always a bug, not a feature.

## What to Change

### 1. Create `sanitizeBindingName()` utility

Location: either in `tooltip-value-stringifier.ts` (from HUMREAACTTOO-001) or as a small standalone helper in `tooltip-humanizer.ts`.

Logic:
1. Detect `__macro_` prefix.
2. Extract the final semantic segment (after the last `__`).
3. Pass through `resolveLabel()` (if a label context is available) or through the auto-humanizer fallback.
4. Non-`__macro_` names pass through unchanged.

### 2. Apply in `tooltip-value-stringifier.ts`

In the `binding` ref case of `stringifyValueExpr`, apply `sanitizeBindingName()` before returning `expr.displayName ?? expr.name`.

### 3. Apply in `tooltip-normalizer-compound.ts`

In `normalizeRemoveByPriority` (and any other location where `group.bind` or similar binding names surface as user-visible strings), apply `sanitizeBindingName()`.

### 4. Apply in `tooltip-normalizer.ts`

In any location where binding names from macro expansion surface in `tokenFilter` or similar user-visible fields on MoveMessage/RemoveMessage/PlaceMessage.

## Files to Touch

- `packages/engine/src/kernel/tooltip-value-stringifier.ts` (modify — add `sanitizeBindingName` or import it; apply in `binding` ref case)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — apply sanitization where binding names surface in token filter fields)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — apply sanitization in `normalizeRemoveByPriority` and similar)
- `packages/engine/src/kernel/tooltip-humanizer.ts` (modify — possibly add `sanitizeBindingName` here if it's a better home)

## Out of Scope

- Creating `tooltip-value-stringifier.ts` from scratch (that's HUMREAACTTOO-001)
- Modifier humanizer ref type coverage (HUMREAACTTOO-002)
- `SelectMessage.target` expansion (HUMREAACTTOO-003)
- `SummaryMessage` or macro override changes (HUMREAACTTOO-004)
- Runner UI components
- Game data verbalization authoring

## Acceptance Criteria

### Tests That Must Pass

1. New `tooltip-binding-sanitizer.test.ts` (or section in `tooltip-value-stringifier.test.ts`): `__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece` → `"piece"` (or label-resolved form).
2. New test: non-`__macro_` binding names pass through unchanged.
3. New test: `__macro_` name with no `__` segments after prefix → falls back to auto-humanizer on the full stripped name.
4. Integration: FITL Train action tooltip does not contain `__macro_` strings anywhere in the RuleCard output.
5. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

### Invariants

1. Non-macro binding names are never altered.
2. Sanitization is applied consistently everywhere binding names surface as user-visible text.
3. No game-specific logic in `sanitizeBindingName` — it detects a compiler convention (`__macro_` prefix), not game identifiers.
4. Immutability preserved — sanitization returns new strings, no mutation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-binding-sanitizer.test.ts` (or added to `tooltip-value-stringifier.test.ts`) — unit tests for `sanitizeBindingName`: macro prefix stripping, semantic segment extraction, non-macro passthrough, edge cases.
2. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — verify FITL actions don't contain `__macro_` in output.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
