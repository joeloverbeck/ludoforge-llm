# LEGTOOLT-006: React UI Updates

**Status**: COMPLETED
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

## Assumption Reassessment (2026-03-08)

1. ~~`ActionTooltip.tsx:81-85` references `step.collapsedCount`~~ — **ALREADY DONE**: `collapsedCount` references were already removed from `ActionTooltip.tsx` in a prior ticket. No type error exists.
2. `ActionTooltip.tsx:72-79` renders sub-steps but only shows `sub.header` in a `<span>`, ignoring `sub.lines`. **CONFIRMED**.
3. `ModifiersSection.tsx:48-49` already renders `mod.condition` with `.condition` (bold) and `mod.description` with `.description` (normal weight). The visual distinction already exists. **Remaining work**: handle empty `mod.description` (skip the colon and description span when empty).
4. ~~`ActionTooltip.module.css:56-61` has `.collapsedHint` class~~ — **ALREADY DONE**: `.collapsedHint` is not present in the CSS file.
5. Runner uses Vitest for testing, not node --test. **CONFIRMED**.
6. **No existing test files** for `ActionTooltip` or `ModifiersSection` — tests must be **created**, not updated.

## Architecture Check

1. All changes are runner-only (React components and CSS). No engine changes.
2. The `ContentStep` type comes from `@ludoforge/engine/runtime` — the type change is already done in LEGTOOLT-004.
3. Using `<details open>` for collapsible disclosure is semantic HTML, no framework-specific complexity needed.

## What to Change

### 1. ~~Remove `collapsedCount` references~~ — ALREADY DONE

No action needed. References were already removed.

### 2. Render sub-step lines (not just headers)

- In `ActionTooltip.tsx`, the sub-step rendering block (lines 72-79) currently only renders `sub.header`. Extend it to also render `sub.lines` (same pattern as top-level step lines).

### 3. Add collapsible disclosure for top-level steps

- Wrap each top-level step `<li>` content in a `<details open>` element with the step header as `<summary>`.
- This allows users to collapse individual steps for complex tooltips.
- Add `.stepDetails` and `.stepSummary` CSS classes.

### 4. Handle empty modifier descriptions in `ModifiersSection.tsx`

- Keep existing `.condition`/`.description` class names (they already provide visual distinction).
- When `mod.description` is empty, show only the condition without the trailing colon.
- When `mod.description` is non-empty, show "Condition: Effect" as currently rendered.

### 5. ~~Remove dead CSS~~ — ALREADY DONE

No action needed. `.collapsedHint` is not present.

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

### New Tests (no existing test files)

1. `packages/runner/test/ui/ActionTooltip.test.tsx` — **create**: tests for sub-step line rendering and `<details>` disclosure
2. `packages/runner/test/ui/ModifiersSection.test.tsx` — **create**: tests for condition+effect rendering, empty-description case

### Commands

1. `pnpm -F @ludoforge/runner test` (targeted)
2. `pnpm -F @ludoforge/runner typecheck` (type safety)
3. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full)

## Outcome

- **Completion date**: 2026-03-08
- **What changed**:
  - `ActionTooltip.tsx`: Sub-steps now render `sub.lines` (not just headers); top-level steps wrapped in `<details open>` with `<summary>` for collapsible disclosure
  - `ActionTooltip.module.css`: Added `.stepDetails` and `.stepSummary` CSS classes
  - `ModifiersSection.tsx`: Condition omits trailing colon and description `<span>` when `mod.description` is empty
  - `ActionTooltip.test.ts`: 4 new tests (sub-step lines, empty sub-steps, `<details>` wrapping, open-by-default)
  - `ModifiersSection.test.ts`: 3 new tests (colon with description, no colon without, no description span when empty)
- **Deviations from original plan**:
  - Tasks 1 and 5 (`collapsedCount` removal, `.collapsedHint` CSS removal) were already done — skipped
  - Task 4 kept existing `.condition`/`.description` class names instead of renaming to `.effectTag`/`.effectDescription` — existing names were more descriptive and already provided visual distinction
  - Test files already existed (`.test.ts`, not `.test.tsx`) — added new tests to existing files rather than creating new ones
- **Verification**: `pnpm -F @ludoforge/runner test` (150 files, 1497 tests pass), `typecheck` clean, `lint` clean
