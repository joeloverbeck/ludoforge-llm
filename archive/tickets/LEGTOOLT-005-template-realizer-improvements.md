# LEGTOOLT-005: Template Realizer Improvements

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — tooltip-template-realizer.ts
**Deps**: LEGTOOLT-001 (schema extensions), LEGTOOLT-003 (normalizer improvements), LEGTOOLT-004 (budget removal)

## Problem

The template realizer produces confusing output in several areas:
- `realizeSelect()` shows "Select 1-1 spaces" instead of "Select 1 space" when min equals max, and "Select 0-2 items" instead of "Select up to 2 items" when min is 0.
- `realizeChoose()` lists "None" as an option instead of showing "(optional)" when `msg.optional === true` (after LEGTOOLT-003 adds the field).
- Step headers are not resolved through `stageDescriptions` — the pipeline has authored stage labels/descriptions (LEGTOOLT-001) but the realizer doesn't use them.
- Modifier realization only shows the `description` field; when pre-authored effect text is available from `modifierEffects`, it should render as "Condition: Effect".

## Assumption Reassessment (2026-03-07)

1. `realizeSelect()` at `tooltip-template-realizer.ts:45-53` currently formats bounds as `${min}-${max}` unconditionally.
2. `realizeChoose()` at line 156-159 maps all options through `resolveLabel` with no optional handling.
3. `realizeStep()` at lines 223-243 uses `planStep.header` directly without resolving through stageDescriptions.
4. `realizeModifier()` at line 164-165 returns only `msg.description`.
5. `realizeContentPlan()` at line 278-289 receives `VerbalizationDef` which now has `stageDescriptions` (from LEGTOOLT-001).
6. `ContentPlan` (from content planner) includes `actionLabel` but no `profileId` — profile threading may need to be added to `ContentPlan` or passed separately.

## Architecture Check

1. All changes stay in the generic realizer — no game-specific logic. Stage descriptions and modifier effects come from VerbalizationDef.
2. `profileId` threading: the `ContentPlan` or `realizeContentPlan()` needs to receive the profile ID to look up `stageDescriptions[profileId]`. This could be added as an optional parameter to `realizeContentPlan()` or as a field on `ContentPlan`.
3. No backwards-compatibility shims — direct changes to template functions.

## What to Change

### 1. Improve `realizeSelect()` bounds formatting

- When `bounds.min === bounds.max`: "Select N {target}" (not "Select N-N {target}")
- When `bounds.min === 0`: "Select up to {max} {target}"
- When `bounds.min === 1` and `bounds.max === 1`: "Select 1 {target}" (singular)
- Otherwise: keep "Select {min}-{max} {target}"
- Resolve `filter` through `resolveLabel()` when present.

### 2. Handle `optional` flag in `realizeChoose()`

- When `msg.optional === true`, append " (optional)" to the output string.
- Do not list "None" in the options (LEGTOOLT-003 already filters it from the options list).

### 3. Resolve step headers through stageDescriptions

- Thread `profileId` into the realization pipeline (add optional parameter to `realizeContentPlan()` or field on `ContentPlan`).
- In `realizeStep()`, resolve the step header: check `stageDescriptions[profileId][header]?.label` first, then fall back to `stages[header]`, then `resolveLabel(header)`.
- If `stageDescriptions[profileId][header]?.description` exists, append it as a subtitle or secondary line.

### 4. Enhance modifier realization with pre-authored effects

- In `realizeModifier()`, when the modifier has pre-authored effect text (from `modifierEffects` lookup in the normalizer), include both condition and effect.
- The `ContentModifier` type already has `condition` and `description` fields. When `description` is not empty and differs from the condition, render as "{condition}: {description}".

## Files to Touch

- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify)
- `packages/engine/src/kernel/tooltip-content-planner.ts` (modify — add `profileId` to `ContentPlan` if needed)

## Out of Scope

- React UI rendering of collapsible steps (LEGTOOLT-006)
- Authoring FITL-specific stage descriptions (LEGTOOLT-007)
- Normalizer changes for `optional` detection (LEGTOOLT-003)

## Acceptance Criteria

### Tests That Must Pass

1. `realizeSelect()` with min=1, max=1 produces "Select 1 {target}" (not "Select 1-1 {target}")
2. `realizeSelect()` with min=0, max=3 produces "Select up to 3 {target}"
3. `realizeSelect()` with min=2, max=5 produces "Select 2-5 {target}" (unchanged)
4. `realizeChoose()` with `optional: true` appends "(optional)"
5. `realizeChoose()` without optional flag shows options normally (unchanged)
6. `realizeStep()` resolves header through stageDescriptions when profileId and matching entry exist
7. `realizeStep()` falls back to stages map, then resolveLabel when no stageDescription match
8. `realizeModifier()` shows "Condition: Effect" when description is non-empty
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No game-specific logic — all label resolution through VerbalizationDef
2. `realizeContentPlan()` signature remains backwards-compatible (profileId is optional)
3. All existing golden tests continue to pass with updated output formats

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — add tests for new bounds formatting, optional choose, stage description resolution, modifier condition+effect rendering

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="tooltip-template-realizer"` (targeted)
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full)

## Outcome

- **Completion date**: 2026-03-08
- **What changed**:
  - `tooltip-template-realizer.ts`: improved `realizeSelect()` bounds formatting (min=max, min=0, singular), added optional flag to `realizeChoose()`, enhanced `realizeModifier()` with condition+effect rendering, threaded `profileId` through `realizeContentPlan()` → `realizeStep()` → `resolveStepHeader()` for stageDescription resolution
  - `tooltip-rule-card.ts`: added optional `description` field to `ContentStep`
  - `tooltip-template-realizer.test.ts`: added 15 new tests (bounds formatting, optional choose, stage description resolution with fallbacks, modifier condition+effect, singular/plural filter labels)
- **Deviations from plan**:
  - `profileId` was added as an optional parameter to `realizeContentPlan()` rather than a field on `ContentPlan` — simpler, no content planner changes needed
  - `tooltip-content-planner.ts` was NOT modified (ticket listed it as a file to touch)
  - Post-review fix: `realizeSelect` filter labels now receive `count` for proper singular/plural resolution when min===max (not in original ticket)
- **Verification**: 4327 tests pass, typecheck clean, lint clean
