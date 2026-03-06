# CHOICEUI-012: Breadcrumb Pointer-Events Contract Gap

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/CHOICEUI-008.md

## Problem

The CSS contract test (`ChoicePanel.test.ts` "keeps interactive controls pointer-active via CSS contract") validates that `.panel`, `.breadcrumbStep`, `.optionButton`, and `.navButton` all declare `pointer-events: auto`. CHOICEUI-008 introduced `.breadcrumbStepIndented` — a new interactive breadcrumb button class — but did not add it to this contract test. If the class accidentally loses `pointer-events: auto` in a future refactor, the regression would go undetected.

## Assumption Reassessment (2026-03-06)

1. The contract test exists at `packages/runner/test/ui/ChoicePanel.test.ts` ("keeps interactive controls pointer-active via CSS contract") and reads `ChoicePanel.module.css` directly to check for `pointer-events: auto` on interactive selectors.
2. `.breadcrumbStepIndented` is declared in `ChoicePanel.module.css` and has `pointer-events: auto`.
3. The contract test does not currently check `.breadcrumbStepIndented`. No mismatch with the ticket — this is a gap introduced by CHOICEUI-008.

## Architecture Check

1. Extending the existing contract test pattern is the minimal and cleanest approach — one additional regex match in an existing test, no new test infrastructure.
2. Runner-only change. No game-specific boundary impact.
3. No backwards-compatibility aliasing.

## What to Change

### 1. Add `.breadcrumbStepIndented` to the pointer-events CSS contract test

In the test that reads `ChoicePanel.module.css` and checks `pointer-events: auto` on interactive selectors, add a match for `.breadcrumbStepIndented` and assert it contains `pointer-events: auto`.

## Files to Touch

- `packages/runner/test/ui/ChoicePanel.test.ts` (modify)

## Out of Scope

- Adding hover effect to `.breadcrumbStep` (pre-existing gap, not a regression from CHOICEUI-008).
- Refactoring the contract test to use a loop or data-driven approach.

## Acceptance Criteria

### Tests That Must Pass

1. The updated contract test passes with `.breadcrumbStepIndented` included.
2. Removing `pointer-events: auto` from `.breadcrumbStepIndented` in CSS causes the test to fail.
3. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. All interactive ChoicePanel CSS classes must declare `pointer-events: auto` to prevent canvas overlay from swallowing clicks.
2. No other test behavior changes.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/ChoicePanel.test.ts` — extend "keeps interactive controls pointer-active via CSS contract" to also check `.breadcrumbStepIndented`.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

**Changed exactly as planned.** Added `.breadcrumbStepIndented` regex match and `pointer-events: auto` assertion to the existing CSS contract test in `ChoicePanel.test.ts` (lines 615-616, 621). No deviations from the ticket scope. All 147 runner test files (1444 tests) pass. Typecheck clean.
