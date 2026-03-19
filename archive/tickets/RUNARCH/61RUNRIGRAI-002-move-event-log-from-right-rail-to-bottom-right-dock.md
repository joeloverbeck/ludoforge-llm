# 61RUNRIGRAI-002: Move Event Log from Right Rail to Bottom-Right Dock

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only container composition
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, archive/tickets/RUNARCH/61RUNRIGRAI-001-add-bottom-primary-and-dock-overlay-regions.md

## Problem

`GameContainer` currently renders `EventLogPanel` as part of `sidePanelContent`, which keeps the log in the right rail and couples it to the placeholder panel stack. Spec 61 requires the log to move into a dedicated bottom-right dock while preserving the top-right toggle and the existing runner-owned log behavior.

## Assumption Reassessment (2026-03-19)

1. Reassessment after completing `archive/tickets/RUNARCH/61RUNRIGRAI-001-add-bottom-primary-and-dock-overlay-regions.md`: `packages/runner/src/ui/GameContainer.tsx` already routes `EventLogPanel` through `bottomRightDockContent`, and `packages/runner/src/ui/UIOverlay.tsx` already exposes the semantic dock contract required by Spec 61.
2. `packages/runner/test/ui/GameContainer.test.ts` and `packages/runner/test/ui/GameContainer.chrome.test.tsx` already verify dock ownership plus shared visibility state between the top-right toggle and the `l` keyboard shortcut, but the suite should still explicitly prove dock coexistence across the primary bottom-surface modes called out in this ticket.
3. Corrected scope: this ticket is not superseded by Ticket 001. Ticket 001 delivered the enabling overlay contract plus the event-log move, which means the implementation work described here is already present. This ticket should therefore be treated as completion/verification and archival work for that move, not as an open implementation slice.
4. Broader Spec 61 cleanup is still incomplete: `VariablesPanel`, `Scoreboard`, and `GlobalMarkersBar` remain present in `packages/runner/src/ui/GameContainer.tsx` and in runner tests, so remaining right-rail cleanup must continue through the follow-up tickets rather than being considered done here.

## Note

Remaining Spec 61 follow-up should proceed through Tickets `61RUNRIGRAI-003`, `61RUNRIGRAI-004`, and `61RUNRIGRAI-005`. They cover the still-open architectural cleanup:

- deleting placeholder widgets,
- deleting placeholder-only visual-config contracts,
- pruning dead runner-frame/render-model fields after widget removal proves they are unused.

## Architecture Check

1. Moving the log through the dedicated dock slot is architecturally better than the previous right-rail placement because it separates runner utility chrome from persistent side-rail panels and makes region ownership explicit in composition rather than CSS.
2. The change is contained to runner UI composition and does not move any gameplay semantics into game data or engine/runtime layers.
3. The event-log toggle remains runner UI state; no game-specific flag, aliasing layer, or backwards-compatibility path should be introduced.
4. The current architecture is improved but not yet ideal overall because placeholder widgets still occupy the right rail; that remaining cleanup belongs to later Spec 61 tickets, not to this one.

## What to Change

### 1. Verify the existing docked composition

Confirm that the already-landed `GameContainer` composition still:

- passes bottom action/choice/AI content through `bottomPrimaryContent`,
- passes `EventLogPanel` through `bottomRightDockContent` when visible,
- keeps the event log out of the right-rail slot.

### 2. Preserve event-log behavior

Keep the existing top-right toggle button, keyboard shortcut, entry selection, and interaction-highlighting behavior intact after the move.

### 3. Strengthen coverage for coexistence invariants

Update container/chrome tests so action, choice, AI-turn, and read-only modes explicitly prove that the event log continues to occupy the dock slot while the primary bottom slot owns the mode-specific surface.

## File List

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
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` proves the event-log toggle button and `l` keyboard shortcut still show and hide the docked log.
3. `packages/runner/test/ui/GameContainer.test.ts` or `packages/runner/test/ui/GameContainer.chrome.test.tsx` proves action, choice, AI-turn, and read-only bottom modes can coexist with the dock region without regressing region ownership assertions.
4. Existing suite: `pnpm -F @ludoforge/runner test -- GameContainer`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `EventLogPanel` remains runner-owned utility chrome and is not reclassified as a game-authored side-rail panel.
2. Event-log visibility remains controlled only by runner UI state and existing runner inputs.
3. Bottom action/choice/AI content and the docked event log are composed through separate overlay regions rather than overlapping absolute positioning.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — overlay prop wiring, dock placement, and bottom-mode coexistence assertions.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — event-log visibility controls for the docked panel.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Confirmed the event-log move to `bottomRightDockContent` was already implemented in `GameContainer` and supported by the `UIOverlay` dock contract delivered in archived Ticket 001.
  - Corrected this ticket’s stale reassessment: the move was not "superseded" in the sense of being irrelevant, but already completed; broader Spec 61 placeholder-widget cleanup remains separate follow-up work.
  - Strengthened `packages/runner/test/ui/GameContainer.test.ts` to prove the dock continues owning the event log across action, choice, AI-turn, and read-only bottom states.
- Deviations from original plan:
  - No runner implementation code changes were needed because the ticketed architecture had already landed.
  - The work in this ticket became verification, scope correction, and archival rather than a fresh UI composition change.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- GameContainer`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
