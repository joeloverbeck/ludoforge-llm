# 60RUNCONSUR-005: Wire Settings Menu Into GameContainer and Remove AnimationControls

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only integration and legacy removal
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md, archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md, archive/tickets/RUNCONSUR/60RUNCONSUR-003-add-runner-control-descriptor-builder.md, archive/tickets/RUNCONSUR/60RUNCONSUR-004-build-settings-menu-surface-components.md

## Problem

The spec’s user-visible outcome is not complete until the legacy `AnimationControls` component is gone and replaced by a settings trigger positioned immediately to the left of the event-log toggle. After `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md`, the panel no longer pollutes the status lane, but the deeper architectural smell remains: runner-control semantics still live inside a dedicated JSX component instead of a descriptor-driven control surface.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/GameContainer.tsx` still renders `AnimationControls`, but only inside `topSessionContent`; the top status/session split has already landed.
2. The runner-owned menu architecture already exists:
   - `packages/runner/src/ui/runner-ui-store.ts`
   - `packages/runner/src/ui/runner-control-surface.ts`
   - `packages/runner/src/ui/SettingsMenu.tsx`
   - `packages/runner/src/ui/SettingsMenuTrigger.tsx`
3. `packages/runner/test/ui/AnimationControls.test.tsx` still exists as the legacy component’s focused test surface, while current chrome coverage is split between `packages/runner/test/ui/GameContainer.test.ts` and `packages/runner/test/ui/GameContainer.chrome.test.tsx`.
4. `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md` already established the top status vs top session boundary. This ticket should finish the migration by wiring the existing settings menu into `GameContainer` and deleting the legacy component.
5. Corrected scope: this ticket should perform the final integration, legacy removal, and test migration. It should not recreate control-surface abstractions that already exist, and it should not expand into visual-config schema work.

## Architecture Check

1. The current direction remains correct: the descriptor builder plus runner UI store is cleaner than embedding control semantics directly in `GameContainer`.
2. The remaining smell is narrow now. `AnimationControls` has already been reduced to a descriptor renderer, but that still leaves duplicated render surfaces for the same runner controls.
3. Removing the legacy component is more robust than keeping both a top-bar renderer and a menu renderer alive, because one descriptor model should feed one canonical runner-control surface.
4. No compatibility path should keep the old panel mounted behind a flag, hidden fallback, or wrapper component. If the settings menu becomes the control surface, the legacy panel should be deleted outright.

## What to Change

### 1. Integrate the existing settings trigger/menu into the top-right session cluster

Render the settings trigger immediately to the left of the event-log toggle, and connect its open/close state to the existing runner UI store.

### 2. Feed the existing descriptor-backed menu from `GameContainer`

Use the existing descriptor builder and menu surface to expose:

- playback speed
- pause/resume
- skip current animation
- AI detail
- AI auto-skip
- diagnostics download when available

### 3. Remove the legacy `AnimationControls` panel

Delete the old component/module CSS and stop rendering it from `GameContainer` at all. Replace the legacy component tests with integration coverage and descriptor/menu tests; do not preserve `AnimationControls` as an internal renderer behind the new menu.

## File List It Expects to Touch

- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/ui/GameContainer.module.css` (modify)
- `packages/runner/src/ui/SettingsMenuTrigger.module.css` (modify only if trigger styling needs session-cluster alignment)
- `packages/runner/src/ui/AnimationControls.tsx` (remove)
- `packages/runner/src/ui/AnimationControls.module.css` (remove)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.chrome.test.tsx` (modify)
- `packages/runner/test/ui/AnimationControls.test.tsx` (remove)
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
2. `packages/runner/test/ui/GameContainer.test.ts` proves the top status slot no longer renders any runner-control surface and the top session slot no longer renders `AnimationControls`.
3. `packages/runner/test/ui/GameContainer.chrome.test.tsx` proves settings-menu actions dispatch the same playback and AI mutations previously exposed by `AnimationControls`.
4. `packages/runner/test/ui/SettingsMenu.test.tsx` proves one-shot actions such as skip and diagnostics download close the menu after selection.
5. `packages/runner/test/ui/runner-control-surface.test.ts` proves descriptor semantics stay game-agnostic and continue to hide diagnostics when unavailable.
6. Existing suite: `pnpm -F @ludoforge/runner test`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`
8. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. Top overlay panels remain limited to persistent game-state/status content.
2. Playback and AI behavior semantics remain unchanged; only the control surface changes.
3. The settings menu remains runner-owned and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/GameContainer.test.ts` — session-button ordering and legacy removal from both top slots.
2. `packages/runner/test/ui/GameContainer.chrome.test.tsx` — interactive settings-menu integration with real store mutations.
3. `packages/runner/test/ui/SettingsMenu.test.tsx` — close-on-action behavior for one-shot actions.
4. `packages/runner/test/ui/runner-control-surface.test.ts` — descriptor expectations affected by the final integration.

### Commands

1. `pnpm -F @ludoforge/runner test -- GameContainer`
2. `pnpm -F @ludoforge/runner test -- SettingsMenu`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm -F @ludoforge/runner lint`
6. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - wired `SettingsMenuTrigger` and `SettingsMenu` into `GameContainer` as the canonical top-right runner control surface
  - fed the menu directly from `buildRunnerControlSections(...)` using `GameStore` playback/AI actions plus dev-only diagnostics download support
  - removed `AnimationControls.tsx`, `AnimationControls.module.css`, and the legacy component test file
  - migrated coverage to `GameContainer.test.ts`, `GameContainer.chrome.test.tsx`, and `runner-control-surface.test.ts`
- Deviations from original plan:
  - no new runner-control abstractions were added because the runner UI store, descriptor builder, and menu components were already present and sufficient
  - `SettingsMenuTrigger.module.css` did not need changes; menu anchoring was handled in `GameContainer.module.css`
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
