# CHOICEUI-001: Remove Action Hint Numbers

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None -- runner-only
**Deps**: None

## Problem

`ActionToolbar.tsx` renders sequential numeric hints (`1`, `2`, `3`, ...) next to each action button. These serve no functional purpose -- there are no keyboard shortcut bindings that correspond to these numbers. They add visual noise to the action bar without providing information value.

## Assumption Reassessment (2026-03-05)

1. The `hint` counter variable is at line 32 of `ActionToolbar.tsx`, `displayHint` assignment at lines 41-42, and the `<span className={styles.hint}>` at line 62.
2. The `.hint` CSS class is at lines 61-67 of `ActionToolbar.module.css`.
3. No keyboard shortcut system references these hint numbers -- they are purely decorative.
4. Test file `packages/runner/test/ui/ActionToolbar.test.ts` exists with 11 tests, including one (`'renders number hints in flattened visual order'`) that explicitly asserts hint values `[1, 2, 3]`.

## Architecture Check

1. Pure deletion of dead UI code. No alternative approaches needed.
2. Does not affect engine or GameSpecDoc boundaries -- runner-only cosmetic change.
3. No backwards-compatibility shims needed; hint numbers were never exposed as an API.

## What to Change

### 1. Remove hint counter logic from `ActionToolbar.tsx`

- Delete `let hint = 1;` (line 32).
- Delete `const displayHint = hint;` and `hint += 1;` (lines 41-42).
- Delete `<span className={styles.hint}>{displayHint}</span>` (line 62).

### 2. Remove `.hint` CSS class from `ActionToolbar.module.css`

- Delete the `.hint` ruleset (lines 61-67).

### 3. Update ActionToolbar tests

- Replace the `'renders number hints in flattened visual order'` test with two new tests:
  - `'does not render hint spans inside action buttons'` -- asserts no hint class in rendered HTML.
  - `'each action button contains only a label span'` -- asserts button children are a single span element.

## Files to Touch

- `packages/runner/src/ui/ActionToolbar.tsx` (modify)
- `packages/runner/src/ui/ActionToolbar.module.css` (modify)
- `packages/runner/test/ui/ActionToolbar.test.ts` (modify)

## Out of Scope

- Adding keyboard shortcut bindings to action buttons (future work, not this ticket).
- Changing action button layout, styling, or grouping.
- Modifying `ChoicePanel` or any other UI component.
- Changing `render-model.ts` types.

## Acceptance Criteria

### Tests That Must Pass

1. `ActionToolbar` renders action buttons with correct display names (no hint spans in DOM).
2. `ActionToolbar` disabled state and click handler behavior unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. Action buttons still render with `data-testid="action-{actionId}"` attributes.
2. Action button `displayName` text is still visible (the `.label` span is preserved).
3. No regressions in `pnpm turbo typecheck`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ActionToolbar.test.ts` -- replaced hint assertion test with two new tests verifying no hint spans are rendered and buttons contain only label spans.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Removed `hint` counter variable, `displayHint` assignment, and `<span className={styles.hint}>` from `ActionToolbar.tsx` (3 deletions).
  - Removed `.hint` CSS ruleset from `ActionToolbar.module.css`.
  - Replaced one test (`'renders number hints in flattened visual order'`) with two new tests: `'does not render hint spans inside action buttons'` and `'each action button contains only a label span'`.
- **Deviations from original plan**: The original ticket assumed the test file might not exist (early draft). The test file did exist with 11 tests. One hint-asserting test was replaced; net test count went from 11 to 12.
- **Verification results**: All 13 ActionToolbar tests pass (12 original minus 1 replaced plus 2 new = 13). Pre-existing failures in `resolve-bootstrap-config.test.ts` and `derive-render-model-zones.test.ts` confirmed present on `main` — not caused by this change. No new typecheck errors.
