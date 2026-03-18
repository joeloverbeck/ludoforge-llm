# 62MCTSSEAVIS-025: Visual Play Verification with FITL

**Status**: NOT IMPLEMENTED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — manual verification
**Deps**: 62MCTSSEAVIS-024

## Problem

End-to-end verification that the full pipeline works in the browser: MCTS search produces meaningful visitor events → worker forwards via postMessage → store updates → AITurnOverlay shows live dashboard during AI turns in FITL.

## What to Change

### 1. Manual browser verification

Start the runner dev server with FITL loaded. Trigger an AI turn. Verify:
- Dashboard appears during AI thinking
- Progress bar advances smoothly
- Top actions update in real-time
- Iteration rate and elapsed time display correctly
- Dashboard disappears when AI completes

### 2. Document results

Note any visual issues, performance problems, or UX improvements for future tickets.

## Files to Touch

- None expected (manual verification)
- If bugs found: relevant runner files (modify)

## Out of Scope

- Automated E2E tests (future ticket)
- Performance optimization
- Additional UI features beyond the spec
- Engine changes

## Acceptance Criteria

### Tests That Must Pass

1. Runner starts without errors: `pnpm -F @ludoforge/runner dev`
2. FITL game loads and reaches an AI turn
3. AITurnOverlay shows progress bar, iteration stats, top actions, tree stats
4. Dashboard updates at ~4 Hz (visually smooth)
5. Dashboard disappears cleanly when AI selects a move
6. No console errors during AI turn
7. Full pipeline: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

### Invariants

1. Visual play works for any game, not just FITL (game-agnostic dashboard)
2. No performance regression in UI responsiveness during AI turns
3. All automated tests still pass

## Test Plan

### Commands

1. `pnpm -F @ludoforge/runner dev`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This work item remained unfinished and was removed from the active planning surface so the repository no longer presents MCTS as current architecture.
