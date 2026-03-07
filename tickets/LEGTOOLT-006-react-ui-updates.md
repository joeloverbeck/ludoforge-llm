# LEGTOOLT-006: React UI Updates

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: LEGTOOLT-004 (budget removal — `collapsedCount` removed from `ContentStep`), LEGTOOLT-005 (template realizer improvements)

## Problem

The React UI layer has several issues after the engine-side tooltip improvements:
- `ActionTooltip.tsx` references `step.collapsedCount` which no longer exists on the `ContentStep` type (removed in LEGTOOLT-004). This is currently a type error.
- Sub-step rendering only shows headers, not lines — sub-step content is lost.
- No collapsible disclosure for top-level steps (all steps are always expanded with no way to collapse).
- `ModifiersSection.tsx` shows condition and description as separate spans but doesn't visually distinguish pre-authored "Condition: Effect" format from raw fallback text.
- `.collapsedHint` CSS class is dead code after `collapsedCount` removal.

## Assumption Reassessment (2026-03-07)

1. `ActionTooltip.tsx:81-85` references `step.collapsedCount` — this property was removed from `ContentStep` in LEGTOOLT-004. The runner will fail to typecheck until this is fixed.
2. `ActionTooltip.tsx:72-79` renders sub-steps but only shows `sub.header` in a `<span>`, ignoring `sub.lines`.
3. `ModifiersSection.tsx:47-49` renders `mod.condition` and `mod.description` as separate spans. After LEGTOOLT-005, modifiers will have meaningful condition+effect pairs that should be rendered as tag+description.
4. `ActionTooltip.module.css:56-61` has `.collapsedHint` class — dead code to remove.
5. Runner uses Vitest for testing, not node --test.

## Architecture Check

1. All changes are runner-only (React components and CSS). No engine changes.
2. The `ContentStep` type comes from `@ludoforge/engine/runtime` — the type change is already done in LEGTOOLT-004.
3. Using `<details open>` for collapsible disclosure is semantic HTML, no framework-specific complexity needed.

## What to Change

### 1. Remove `collapsedCount` references in `ActionTooltip.tsx`

- Delete the block at lines 81-85 that checks `step.collapsedCount` and renders the "and N more..." hint.
- This is the immediate type-error fix.

### 2. Render sub-step lines (not just headers)

- In `ActionTooltip.tsx`, the sub-step rendering block (lines 72-79) currently only renders `sub.header`. Extend it to also render `sub.lines` (same pattern as top-level step lines).

### 3. Add collapsible disclosure for top-level steps

- Wrap each top-level step `<li>` content in a `<details open>` element with the step header as `<summary>`.
- This allows users to collapse individual steps for complex tooltips.
- Add `.stepDetails` and `.stepSummary` CSS classes.

### 4. Update `ModifiersSection.tsx` for condition+effect display

- Render modifier condition as a badge/tag element and effect as description text.
- When `mod.description` is empty, show only the condition.
- When `mod.description` is non-empty, show "Condition: Effect" with visual distinction (condition in bold tag, effect in normal weight).
- Add `.effectTag` and `.effectDescription` CSS classes to `ModifiersSection.module.css`.

### 5. Remove dead CSS

- Delete `.collapsedHint` class from `ActionTooltip.module.css`.

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.tsx` (modify)
- `packages/runner/src/ui/ActionTooltip.module.css` (modify — remove `.collapsedHint`, add `.stepDetails`/`.stepSummary`)
- `packages/runner/src/ui/ModifiersSection.tsx` (modify)
- `packages/runner/src/ui/ModifiersSection.module.css` (modify — add `.effectTag`/`.effectDescription`)

## Out of Scope

- Engine-side tooltip pipeline changes (all in LEGTOOLT-001 through 005)
- FITL-specific verbalization data (LEGTOOLT-007)
- Tooltip positioning or floating-ui changes

## Acceptance Criteria

### Tests That Must Pass

1. Runner typechecks cleanly: `pnpm -F @ludoforge/runner typecheck` passes (no `collapsedCount` reference error)
2. ActionTooltip renders all steps without truncation hint
3. ActionTooltip renders sub-step lines (not just headers)
4. Top-level steps render inside `<details>` elements
5. ModifiersSection renders condition+effect when description is non-empty
6. ModifiersSection renders condition-only when description is empty
7. No `.collapsedHint` class in CSS
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No engine type changes — only consumes types from `@ludoforge/engine/runtime`
2. Tooltip remains accessible (ARIA attributes, keyboard navigable)
3. No visual regression in tooltip positioning or sizing

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionTooltip.test.tsx` — update existing tests to remove collapsedCount assertions; add tests for sub-step line rendering and `<details>` disclosure
2. `packages/runner/test/ui/ModifiersSection.test.tsx` — add tests for condition+effect rendering, empty-effect case

### Commands

1. `pnpm -F @ludoforge/runner test` (targeted)
2. `pnpm -F @ludoforge/runner typecheck` (type safety)
3. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full)
