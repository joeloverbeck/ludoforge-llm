# LEGTOOLT-003: Normalizer Improvements

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — tooltip-normalizer-compound.ts, tooltip-ir.ts
**Deps**: LEGTOOLT-001 (schema extensions), LEGTOOLT-002 (modifier humanizer)

## Problem

The normalizer layer produces raw, confusing output:
- `normalizeChooseOne()` lists "None" as an option for optional choices instead of marking the choice as optional.
- `normalizeIf()` uses `stringifyCondition()` which produces raw AST text (e.g., `__actionClass == limitedOperation`) instead of human-readable condition strings. Internal conditions (`__*`, `$__macro_*`, pattern-matched vars) should be suppressed entirely rather than emitted as `ModifierMessage`.
- `normalizeChooseN()` does not populate the `SelectMessage.filter` field from query metadata (zone filter, token filter).

## Assumption Reassessment (2026-03-07)

1. `ChooseMessage` in `tooltip-ir.ts` currently has no `optional` field — needs to be added.
2. `normalizeIf()` in `tooltip-normalizer-compound.ts:131-151` uses `stringifyCondition(when)` to produce raw condition text for ModifierMessage. Must switch to `humanizeCondition()` from `tooltip-modifier-humanizer.ts`.
3. `SuppressedMessage` already exists in `tooltip-ir.ts:179-182` — can be reused when humanizeCondition returns null.
4. `normalizeChooseOne()` at line 104-115 reads enum values directly; "none"/"None" detection is not present.
5. `normalizeChooseN()` at line 86-102 checks `isSpaceQuery`/`isTokenQuery` but does not extract filter metadata from query params.

## Architecture Check

1. Using `humanizeCondition()` from the already-implemented modifier humanizer (LEGTOOLT-002) replaces raw `stringifyCondition()` — cleaner, label-resolved output.
2. All changes are in the generic tooltip pipeline, not game-specific code. `NormalizerContext` already carries verbalization and suppressPatterns.
3. No backwards-compatibility shims — `stringifyCondition()` export in compound normalizer remains for other internal uses but `normalizeIf()` switches to the humanizer.

## What to Change

### 1. Add `optional` field to `ChooseMessage` in `tooltip-ir.ts`

Add `readonly optional?: boolean` to the `ChooseMessage` interface.

### 2. Detect "None" option in `normalizeChooseOne()`

In `tooltip-normalizer-compound.ts`, `normalizeChooseOne()`:
- When options include a value matching `none` (case-insensitive), set `optional: true` on the emitted `ChooseMessage` and filter the "none" value from the `options` array.

### 3. Replace `stringifyCondition` with `humanizeCondition` in `normalizeIf()`

In `tooltip-normalizer-compound.ts`, `normalizeIf()`:
- Import `humanizeCondition` from `./tooltip-modifier-humanizer.js`.
- Call `humanizeCondition(when, ctx)` instead of `stringifyCondition(when)`.
- If `humanizeCondition` returns `null` (suppressed condition), emit a `SuppressedMessage` instead of a `ModifierMessage`. Still recurse into `then`/`else` effects.
- If it returns a string, use that as the `condition` and `description` for the `ModifierMessage`.

### 4. Populate `SelectMessage.filter` from query metadata in `normalizeChooseN()`

In `tooltip-normalizer-compound.ts`, `normalizeChooseN()`:
- When the query is a space query (`mapSpaces`, `zones`, `adjacentZones`), extract the `zone` or `filter` field from the query params and populate `SelectMessage.filter`.
- When the query is a token query (`tokensInZone`, etc.), extract the `token` or `filter` field and populate `SelectMessage.filter`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `optional` to `ChooseMessage`)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — all three normalizer changes)

### 5. Narrow `resolveModifierEffect()` lookup by capability variable name

In `tooltip-modifier-humanizer.ts`, `resolveModifierEffect()` currently scans ALL `modifierEffects` entries to find a string match. Instead, extract the primary variable name from the condition AST (e.g., if the condition references `cap_m48Patton`, look up `modifierEffects['cap_m48Patton']` directly) and match within that narrower set. This is cleaner and avoids O(n*m) scanning across all capabilities.

## Out of Scope

- Template realizer changes for how `optional` is displayed (LEGTOOLT-005)
- React UI changes (LEGTOOLT-006)
- Modifier deduplication (already done in LEGTOOLT-004)

## Acceptance Criteria

### Tests That Must Pass

1. `normalizeChooseOne()` with enum values including "None" emits `ChooseMessage` with `optional: true` and "None" filtered from options
2. `normalizeChooseOne()` with enum values including "none" (lowercase) also sets `optional: true`
3. `normalizeChooseOne()` without "None" emits `optional` as undefined
4. `normalizeIf()` with `__actionClass == limitedOperation` condition emits `SuppressedMessage` (not `ModifierMessage`)
5. `normalizeIf()` with `$__macro_*` condition emits `SuppressedMessage`
6. `normalizeIf()` with a normal condition (e.g., `aid >= 3`) emits `ModifierMessage` with human-readable condition string (e.g., "Aid ≥ 3") using label resolution
7. `normalizeIf()` with suppressed condition still recurses into then/else effects
8. `normalizeChooseN()` with space query populates `filter` field on `SelectMessage`
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No game-specific logic in the normalizer — all behavior driven by `NormalizerContext` (verbalization, suppressPatterns)
2. `stringifyCondition()` export remains available for other callers — only `normalizeIf()` switches to `humanizeCondition()`
3. All existing tests that don't test budget/truncation continue to pass unchanged

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add tests for optional choose detection, suppressed modifier conditions, filter population on select messages

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="tooltip-normalizer"` (targeted)
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full)
