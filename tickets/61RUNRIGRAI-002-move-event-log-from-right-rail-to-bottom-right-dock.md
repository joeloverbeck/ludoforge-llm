# 61RUNRIGRAI-002: Move Event Log from Right Rail to Bottom-Right Dock

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only container composition
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, archive/tickets/RUNARCH/61RUNRIGRAI-001-add-bottom-primary-and-dock-overlay-regions.md

## Problem

`GameContainer` currently renders `EventLogPanel` as part of `sidePanelContent`, which keeps the log in the right rail and couples it to the placeholder panel stack. Spec 61 requires the log to move into a dedicated bottom-right dock while preserving the top-right toggle and the existing runner-owned log behavior.

## Assumption Reassessment (2026-03-19)

1. Reassessment after completing `archive/tickets/RUNARCH/61RUNRIGRAI-001-add-bottom-primary-and-dock-overlay-regions.md`: `packages/runner/src/ui/GameContainer.tsx` already routes `EventLogPanel` through `bottomRightDockContent`, and `UIOverlay` already exposes the new semantic dock contract.
2. `packages/runner/test/ui/GameContainer.test.ts` and `packages/runner/test/ui/GameContainer.chrome.test.tsx` already cover dock ownership and event-log visibility behavior.
3. Corrected scope: this ticket is now superseded by archived Ticket 001 and should not be used as the architectural dependency for remaining Spec 61 cleanup work.

## Note

Remaining Spec 61 follow-up should proceed through Tickets `61RUNRIGRAI-003`, `61RUNRIGRAI-004`, and `61RUNRIGRAI-005`. They cover the still-open architectural cleanup:

- deleting placeholder widgets,
- deleting placeholder-only visual-config contracts,
- pruning dead runner-frame/render-model fields after widget removal proves they are unused.

## Architecture Check

1. Moving the log through the new dock slot keeps utility chrome separate from persistent side-rail panels and matches the overlay ownership model from Spec 61.
2. The change is contained to runner UI composition and does not move any gameplay semantics into game data or engine/runtime layers.
3. The event-log toggle remains runner UI state; no game-specific flag or compatibility path should be introduced.

## What to Change

### 1. Rewire `GameContainer` overlay assignment

Update `GameContainer` so:

- bottom action/choice/AI content is passed through `bottomPrimaryContent`,
- `EventLogPanel` is passed through `bottomRightDockContent` when visible,
- the right rail contains only right-rail panels.

### 2. Preserve event-log behavior

Keep the existing top-right toggle button, keyboard shortcut, entry selection, and interaction-highlighting behavior intact after the move.

### 3. Extend container/chrome coverage

Update the container tests to assert region ownership instead of the previous side-rail placement. Add or revise chrome tests so action, choice, AI-turn, and read-only modes continue to expose the log via the dock slot without overlap-oriented regressions.

## File List

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify)

## Out of Scope

- deleting `VariablesPanel`, `Scoreboard`, or `GlobalMarkersBar`
- removing visual-config `variables` schema/provider APIs
- removing render-model or runner-frame fields
- redesigning event-log filtering, grouping, or entry semantics

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/GameContainer.test.ts` proves `EventLogPanel` is passed to the bottom-right dock slot and no longer rendered through the right-rail slot.
2. `packages/runner/test/ui/GameContainer.test.ts` proves the event-log toggle button and `l` keyboard shortcut still show and hide the docked log.
3. `packages/runner/test/ui/GameContainer.chrome.test.tsx` proves action, choice, AI-turn, and read-only bottom modes can coexist with the dock region without regressing region ownership assertions.
4. Existing suite: `pnpm -F @ludoforge/runner test -- GameContainer`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `EventLogPanel` remains runner-owned utility chrome and is not reclassified as a game-authored side-rail panel.
2. Event-log visibility remains controlled only by runner UI state and existing runner inputs.
3. Bottom action/choice/AI content and the docked event log are composed through separate overlay regions rather than overlapping absolute positioning.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — overlay prop wiring, toggle behavior, and dock placement.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — bottom-mode coexistence and region ownership assertions.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm run check:ticket-deps`
