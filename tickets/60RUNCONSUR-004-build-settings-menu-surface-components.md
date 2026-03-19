# 60RUNCONSUR-004: Build Settings Menu Surface Components

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner UI component work only
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md, tickets/60RUNCONSUR-003-add-runner-control-descriptor-builder.md

## Problem

The spec needs a reusable settings trigger and grouped menu surface, but the repo has no dedicated component set for a runner-owned popover/dropdown. If the integration work lands before that surface exists, `GameContainer` will absorb too much behavior again and the UI boundary will remain muddled.

## Assumption Reassessment (2026-03-19)

1. No `SettingsMenu.tsx` or `SettingsMenuTrigger.tsx` currently exists in `packages/runner/src/ui/`.
2. Current runner tests cover overlay and control behavior, but there is no focused menu accessibility contract yet.
3. Corrected scope: this ticket should produce the reusable menu components and accessibility behavior without wiring them into the full top-right cluster yet.

## Architecture Check

1. A dumb rendering surface that consumes descriptors is cleaner than placing rendering, state ownership, and store selection in one top-level component.
2. Keeping the menu generic preserves the agnostic-engine rule: it is a runner surface, not a game-specific HUD contract.
3. No backwards-compatibility aliasing should preserve `AnimationControls` as the preferred renderer once the menu surface exists.

## What to Change

### 1. Add the trigger and menu components

Create a trigger button component and a menu component capable of rendering grouped sections, segmented choices, selects, toggles, and actions from descriptor data.

### 2. Implement menu interaction and accessibility behavior

Support:

- open/close callbacks
- outside-click close
- `Escape` close
- keyboard traversal between menu items
- correct trigger/menu accessibility attributes

Keep the implementation lightweight; this is a popover menu, not a full-screen navigation system.

### 3. Add focused menu tests

Cover grouped rendering and accessibility behavior in a dedicated component test file.

## File List It Expects to Touch

- `packages/runner/src/ui/SettingsMenuTrigger.tsx` (new)
- `packages/runner/src/ui/SettingsMenu.tsx` (new)
- `packages/runner/src/ui/SettingsMenu.module.css` (new)
- `packages/runner/test/ui/SettingsMenu.test.tsx` (new)

## Out of Scope

- wiring the menu into `GameContainer`
- ordering the top-right session buttons
- removing `AnimationControls` from the app
- extending visual-config schema
- changing save/load/quit behavior

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/SettingsMenu.test.tsx` proves grouped sections and control labels render from descriptor input without direct store access.
2. `packages/runner/test/ui/SettingsMenu.test.tsx` proves the menu closes on outside click and `Escape`.
3. `packages/runner/test/ui/SettingsMenu.test.tsx` proves the trigger exposes stable accessibility linkage to the menu surface.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Settings-menu rendering remains descriptor-driven and does not become the source of control semantics.
2. Dangerous session actions such as `Quit` remain outside the menu.
3. The menu surface stays runner-generic and must not branch on a specific game.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/SettingsMenu.test.tsx` — grouped rendering, escape/outside-close, and trigger/menu accessibility.

### Commands

1. `pnpm -F @ludoforge/runner test -- SettingsMenu`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`
