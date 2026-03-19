# 61RUNRIGRAI-001: Add Bottom Primary and Dock Overlay Regions

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only overlay contract
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md

## Problem

`UIOverlay` still exposes a single `bottomBarContent` slot and a single right-side rail slot. Spec 61 requires the bottom overlay region to own both the primary action surface and a distinct bottom-right utility dock so the event log can move out of the side rail without relying on CSS overlap hacks.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/UIOverlay.tsx` currently exposes `leftPanelContent`, `sidePanelContent`, and `bottomBarContent`, with no dedicated dock region.
2. `packages/runner/test/ui/UIOverlay.test.ts` currently asserts only a single bottom slot (`ui-overlay-bottom`) and a single side slot (`ui-overlay-side`).
3. `packages/runner/src/ui/GameContainer.tsx` still mounts `EventLogPanel` inside `sidePanelContent`; the dock described by Spec 61 does not exist yet anywhere in the composition path.
4. `packages/runner/test/ui/GameContainer.test.ts` and `packages/runner/test/ui/GameContainer.chrome.test.tsx` both currently encode the old overlay contract and event-log placement assumptions.
5. Corrected scope: this ticket must update both the overlay region contract and the `GameContainer` region assignment for `EventLogPanel`. Leaving `GameContainer` unchanged would create dead dock structure and preserve the old right-rail architecture.

## Architecture Check

1. A first-class bottom layout contract is cleaner than letting callers improvise positioning around whichever bottom panel happens to be mounted.
2. Reassigning `EventLogPanel` into the new dock is more robust than introducing a dock while keeping the log in the side rail, because region ownership becomes real composition rather than dormant API.
3. This change stays entirely in runner presentation code and does not introduce game-specific behavior into `GameDef`, simulation, compiler, or kernel layers.
4. No compatibility alias should keep `bottomBarContent` as the authoritative API once `bottomPrimaryContent` and `bottomRightDockContent` exist.
5. Placeholder-widget deletion and visual-config/schema cleanup are still architecturally desirable per Spec 61, but they are a separate cleanup slice from this ticket’s overlay-region delivery.

## What to Change

### 1. Refactor `UIOverlay` props to semantic region names

Replace the current bottom/side prop naming with the explicit region contract from Spec 61:

- `leftRailContent`
- `rightRailContent`
- `bottomPrimaryContent`
- `bottomRightDockContent`

Preserve the existing top/floating/scoring regions.

### 2. Add bottom-region structure in markup and CSS

Update the overlay markup so the bottom area owns both the primary slot and dock slot in one layout container. The CSS should make non-overlap structural by construction and should expose stable test IDs for both regions.

### 3. Reassign `GameContainer` event-log placement

Update `GameContainer` so:

- the event log renders through `bottomRightDockContent`,
- the side rail stops owning the event log,
- the event-log toggle and keyboard shortcut continue to control the same visibility state.

This is the minimum implementation that makes the new dock contract architecturally meaningful.

### 4. Update overlay and container tests to assert the new contract

Revise tests to assert:

- distinct right-rail and bottom-right-dock regions exist,
- provided dock content renders in the dock slot,
- provided primary content renders in the primary slot,
- `GameContainer` mounts `EventLogPanel` in the dock slot,
- the old single-bottom-slot contract is gone.

## File List

- `packages/runner/src/ui/UIOverlay.tsx` (modify)
- `packages/runner/src/ui/UIOverlay.module.css` (modify)
- `packages/runner/test/ui/UIOverlay.test.ts` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify)

## Out of Scope

- deleting placeholder widgets or their tests
- removing visual-config schema/provider contracts
- removing runner-frame or render-model fields

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/UIOverlay.test.ts` proves the overlay renders distinct `bottomPrimary` and `bottomRightDock` regions and no longer exposes the old single-bottom-slot contract.
2. `packages/runner/test/ui/UIOverlay.test.ts` proves dock and primary content can render simultaneously through separate semantic slots.
3. `packages/runner/test/ui/GameContainer.test.ts` proves `EventLogPanel` is routed to the dock slot instead of the side rail.
4. `packages/runner/test/ui/GameContainer.chrome.test.tsx` proves the event-log toggle still governs the dock-rendered panel.
5. Existing suite: `pnpm -F @ludoforge/runner test -- UIOverlay`
6. Existing suite: `pnpm -F @ludoforge/runner test -- GameContainer`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Overlay region ownership is explicit in `UIOverlay` props rather than encoded through ad hoc caller CSS.
2. `EventLogPanel` ownership moves from the side rail to the bottom-right dock in composition, not just in CSS styling.
3. The bottom dock remains runner-owned presentation chrome and does not encode game-specific semantics.
4. Overlay root and region wrappers remain non-interactive except where child content enables interaction.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/UIOverlay.test.ts` — semantic region contract and simultaneous primary/dock rendering.
2. `packages/runner/test/ui/GameContainer.test.ts` — event-log region assignment through the new overlay props.
3. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — event-log visibility controls still work with dock placement.

### Commands

1. `pnpm -F @ludoforge/runner test -- UIOverlay`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Replaced the old `UIOverlay` region API with explicit `leftRailContent`, `rightRailContent`, `bottomPrimaryContent`, and `bottomRightDockContent` props.
  - Updated overlay markup/CSS so the bottom primary surface and bottom-right dock share a single collision-free bottom layout container, with narrow-width stacking behavior.
  - Reassigned `EventLogPanel` in `GameContainer` from the right rail to the new bottom-right dock while preserving the existing toggle and keyboard shortcut behavior.
  - Updated runner tests to assert semantic region ownership and dock placement directly.
- Deviations from original plan:
  - The ticket was broadened from overlay-only work to include `GameContainer` reassignment after reassessment showed the original scope would have left the new dock unused and preserved the old architecture.
  - Placeholder-widget deletion and visual-config/schema cleanup from Spec 61 were intentionally left out of this slice.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- UIOverlay`
  - `pnpm -F @ludoforge/runner test -- GameContainer`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm run check:ticket-deps`
