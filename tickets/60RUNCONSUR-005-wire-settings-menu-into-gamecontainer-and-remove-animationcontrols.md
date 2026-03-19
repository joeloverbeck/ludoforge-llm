# 60RUNCONSUR-005: Wire Settings Menu Into GameContainer and Remove AnimationControls

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only integration and legacy removal
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md, archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md, archive/tickets/RUNCONSUR/60RUNCONSUR-003-add-runner-control-descriptor-builder.md, archive/tickets/RUNCONSUR/60RUNCONSUR-004-build-settings-menu-surface-components.md

## Problem

The spec’s user-visible outcome is not complete until the legacy `AnimationControls` component is gone and replaced by a settings trigger positioned immediately to the left of the event-log toggle. After `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md`, the panel no longer pollutes the status lane, but the deeper architectural smell remains: runner-control semantics still live inside a dedicated JSX component instead of a descriptor-driven control surface.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/GameContainer.tsx` still renders `AnimationControls`, now in the top session chrome instead of the top status overlay contract.
2. `packages/runner/test/ui/AnimationControls.test.tsx` exists as the legacy component’s focused test surface.
3. `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md` already established the top status vs top session boundary, so this ticket should not re-litigate that split; it should finish the migration by removing the legacy component entirely.
4. Corrected scope: this ticket should perform the actual migration and removal, but it should not expand into visual-config schema work.

## Architecture Check

1. Wiring the menu through the new descriptor builder and runner UI store is cleaner than embedding fresh control logic directly in `GameContainer`.
2. This ticket is the true cleanup point for the remaining smell: after it lands, runner-control semantics should be owned by the descriptor builder plus menu surface, not by `AnimationControls` under a different placement.
3. Removing the legacy component finishes the intended boundary: top status chrome stays persistent game-state UI, while session/config chrome is descriptor-driven and menu-backed.
4. No compatibility path should keep the old panel mounted behind a flag, hidden fallback, or menu-only wrapper around the same JSX implementation.

## What to Change

### 1. Integrate the settings trigger into the top-right session cluster

Render the settings trigger immediately to the left of the event-log toggle and connect its open/close state to the runner UI store.

### 2. Render descriptor-backed menu controls

Use the descriptor builder and menu surface to expose:

- playback speed
- pause/resume
- skip current animation
- AI detail
- AI auto-skip
- diagnostics download when available

### 3. Remove the legacy `AnimationControls` panel

Delete the old component/module CSS and stop rendering it from `GameContainer` at all. Update or replace legacy tests with integration coverage and descriptor tests; do not preserve `AnimationControls` as an internal renderer behind the new menu.

## File List It Expects to Touch

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/GameContainer.module.css` (modify)
- `packages/runner/src/ui/AnimationControls.tsx` (remove)
- `packages/runner/src/ui/AnimationControls.module.css` (remove)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/AnimationControls.test.tsx` (remove or replace)
- `packages/runner/test/ui/SettingsMenu.test.tsx` (modify as needed)
- `packages/runner/test/ui/runner-control-surface.test.ts` (modify as needed)

## Out of Scope

- replay control redesign
- save/load workflow redesign
- new game-specific HUD widgets
- visual-config `runnerChrome` schema changes
- persistence of playback or UI preferences across sessions

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/GameContainer.test.ts` proves the top-right order is settings trigger, event-log toggle, save, load, quit when those actions are present.
2. `packages/runner/test/ui/GameContainer.test.ts` proves `AnimationControls` is no longer rendered in the top overlay status region.
3. `packages/runner/test/ui/GameContainer.test.ts` proves settings-menu actions dispatch the same playback and AI mutations previously exposed by `AnimationControls`.
4. `packages/runner/test/ui/SettingsMenu.test.tsx` proves one-shot actions such as skip and diagnostics download close the menu after selection.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Top overlay panels remain limited to persistent game-state/status content.
2. Playback and AI behavior semantics remain unchanged; only the control surface changes.
3. The settings menu remains runner-owned and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — session-button ordering, legacy removal, and settings-menu integration.
2. `packages/runner/test/ui/SettingsMenu.test.tsx` — close-on-action behavior for one-shot actions.
3. `packages/runner/test/ui/runner-control-surface.test.ts` — any descriptor expectations affected by the final integration.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner test -- SettingsMenu`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm run check:ticket-deps`
