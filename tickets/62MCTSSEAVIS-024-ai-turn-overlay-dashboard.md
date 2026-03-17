# 62MCTSSEAVIS-024: AITurnOverlay Dashboard Enhancement

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner UI only
**Deps**: 62MCTSSEAVIS-022, 62MCTSSEAVIS-023

## Problem

The existing AITurnOverlay shows a generic "thinking" animation. It should show a real-time MCTS search dashboard with progress bar, iteration stats, top action candidates, and tree stats.

## What to Change

### 1. Enhance AITurnOverlay component

Read from `aiThinking` store slice. When `isThinking` is true, render dashboard:

- **Progress bar** with percentage (iteration / totalIterations)
- **Iteration count** and rate (iter/s)
- **Elapsed time** in seconds
- **Top 3 actions** with:
  - Display name (from 62MCTSSEAVIS-023)
  - Mini bar chart (proportional width)
  - Visit percentage and count
- **Tree stats**: nodes allocated, maximum depth

### 2. Fallback for non-MCTS agents

When `aiThinking.isThinking` is false or for non-MCTS agents, show existing generic "thinking" animation.

### 3. CSS for dashboard

Style the dashboard: progress bar, action bars, stats layout. Keep it compact and readable.

## Files to Touch

- `packages/runner/src/ui/AITurnOverlay.tsx` (modify)
- `packages/runner/src/ui/AITurnOverlay.module.css` (modify)

## Out of Scope

- Store slice (already in 62MCTSSEAVIS-022)
- Worker bridge (already in 62MCTSSEAVIS-021)
- Display name utility (already in 62MCTSSEAVIS-023)
- Engine changes
- Animation system changes

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: renders progress bar when `isThinking: true`
2. Unit test: displays iteration count and rate
3. Unit test: shows top 3 actions with display names and percentages
4. Unit test: shows tree stats (nodes, depth)
5. Unit test: falls back to generic animation when `isThinking: false`
6. Unit test: handles zero state gracefully (0 iterations, empty topActions)
7. Accessibility: progress bar has ARIA attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemax`)
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Dashboard is read-only — no user interaction changes search behavior
2. Component renders without errors when store slice is in any valid state
3. Existing AITurnOverlay behavior preserved for non-MCTS agents
4. No layout shifts or visual regressions in existing UI

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/AITurnOverlay.test.tsx` — dashboard rendering, fallback, edge cases

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build && pnpm turbo typecheck`
