# 61RUNRIGRAI-001: Add Bottom Primary and Dock Overlay Regions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only overlay contract
**Deps**: specs/61-runner-right-rail-cleanup-and-event-log-dock.md

## Problem

`UIOverlay` still exposes a single `bottomBarContent` slot and a single right-side rail slot. Spec 61 requires the bottom overlay region to own both the primary action surface and a distinct bottom-right utility dock so the event log can move out of the side rail without relying on CSS overlap hacks.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/UIOverlay.tsx` currently exposes `leftPanelContent`, `sidePanelContent`, and `bottomBarContent`, with no dedicated dock region.
2. `packages/runner/test/ui/UIOverlay.test.ts` currently asserts only a single bottom slot (`ui-overlay-bottom`) and a single side slot (`ui-overlay-side`).
3. Corrected scope: this ticket should change only the overlay region contract and layout tests/CSS, not reassign `GameContainer` content yet.

## Architecture Check

1. A first-class bottom layout contract is cleaner than letting callers improvise positioning around whichever bottom panel happens to be mounted.
2. This change stays entirely in runner presentation code and does not introduce game-specific behavior into `GameDef`, simulation, compiler, or kernel layers.
3. No compatibility alias should keep `bottomBarContent` as the authoritative API once `bottomPrimaryContent` and `bottomRightDockContent` exist.

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

### 3. Update overlay tests to assert the new contract

Revise `UIOverlay` tests to assert:

- distinct right-rail and bottom-right-dock regions exist,
- provided dock content renders in the dock slot,
- provided primary content renders in the primary slot,
- the old single-bottom-slot contract is gone.

## File List

- `packages/runner/src/ui/UIOverlay.tsx` (modify)
- `packages/runner/src/ui/UIOverlay.module.css` (modify)
- `packages/runner/test/ui/UIOverlay.test.ts` (modify)

## Out of Scope

- moving `EventLogPanel` out of `GameContainer` side content
- deleting placeholder widgets or their tests
- removing visual-config schema/provider contracts
- removing runner-frame or render-model fields

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/UIOverlay.test.ts` proves the overlay renders distinct `bottomPrimary` and `bottomRightDock` regions and no longer exposes the old single-bottom-slot contract.
2. `packages/runner/test/ui/UIOverlay.test.ts` proves dock and primary content can render simultaneously through separate semantic slots.
3. Existing suite: `pnpm -F @ludoforge/runner test -- UIOverlay`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Overlay region ownership is explicit in `UIOverlay` props rather than encoded through ad hoc caller CSS.
2. The bottom dock remains runner-owned presentation chrome and does not encode game-specific semantics.
3. Overlay root and region wrappers remain non-interactive except where child content enables interaction.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/UIOverlay.test.ts` — semantic region contract and simultaneous primary/dock rendering.

### Commands

1. `pnpm -F @ludoforge/runner test -- UIOverlay`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm run check:ticket-deps`
