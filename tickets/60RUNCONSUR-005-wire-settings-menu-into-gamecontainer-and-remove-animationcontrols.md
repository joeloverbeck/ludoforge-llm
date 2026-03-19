# 60RUNCONSUR-005: Wire Settings Menu Into GameContainer and Remove AnimationControls

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only integration and legacy removal
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md, tickets/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md, tickets/60RUNCONSUR-003-add-runner-control-descriptor-builder.md, tickets/60RUNCONSUR-004-build-settings-menu-surface-components.md

## Problem

The spec’s user-visible outcome is not complete until the persistent `AnimationControls` panel is gone from the top HUD and replaced by a settings trigger positioned immediately to the left of the event-log toggle. The repo currently still renders the legacy panel as a top overlay region member.

## Assumption Reassessment (2026-03-19)

1. `OVERLAY_REGION_PANELS.top` in `packages/runner/src/ui/GameContainer.tsx` still includes `AnimationControls`.
2. `packages/runner/test/ui/AnimationControls.test.tsx` exists as the legacy component’s focused test surface.
3. Corrected scope: this ticket should perform the actual migration and removal, but it should not expand into visual-config schema work.

## Architecture Check

1. Wiring the menu through the new descriptor builder and runner UI store is cleaner than embedding fresh control logic directly in `GameContainer`.
2. Removing `AnimationControls` from `OVERLAY_REGION_PANELS.top` restores the intended boundary: top overlays represent persistent game-state/status content only.
3. No compatibility path should keep the old panel mounted behind a flag or hidden fallback.

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

Delete the old component/module CSS and stop including it in `OVERLAY_REGION_PANELS.top`. Update or replace legacy tests with integration coverage and descriptor tests.

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
