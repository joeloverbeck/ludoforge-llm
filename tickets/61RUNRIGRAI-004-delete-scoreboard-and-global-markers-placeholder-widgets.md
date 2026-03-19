# 61RUNRIGRAI-004: Delete Scoreboard and Global Markers Placeholder Widgets

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only UI cleanup
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md, tickets/61RUNRIGRAI-002-move-event-log-from-right-rail-to-bottom-right-dock.md

## Problem

`Scoreboard` and `GlobalMarkersBar` are still mounted as generic right-rail placeholder widgets. Spec 61 explicitly removes them for all games, and leaving them in the overlay stack would keep the right rail coupled to dev-facing dump surfaces.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/GameContainer.tsx` still registers both `Scoreboard` and `GlobalMarkersBar` in the `side` overlay region.
2. `packages/runner/src/ui/Scoreboard.tsx` and `packages/runner/src/ui/GlobalMarkersBar.tsx` still consume `renderModel.tracks` and `renderModel.globalMarkers`.
3. Corrected scope: this ticket should remove only the widget surfaces and their direct UI tests, while leaving any shared render-model fields in place until the dedicated projection-cleanup ticket proves they are dead.

## Architecture Check

1. Deleting the placeholder widgets separately from projection cleanup keeps the diff reviewable and avoids mixing UI deletion with model-shape pruning.
2. The change stays in runner presentation code and does not add game-specific logic to engine/runtime/kernel contracts.
3. No hidden feature flag or optional toggle should preserve these widgets after removal.

## What to Change

### 1. Remove widget registration from the right rail

Delete `Scoreboard` and `GlobalMarkersBar` from `GameContainer` overlay registration so the right rail stops rendering them entirely.

### 2. Delete obsolete widget implementations

Delete both components, their CSS modules, and dedicated UI tests.

### 3. Refresh container coverage

Update `GameContainer` tests so the right rail still covers any surviving persistent panels but no longer contains scoreboard/global-marker placeholders.

## File List

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/Scoreboard.tsx` (delete)
- `packages/runner/src/ui/Scoreboard.module.css` (delete)
- `packages/runner/src/ui/GlobalMarkersBar.tsx` (delete)
- `packages/runner/src/ui/GlobalMarkersBar.module.css` (delete)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
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
2. No dedicated `Scoreboard` or `GlobalMarkersBar` component tests remain in `packages/runner/test/ui/`.
3. Existing suite: `pnpm -F @ludoforge/runner test -- GameContainer`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. The right rail contains only intentional persistent runner panels after this ticket; deleted placeholder widgets do not survive behind optional wiring.
2. Render-model fields remain untouched in this ticket so downstream cleanup can be validated explicitly instead of implicitly.
3. No game-specific replacement UI is introduced as part of deleting the generic placeholder widgets.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — absence of scoreboard/global-marker widgets in overlay registration.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm run check:ticket-deps`
