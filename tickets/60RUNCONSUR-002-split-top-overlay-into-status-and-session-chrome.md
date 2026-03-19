# 60RUNCONSUR-002: Split Top Overlay Into Status and Session Chrome

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner overlay contract refactor only
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md

## Problem

`UIOverlay` currently exposes a single `topBarContent` slot, which forces persistent game-state overlays and session/config affordances to compete in the same contract. That is the architectural issue the spec is trying to correct: the top row has no first-class distinction between status chrome and session chrome.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/UIOverlay.tsx` still exposes `topBarContent` as a single mixed slot.
2. `packages/runner/src/ui/GameContainer.tsx` currently renders both overlay panels and the session buttons into that single slot.
3. Corrected scope: this ticket should change the overlay contract and layout semantics first, but it should not yet replace `AnimationControls` or add the settings menu.

## Architecture Check

1. Separate `topStatusContent` and `topSessionContent` props make intent explicit and remove the need for future top-row JSX pileups.
2. This is a pure runner UI contract change and does not leak game-specific layout behavior into engine/runtime structures.
3. No compatibility alias should keep `topBarContent` alive as the long-term API; callers should migrate to the explicit split.

## What to Change

### 1. Refactor `UIOverlay` top-region API

Replace `topBarContent` with separate status and session slots and update the top-region markup/CSS so each side has a stable, intentional layout boundary.

### 2. Update `GameContainer` to use the split contract

Move existing top-row content into the correct side:

- persistent overlay/status panels into the status slot
- event-log/save/load/quit controls into the session slot

Do not change the control set yet; preserve current behavior while improving the boundary.

### 3. Update overlay tests and CSS contracts

Refresh `UIOverlay` tests so they assert the new semantic slots and preserve the existing pointer-events contract.

## File List It Expects to Touch

- `packages/runner/src/ui/UIOverlay.tsx` (modify)
- `packages/runner/src/ui/UIOverlay.module.css` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/GameContainer.module.css` (modify)
- `packages/runner/test/ui/UIOverlay.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)

## Out of Scope

- adding the settings trigger or menu popover
- defining control descriptors
- removing `AnimationControls` from the top region
- extending visual-config schema
- changing bottom, left, side, or floating overlay contracts beyond what is required for the top split

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/UIOverlay.test.ts` proves `UIOverlay` renders separate top status and top session regions.
2. `packages/runner/test/ui/GameContainer.test.ts` proves session buttons render inside the session slot and status panels render inside the status slot.
3. `packages/runner/test/ui/UIOverlay.test.ts` keeps the overlay root non-interactive CSS contract intact.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. The runner top area has an explicit architectural split between persistent status chrome and session/config chrome.
2. Existing non-top overlay regions keep their current responsibilities and semantics.
3. This ticket does not change simulation behavior, playback behavior, or game-specific presentation policy.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/UIOverlay.test.ts` — semantic slot and CSS contract updates.
2. `packages/runner/test/ui/GameContainer.test.ts` — top status vs top session composition assertions.

### Commands

1. `pnpm -F @ludoforge/runner test -- UIOverlay`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm run check:ticket-deps`
