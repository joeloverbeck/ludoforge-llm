# 61RUNRIGRAI-004: Delete Scoreboard and Global Markers Placeholder Widgets

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only UI cleanup
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, archive/tickets/RUNARCH/61RUNRIGRAI-001-add-bottom-primary-and-dock-overlay-regions.md

## Problem

`Scoreboard` and `GlobalMarkersBar` are still mounted as generic right-rail placeholder widgets. Spec 61 explicitly removes them for all games, and leaving them in the overlay stack would keep the right rail coupled to dev-facing dump surfaces.

## Assumption Reassessment (2026-03-19)

1. After archived Tickets 001-003, `packages/runner/src/ui/GameContainer.tsx` still imports and registers both `Scoreboard` and `GlobalMarkersBar` in the right-rail overlay region, even though the event log has already moved to the bottom-right dock and `VariablesPanel` is already gone.
2. `packages/runner/src/ui/Scoreboard.tsx` and `packages/runner/src/ui/GlobalMarkersBar.tsx` are now the only production UI consumers of `renderModel.tracks` and `renderModel.globalMarkers`.
3. `packages/runner/test/ui/GameContainer.chrome.test.tsx` still mocks both deleted components, so removing the widgets requires updating both container test files, not just the dedicated component tests.
4. Corrected scope: this ticket should remove only the obsolete widget surfaces and runner-container coverage tied to them, while leaving `tracks` and `globalMarkers` projection cleanup to Ticket 005.

## Note

This ticket is the authoritative UI-deletion slice for the remaining placeholder right-rail chrome after the dock refactor. It should fully remove:

- `Scoreboard`,
- `GlobalMarkersBar`,
- their right-rail registration,
- their dedicated component tests,
- stale container-test mocks that still assume those modules exist.

## Architecture Check

1. Deleting the placeholder widgets separately from projection cleanup remains the cleaner architecture boundary because Ticket 005 already owns proof-driven pruning of the now-suspect model fields.
2. The change stays in runner presentation code and does not add game-specific logic to engine/runtime/kernel contracts.
3. No hidden feature flag or optional toggle should preserve these widgets after removal.

## What to Change

### 1. Remove widget registration from the right rail

Delete `Scoreboard` and `GlobalMarkersBar` from `GameContainer` overlay registration so the right rail stops rendering them entirely.

### 2. Delete obsolete widget implementations

Delete both components, their CSS modules, and dedicated UI tests.

### 3. Refresh container coverage

Update `GameContainer` tests so the right rail still covers any surviving persistent panels but no longer contains scoreboard/global-marker placeholders. Also remove stale `GameContainer.chrome` mocks for deleted modules.

## File List

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/Scoreboard.tsx` (delete)
- `packages/runner/src/ui/Scoreboard.module.css` (delete)
- `packages/runner/src/ui/GlobalMarkersBar.tsx` (delete)
- `packages/runner/src/ui/GlobalMarkersBar.module.css` (delete)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify)
- `packages/runner/test/ui/Scoreboard.test.ts` (delete)
- `packages/runner/test/ui/GlobalMarkersBar.test.ts` (delete)

## Out of Scope

- removing `tracks` or `globalMarkers` from runner-frame/render-model types
- changing event-log dock behavior
- changing `VariablesPanel` or visual-config schema contracts
- redesigning surviving right-rail panels such as `ActiveEffectsPanel`

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/GameContainer.test.ts` proves `Scoreboard` and `GlobalMarkersBar` are no longer registered in the right rail.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` no longer depends on mocks for deleted modules.
3. No dedicated `Scoreboard` or `GlobalMarkersBar` component tests remain in `packages/runner/test/ui/`.
4. Existing suite: `pnpm -F @ludoforge/runner test -- GameContainer`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. The right rail contains only intentional persistent runner panels after this ticket; deleted placeholder widgets do not survive behind optional wiring.
2. Render-model fields remain untouched in this ticket so downstream cleanup can be validated explicitly instead of implicitly.
3. No game-specific replacement UI is introduced as part of deleting the generic placeholder widgets.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — absence of scoreboard/global-marker widgets in overlay registration.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — deletion-compatible chrome wiring with no stale widget mocks.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed:
  - Removed `Scoreboard` and `GlobalMarkersBar` from `GameContainer` right-rail registration.
  - Deleted both widget components, their CSS modules, and their dedicated UI tests.
  - Updated `GameContainer` and `GameContainer.chrome` coverage so tests assert the surviving right-rail/dock architecture without stale widget imports or mocks.
- Deviations from original plan:
  - The ticket was corrected before implementation to reflect already-landed Spec 61 work (`VariablesPanel` removal and event-log dock migration).
  - `packages/runner/test/ui/GameContainer.chrome.test.tsx` was added to scope because it still depended on mocks for the deleted modules.
  - `tracks` and `globalMarkers` projection cleanup was intentionally left for Ticket 005, which already owns the evidence-driven model pruning pass.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed (`162` files, `1613` tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm run check:ticket-deps` passed.
