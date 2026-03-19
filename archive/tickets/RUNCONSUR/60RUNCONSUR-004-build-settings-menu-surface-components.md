# 60RUNCONSUR-004: Build Settings Menu Surface Components

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner UI component work only
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md, archive/tickets/RUNCONSUR/60RUNCONSUR-003-add-runner-control-descriptor-builder.md

## Problem

The spec needs a reusable settings trigger and grouped menu surface, but the repo has no dedicated component set for a runner-owned popover/dropdown. If the integration work lands before that surface exists, `GameContainer` will absorb too much behavior again and the UI boundary will remain muddled.

## Assumption Reassessment (2026-03-19)

1. No `SettingsMenu.tsx`, `SettingsMenuTrigger.tsx`, or shared menu-surface CSS currently exists in `packages/runner/src/ui/`.
2. `packages/runner/src/ui/runner-ui-store.ts` already exists and owns `settingsMenuOpen` plus `eventLogVisible`; this ticket must consume that state shape rather than inventing another menu-open owner.
3. `packages/runner/src/ui/runner-control-surface.ts` already exists and is the authoritative control-semantics layer; this ticket must render descriptor data and must not duplicate playback or AI-control semantics in a second builder.
4. `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md` already landed, so `UIOverlay` and `GameContainer` now expose the intended status/session boundary.
5. Current runner tests cover the chrome store, descriptor builder, and legacy `AnimationControls`, but there is still no focused accessibility and interaction contract for the future menu surface.
6. Corrected scope: this ticket should produce the reusable menu trigger and menu surface components, plus their focused accessibility behavior, while leaving final `GameContainer` integration and `AnimationControls` removal to `60RUNCONSUR-005`.

## Architecture Check

1. A dumb rendering surface that consumes descriptors is cleaner than placing rendering, state ownership, and store selection in one top-level component.
2. Keeping the menu generic preserves the agnostic-engine rule: it is a runner surface, not a game-specific HUD contract.
3. This ticket is only architecturally worthwhile if it does not create a second source of control semantics. The menu surface must stay descriptor-driven and store-agnostic.
4. Keeping integration/removal in `60RUNCONSUR-005` is acceptable only because the descriptor builder and top-session boundary already exist; this ticket should not introduce a temporary adapter architecture that the next ticket must unwind.

## What to Change

### 1. Add the trigger and menu components

Create a trigger button component and a menu component capable of rendering grouped sections, segmented choices, selects, toggles, and actions from descriptor data.

The menu surface must accept open/close state and callbacks from its parent. It must not own runner-store selection or derive control semantics itself.

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
- `packages/runner/src/ui/SettingsMenuTrigger.module.css` (new or fold into shared menu CSS if cleaner)
- `packages/runner/test/ui/SettingsMenu.test.tsx` (new)

## Out of Scope

- wiring the menu into `GameContainer`
- ordering the top-right session buttons
- removing `AnimationControls` from the app
- changing runner-store ownership or control-descriptor semantics
- extending visual-config schema
- changing save/load/quit behavior

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/SettingsMenu.test.tsx` proves grouped sections and control labels render from descriptor input without direct store access.
2. `packages/runner/test/ui/SettingsMenu.test.tsx` proves the menu closes on outside click and `Escape`.
3. `packages/runner/test/ui/SettingsMenu.test.tsx` proves the trigger exposes stable accessibility linkage to the menu surface.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner lint`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Settings-menu rendering remains descriptor-driven and does not become the source of control semantics.
2. Dangerous session actions such as `Quit` remain outside the menu.
3. The menu surface stays runner-generic and must not branch on a specific game.
4. The trigger and surface API stay reusable enough for `60RUNCONSUR-005` to wire them into `GameContainer` without reworking their public contract.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/SettingsMenu.test.tsx` — grouped rendering, escape/outside-close, and trigger/menu accessibility.

### Commands

1. `pnpm -F @ludoforge/runner test -- SettingsMenu`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- Actual changes:
  - added `packages/runner/src/ui/SettingsMenu.tsx` as a descriptor-driven, parent-controlled menu surface for grouped segmented/select/toggle/action controls
  - added `packages/runner/src/ui/SettingsMenuTrigger.tsx` as the reusable settings trigger with stable trigger-to-menu accessibility linkage
  - added dedicated styling in `packages/runner/src/ui/SettingsMenu.module.css` and `packages/runner/src/ui/SettingsMenuTrigger.module.css`
  - added focused jsdom coverage in `packages/runner/test/ui/SettingsMenu.test.tsx` for grouped rendering, outside-click close, `Escape` close, keyboard traversal, accessibility linkage, and close-on-action behavior
- Deviations from original plan:
  - the ticket assumptions and scope were corrected before implementation because the runner UI store, descriptor builder, and top status/session split already existed in the repo
  - close-on-action behavior was added now, even though `60RUNCONSUR-005` is the integration/removal ticket, because it is part of the durable surface contract and avoids a follow-up surface rewrite
- Verification results:
  - `pnpm -F @ludoforge/runner test -- SettingsMenu`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm run check:ticket-deps`
