# 60RUNCONSUR-002: Split Top Overlay Into Status and Session Chrome

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner overlay contract refactor only
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md

## Problem

`UIOverlay` currently exposes a single `topBarContent` slot, which forces persistent game-state overlays and session/config affordances to compete in the same contract. That is the architectural issue the spec is trying to correct: the top row has no first-class distinction between status chrome and session chrome.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/UIOverlay.tsx` still exposes `topBarContent` as a single mixed slot.
2. `packages/runner/src/ui/GameContainer.tsx` currently renders both overlay panels and the session buttons into that single slot.
3. `AnimationControls` is still rendered as part of `OVERLAY_REGION_PANELS.top`, even though its controls are runner session/config chrome rather than persistent game-state status.
4. `packages/runner/test/ui/GameContainer.chrome.test.tsx` already covers event-log interaction wiring under jsdom; this ticket should keep that suite green but does not need to expand it unless the top-slot split changes interactive behavior.
5. Corrected scope: this ticket should change the overlay contract and layout semantics first, and it should move the existing session/config affordances into the session-side contract immediately, but it should not yet replace `AnimationControls` with the later settings menu UI.

## Architecture Check

1. Separate `topStatusContent` and `topSessionContent` props make intent explicit and remove the need for future top-row JSX pileups.
2. This is a pure runner UI contract change and does not leak game-specific layout behavior into engine/runtime structures.
3. `AnimationControls` belongs in the session/config lane now, not in the status lane, because it is runner-owned operational chrome rather than game-state information.
4. No compatibility alias should keep `topBarContent` alive as the long-term API; callers should migrate to the explicit split.

## What to Change

### 1. Refactor `UIOverlay` top-region API

Replace `topBarContent` with separate status and session slots and update the top-region markup/CSS so each side has a stable, intentional layout boundary.

### 2. Update `GameContainer` to use the split contract

Move existing top-row content into the correct side:

- persistent overlay/status panels into the status slot
- runner session/config chrome into the session slot, including `AnimationControls`
- event-log/save/load/quit controls into the session slot

Do not change the control set yet; preserve current behavior while improving the boundary and ownership model.

### 3. Update overlay tests and CSS contracts

Refresh `UIOverlay` tests so they assert the new semantic slots and preserve the existing pointer-events contract.

## File List It Expects to Touch

- `packages/runner/src/ui/UIOverlay.tsx` (modify)
- `packages/runner/src/ui/UIOverlay.module.css` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/GameContainer.module.css` (modify)
- `packages/runner/test/ui/UIOverlay.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify only if the split changes test selectors or top-row interaction structure)

## Out of Scope

- adding the settings trigger or menu popover
- defining control descriptors
- replacing `AnimationControls` with the later menu-backed control surface
- extending visual-config schema
- changing bottom, left, side, or floating overlay contracts beyond what is required for the top split

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/UIOverlay.test.ts` proves `UIOverlay` renders separate top status and top session regions.
2. `packages/runner/test/ui/GameContainer.test.ts` proves status panels render inside the status slot.
3. `packages/runner/test/ui/GameContainer.test.ts` proves `AnimationControls` plus session buttons render inside the session slot.
4. `packages/runner/test/ui/UIOverlay.test.ts` keeps the overlay root non-interactive CSS contract intact.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner lint`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`
8. `pnpm run check:ticket-deps`

### Invariants

1. The runner top area has an explicit architectural split between persistent status chrome and session/config chrome.
2. Existing non-top overlay regions keep their current responsibilities and semantics.
3. `AnimationControls` remains functionally unchanged in this ticket, but it no longer occupies the status-chrome contract.
4. This ticket does not change simulation behavior, playback behavior, or game-specific presentation policy.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/UIOverlay.test.ts` — semantic slot and CSS contract updates.
2. `packages/runner/test/ui/GameContainer.test.ts` — top status vs top session composition assertions, including `AnimationControls` moving to session chrome.
3. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — update only if the top split changes a selector or interactive structure.

### Commands

1. `pnpm -F @ludoforge/runner test -- UIOverlay`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- Actual changes:
  - replaced `UIOverlay.topBarContent` with explicit `topStatusContent` and `topSessionContent` slots plus matching layout/test hooks
  - updated `GameContainer` so persistent state panels remain in the status lane while `AnimationControls` and the event-log/save/load/quit controls render in the session lane
  - updated overlay/session CSS so the split has an explicit layout boundary and the session buttons remain directly interactive
  - strengthened `UIOverlay` and `GameContainer` tests to assert slot semantics instead of only generic top-row output
- Deviations from original plan:
  - moved `AnimationControls` into the session lane now, because leaving it in status chrome would preserve the architectural mismatch this ticket is meant to remove
  - no changes were needed in `packages/runner/test/ui/GameContainer.chrome.test.tsx`; the existing interaction wiring remained valid after the slot split
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm run check:ticket-deps`
