# ACTTOOLTIP-003: Add overflow-x: hidden to action tooltip CSS

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The action tooltip CSS has `overflow-y: auto` but no explicit `overflow-x` rule. The browser defaults to `overflow-x: visible`, which means if any content exceeds the `max-width` constraint, a horizontal scrollbar could appear. While `.line` uses `flex-wrap: wrap` to prevent most horizontal overflow, edge cases remain:

- A single inline node with a very long unbreakable string (e.g. a long zone or token ID without spaces)
- Pre-formatted content or unexpected child elements

Adding `overflow-x: hidden` is a defensive measure that eliminates any possible horizontal scrollbar.

## Assumption Reassessment (2026-02-27)

1. `ActionTooltip.module.css` `.tooltip` has `overflow-y: auto` and no `overflow-x` — confirmed at line 6.
2. `.line` uses `display: flex; flex-wrap: wrap;` — confirmed at lines 34-35. This wraps inline children.
3. Inline nodes are `<span>` elements with text content — no fixed-width constraints that would prevent wrapping.
4. The `max-width: min(600px, 80vw)` constraint means the tooltip width is bounded — confirmed at line 4.

## Architecture Check

1. `overflow-x: hidden` is the minimal defensive change. Alternative: `overflow-x: auto` (adds scrollbar when needed) — but a horizontal scrollbar on a tooltip is poor UX; clipping is preferable since `flex-wrap: wrap` handles normal cases.
2. No game-specific logic. Pure CSS change.
3. No backwards-compatibility shims.

## What to Change

### 1. Add overflow-x: hidden

In `packages/runner/src/ui/ActionTooltip.module.css`, add `overflow-x: hidden;` after the existing `overflow-y: auto;` line.

## Files to Touch

- `packages/runner/src/ui/ActionTooltip.module.css` (modify)
- `packages/runner/test/ui/ActionTooltip.test.ts` (no change needed — CSS contract test checks `pointer-events`, not overflow)

## Out of Scope

- Adding `word-break` or `overflow-wrap` rules to inline node spans (would be a separate styling concern)
- Changing the `overflow-y` behavior

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No horizontal scrollbar appears on the action tooltip under any content length.
2. Vertical scrolling continues to work when content exceeds `max-height`.

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a defensive CSS-only change. Visual verification during manual testing.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. Manual: `pnpm -F @ludoforge/runner dev` → load Texas Hold'em → hover actions → verify no horizontal scrollbar
