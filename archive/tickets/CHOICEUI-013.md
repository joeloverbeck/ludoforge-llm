# CHOICEUI-013: Breadcrumb Step Hover Consistency

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/CHOICEUI-008.md

## Problem

`.breadcrumbStep` (the original flat breadcrumb pill) has no `:hover` rule in `ChoicePanel.module.css`, while `.breadcrumbStepIndented` (introduced in CHOICEUI-008) does. Both are clickable buttons that trigger `rewindChoiceToBreadcrumb`. The inconsistency means flat breadcrumb pills give no visual hover feedback while indented ones do.

This is a pre-existing gap (`.breadcrumbStep` never had a hover rule), but CHOICEUI-008 made it visible by adding hover to the indented variant.

## Assumption Reassessment (2026-03-06)

1. `.breadcrumbStep` in `ChoicePanel.module.css` has no `:hover` pseudo-class rule. Confirmed by reading the file.
2. `.breadcrumbStepIndented` has `.breadcrumbStepIndented:hover { background: rgba(255, 255, 255, 0.15); }`.
3. Both classes use identical base styling (`padding`, `border`, `border-radius`, `background`, `color`, `font-family`, `font-size`, `pointer-events`, `cursor`).

## Architecture Check

1. Adding a `:hover` rule to `.breadcrumbStep` matching the `.breadcrumbStepIndented:hover` rule is the minimal fix. Alternatively, DRY could be improved by extracting a shared base class — but the two classes intentionally differ in context (flat vs indented), and CSS modules don't support `@extend`. A shared rule via comma-grouping is cleaner: `.breadcrumbStep:hover, .breadcrumbStepIndented:hover { ... }`.
2. Runner-only CSS. No game-specific boundary impact.
3. No backwards-compatibility aliasing.

## What to Change

### 1. Add `:hover` rule to `.breadcrumbStep`

Add `.breadcrumbStep:hover` with `background: rgba(255, 255, 255, 0.15)` to match `.breadcrumbStepIndented:hover`. Optionally consolidate both hover rules into a single comma-separated selector.

## Files to Touch

- `packages/runner/src/ui/ChoicePanel.module.css` (modify)

## Out of Scope

- Refactoring `.breadcrumbStep` and `.breadcrumbStepIndented` into a shared base class (CSS modules don't support `@extend`; composition would require `composes:` which adds complexity for minimal gain).
- Adding hover states to other ChoicePanel elements.

## Acceptance Criteria

### Tests That Must Pass

1. The CSS contract test continues to pass (no `pointer-events` change).
2. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. All clickable breadcrumb elements have consistent hover feedback.
2. No other visual behavior changes.

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a visual-only CSS addition. The contract test already validates the structural CSS properties.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

**Changed vs planned**: Implemented exactly as planned. Consolidated the standalone `.breadcrumbStepIndented:hover` rule into a comma-separated selector `.breadcrumbStep:hover, .breadcrumbStepIndented:hover` — one line added, zero lines removed from the effective ruleset. All 147 runner test files (1444 tests) pass. Typecheck clean.
