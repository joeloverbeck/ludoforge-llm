# ACTTOOLTIP-001: Fix stale tooltipHoveredRef on new action hover

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When the user is hovering the action tooltip (`tooltipHoveredRef = true`) and then moves the pointer directly to a **different** action button, `onActionHoverStart` fires without resetting `tooltipHoveredRef`. Later, when `onActionHoverEnd` fires for the new button, it checks `if (tooltipHoveredRef.current)` and bails out — the grace period never starts, and the tooltip never dismisses. The tooltip becomes permanently stuck until the user hovers a third action.

## Assumption Reassessment (2026-02-27)

1. `useActionTooltip.ts` currently has `tooltipHoveredRef` as a `useRef<boolean>` initialized to `false` — confirmed at line 36.
2. `onActionHoverStart` (line 58) calls `clearPendingTimer()` and `clearGraceTimer()` but does NOT reset `tooltipHoveredRef` — confirmed.
3. `onActionHoverEnd` (line 107) bails out early when `tooltipHoveredRef.current` is `true` — confirmed at line 111.
4. `dismiss()` (line 52) does reset `tooltipHoveredRef` to `false`, but it is only called from grace timer callbacks, not from `onActionHoverStart`.

## Architecture Check

1. The fix is a single line addition (`tooltipHoveredRef.current = false`) in `onActionHoverStart`. This is the minimal correct change — when a new hover starts, the previous tooltip interaction is superseded, so the hover-tracking ref must be reset.
2. No game-specific logic. This is purely UI state management in the runner.
3. No backwards-compatibility shims.

## What to Change

### 1. Reset `tooltipHoveredRef` in `onActionHoverStart`

In `packages/runner/src/ui/useActionTooltip.ts`, inside `onActionHoverStart`, add `tooltipHoveredRef.current = false;` after the existing `clearGraceTimer()` call (line 60).

## Files to Touch

- `packages/runner/src/ui/useActionTooltip.ts` (modify)
- `packages/runner/test/ui/useActionTooltip.test.ts` (modify)

## Out of Scope

- Refactoring the state machine to use an explicit state enum (would be a separate improvement)
- Changes to the engine or display rendering

## Acceptance Criteria

### Tests That Must Pass

1. New test: when tooltip is hovered and user moves to a different action button, the tooltip for the old action is replaced and the new tooltip eventually dismisses correctly via grace period.
2. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `tooltipHoveredRef` must be `false` whenever `onActionHoverStart` completes its synchronous work.
2. `onActionHoverEnd` must always be able to start a grace timer (never permanently blocked by stale ref).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/useActionTooltip.test.ts` — Add test: "dismisses via grace period after pointer moves from tooltip to a different action button then leaves". Sequence: hover action-A → debounce → leave button → enter tooltip → leave tooltip directly to action-B button → leave action-B → advance past grace → expect null state.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/ui/useActionTooltip.test.ts`
2. `pnpm -F @ludoforge/runner test`
