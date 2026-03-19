# Spec 60: Runner Control Surface and Settings Menu

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 42 (Per-Game Visual Config), Spec 43 (Session Management), Spec 59 (Codebase Health Audit)
**Source sections**: `packages/runner` current UI overlay architecture, `data/games/*/visual-config.yaml`, screenshot `screenshots/fitl-clutter.png`

## Overview

Replace the persistent top-row animation and AI control bar with a compact runner-owned settings trigger placed immediately to the left of the event-log toggle. The new control surface must reduce HUD clutter, preserve fast access to playback controls, remain fully game-agnostic in behavior, and create a clean architectural boundary between:

- game-status overlays that should remain visible during play,
- session/config controls that should stay hidden until requested,
- game-specific presentation policy that belongs only in `visual-config.yaml`.

The current implementation solves the feature problem but not the UI architecture problem. `AnimationControls` is treated as a permanent overlay panel in the top region alongside phase and turn information, even though it is not game state. That makes the top HUD expensive in screen real estate and makes future game-specific top-area content harder to add.

This spec introduces a dedicated runner control-surface model, a settings menu/popover UI, and a clearer split between persistent status chrome and on-demand session controls. No backwards compatibility is required.

## Goals

- Eliminate the large always-visible control bar from the top HUD.
- Keep simulation playback controls, AI detail controls, and diagnostics accessible without consuming permanent space.
- Move session/config affordances into a structured settings menu anchored near existing session buttons.
- Preserve game-agnostic behavior in `GameDef`, simulation, compiler, kernel, and shared runtime types.
- Allow game-specific presentation layout to remain in `visual-config.yaml` only when it is truly presentation policy.
- Create an extensible architecture for future runner controls without adding more ad hoc top-bar components.

## Non-Goals

- Changing simulation semantics, AI behavior, or animation timing logic.
- Moving runner-control behavior into `GameDef`, `GameSpecDoc`, or simulation state.
- Making the settings menu itself game-specific in behavior.
- Reworking replay controls in this delivery.

## Problems in the Current Design

### P1: Wrong lifetime and prominence

`AnimationControls` is rendered as a permanent member of `OVERLAY_REGION_PANELS.top` in `GameContainer`. Playback speed, pause, skip, AI detail, auto-skip, and diagnostic download are configuration/session controls, not primary game-state information. They should not occupy persistent top-HUD real estate.

### P2: Mixed concerns inside the top region

The top region currently mixes:

- status overlays (`PhaseIndicator`, `TurnOrderDisplay`, `InterruptBanner`, `EventDeckPanel`),
- runner configuration (`AnimationControls`),
- session actions (`Hide Log`, `Save`, `Load`, `Quit`).

This makes the top bar harder to reason about and harder to extend.

### P3: No extensible control model

`AnimationControls` hardcodes UI composition directly in JSX. There is no reusable descriptor model for grouped controls, visibility rules, or alternate render surfaces such as menus, drawers, or command palettes.

### P4: UI state is fragmented

Some control state lives in `GameStore`, some in local React state inside `GameContainer`, and some is implicit in component structure. This is acceptable for small features but weak for long-lived chrome architecture.

### P5: No screen-space budgeting contract

The runner has a visual-config system for presentation, but the DOM overlay layer does not define a formal distinction between persistent chrome and collapsible chrome. As a result, adding future game-specific top-area panels will continue to collide with runner controls.

## Architectural Decisions

### D1: Introduce a dedicated runner control surface

Create a runner-owned control-surface layer for configuration and session affordances. This layer is distinct from overlay panels that represent game state.

The control surface will be anchored in the top-right session cluster and will render:

- a `SettingsMenuTrigger` button using a gear or wrench icon,
- the existing event-log toggle,
- save/load buttons,
- quit button.

The settings trigger must appear immediately to the left of the event-log toggle.

### D2: Replace `AnimationControls` with a menu-backed control group

Remove `AnimationControls` from the permanent top overlay region. Its controls will instead be re-expressed as grouped menu sections in a new settings menu.

Initial menu sections:

- `Playback`
  - animation speed segmented control: `1x`, `2x`, `4x`
  - pause/resume action
  - skip current animation action
- `AI Playback`
  - AI detail select: `Full`, `Standard`, `Minimal`
  - AI auto-skip toggle
- `Diagnostics`
  - download animation log action, only when available and only in supported environments

This preserves current capability while changing surface and information hierarchy.

### D3: Keep behavior in runner stores, not visual config

Playback speed, pause state, AI detail level, AI auto-skip, and diagnostics availability remain runner/application concerns. They stay backed by runner stores and orchestration code, not by `GameDef` or `visual-config.yaml`.

`visual-config.yaml` may describe presentation placement or spacing policy for runner chrome, but never the existence, semantics, or default values of runner configuration controls.

### D4: Add a small runner-UI store for transient chrome state

Introduce a dedicated runner UI/chrome store for transient control-surface state that should not live in `GameStore`, including:

- whether the settings menu is open,
- the currently focused menu section or item when keyboard navigation is active,
- event-log panel visibility.

`GameStore` should continue owning state that directly affects simulation playback or canvas orchestration:

- `animationPlaybackSpeed`
- `animationPaused`
- `animationSkipRequestToken`
- `aiPlaybackDetailLevel`
- `aiPlaybackAutoSkip`

This creates a clean split between operational state and chrome state.

### D5: Formalize control descriptors

Define a generic menu/control descriptor model so the control surface can be rendered from structured data instead of hardcoded JSX layout.

Representative shape:

```ts
type RunnerControlKind = 'segmented' | 'select' | 'toggle' | 'action';

interface RunnerControlSection {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly RunnerControlDescriptor[];
}

interface RunnerControlDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: RunnerControlKind;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
  readonly description?: string;
}
```

The descriptor builder is runner-owned and binds to stores/selectors. The rendering component is dumb and reusable.

This is the core extensibility move in the spec.

### D6: Split top overlay composition into status chrome and session chrome

Refactor `GameContainer` and `UIOverlay` composition so the top area has two explicit concepts:

- `topStatusContent`: persistent game-state overlays centered or left-weighted
- `topSessionContent`: session/config affordances anchored on the right

The current single `topBarContent` slot makes unrelated concerns compete in one row. The new split should express intent directly in the UI contract.

### D7: Add presentation-only chrome hints to visual config

Extend `visual-config.yaml` with a new optional runner-chrome presentation section for layout only.

Representative shape:

```yaml
runnerChrome:
  topBar:
    statusAlignment: center
    reserveRightInset: 280
    compactStatus: false
```

This section is optional and presentation-only. It may influence:

- right-side safe area reservation for status overlays,
- alignment/spacing choices for the top HUD,
- compact-vs-regular presentation preferences for status content.

It must not encode:

- available settings menu items,
- playback defaults,
- behavioral toggles,
- game rules,
- simulation policies.

If no `runnerChrome` config exists, the runner uses generic defaults.

### D8: Keep persistent status content visible

The following remain outside the settings menu unless later specs say otherwise:

- phase indicator,
- turn order,
- interrupt banner,
- event deck panel,
- other future game-state indicators.

The purpose of this spec is not to hide state, but to hide session/config controls that do not need constant visibility.

## Proposed UX

### Top-right cluster

Order, left to right:

1. settings trigger icon button
2. event-log toggle button
3. save button
4. load button
5. quit button

### Settings menu behavior

- Opens as a popover/dropdown anchored to the settings trigger.
- Closes on outside click, `Escape`, or selecting a one-shot action.
- Supports keyboard navigation and focus trapping appropriate for a lightweight popover menu.
- Uses grouped headings and inline descriptions where needed.
- Keeps dangerous/destructive actions out of the settings menu; `Quit` stays visible as a separate explicit action.

### Responsiveness

- On wide screens, menu opens downward/right-aligned from the trigger.
- On narrow screens, menu may switch to a sheet-like popover anchored from the same trigger, but the data model stays identical.
- The menu width should be bounded and should not stretch across the full screen.

## Detailed Deliverables

### D1: Runner Chrome State Store

Add a runner UI store dedicated to non-simulation chrome state.

Candidate file:

- `packages/runner/src/ui/runner-ui-store.ts`

State:

- `settingsMenuOpen: boolean`
- `eventLogVisible: boolean`
- optional keyboard/focus state for menu navigation

Actions:

- `openSettingsMenu()`
- `closeSettingsMenu()`
- `toggleSettingsMenu()`
- `setEventLogVisible(visible: boolean)`
- `toggleEventLogVisible()`

This store replaces the current local `eventLogVisible` state in `GameContainer`.

### D2: Control Descriptor Builder

Add a control-surface definition module that maps store state/actions into structured menu sections.

Candidate file:

- `packages/runner/src/ui/runner-control-surface.ts`

Responsibilities:

- read current runner/game store state,
- build grouped sections,
- expose control metadata and availability rules,
- keep rendering concerns out of the builder.

This module must be generic enough to support future additions without rewriting the menu component.

### D3: Settings Menu Components

Add a focused component set for the menu surface.

Candidate files:

- `packages/runner/src/ui/SettingsMenuTrigger.tsx`
- `packages/runner/src/ui/SettingsMenu.tsx`
- `packages/runner/src/ui/SettingsMenu.module.css`

Responsibilities:

- render icon trigger,
- render sections and controls from descriptors,
- handle popover open/close behavior,
- support keyboard and screen-reader accessibility.

`AnimationControls.tsx` and `AnimationControls.module.css` are removed after migration.

### D4: Top Overlay Contract Refactor

Refactor `UIOverlay` and `GameContainer` to separate status chrome from session chrome.

Files to modify:

- `packages/runner/src/ui/UIOverlay.tsx`
- `packages/runner/src/ui/UIOverlay.module.css`
- `packages/runner/src/ui/GameContainer.tsx`
- `packages/runner/src/ui/GameContainer.module.css`

Required changes:

- replace `topBarContent` with explicit top-status and top-session slots,
- stop rendering menu-backed controls as top overlay panels,
- keep right-side session controls layout stable and self-contained,
- preserve existing side, left, bottom, and floating regions.

### D5: Overlay Panel Boundary Cleanup

Remove configuration/session controls from `OVERLAY_REGION_PANELS.top`.

Required change:

- `AnimationControls` is no longer part of `top`.

Result:

- top overlay panels describe game-state/status information only.

### D6: Visual Config Schema Extension

Add an optional `runnerChrome` section to visual-config types and provider.

Files to modify:

- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `packages/runner/src/config/validate-visual-config-refs.ts` if needed for structural validation

Rules:

- schema must be presentation-only,
- defaults must be runner-owned,
- omission must be fully supported,
- FITL may opt in only if specific spacing/reserved-inset tuning is needed.

### D7: GameContainer Wiring Cleanup

Move event-log visibility out of local component state and into the runner UI store so session controls have one authoritative source.

This also makes:

- keyboard shortcut handling cleaner,
- menu and button synchronization deterministic,
- future persistence of UI preferences easier if later desired.

### D8: Test Coverage Update

Add or update tests for:

- menu descriptor generation,
- menu visibility and action dispatch,
- correct top-right button ordering,
- `AnimationControls` removal from top overlay panels,
- event-log visibility through the runner UI store,
- visual-config schema acceptance/rejection for `runnerChrome`,
- accessibility behavior for trigger/menu relationships.

Likely files:

- `packages/runner/test/ui/GameContainer.test.ts`
- new `packages/runner/test/ui/SettingsMenu.test.tsx`
- new `packages/runner/test/ui/runner-control-surface.test.ts`
- `packages/runner/test/config/*`

## Data Boundaries

### Must remain out of `GameDef` and simulation

- playback speed choices,
- current playback speed,
- paused state,
- AI detail setting,
- AI auto-skip setting,
- menu structure,
- event-log visibility,
- diagnostics download affordance,
- session button composition.

### May live in `visual-config.yaml`

- top-bar safe-area hints,
- spacing/alignment hints for runner chrome,
- compactness preferences for presentation-only layout.

### Must remain runner-owned

- menu grouping and labels,
- control behavior,
- control availability rules,
- store bindings,
- persistence strategy for user preferences if a later spec introduces it.

## Acceptance Criteria

- The large persistent playback/config bar no longer exists in the top HUD.
- A settings trigger is rendered immediately to the left of the event-log toggle.
- Playback speed, pause/resume, skip, AI detail, AI auto-skip, and diagnostics are accessible through the settings menu.
- Top overlay panels are limited to persistent game-state/status content.
- Event-log visibility is owned by runner chrome state rather than local `GameContainer` state.
- `GameDef`, simulation, compiler, and kernel remain unchanged in behavior and remain game-agnostic.
- `visual-config.yaml` gains only presentation-only runner-chrome hints, if any.
- The architecture supports adding future runner controls without introducing another permanent top-bar widget.

## File-Level Impact Summary

### New files

- `packages/runner/src/ui/runner-ui-store.ts`
- `packages/runner/src/ui/runner-control-surface.ts`
- `packages/runner/src/ui/SettingsMenuTrigger.tsx`
- `packages/runner/src/ui/SettingsMenu.tsx`
- `packages/runner/src/ui/SettingsMenu.module.css`

### Modified files

- `packages/runner/src/ui/GameContainer.tsx`
- `packages/runner/src/ui/GameContainer.module.css`
- `packages/runner/src/ui/UIOverlay.tsx`
- `packages/runner/src/ui/UIOverlay.module.css`
- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `data/games/fire-in-the-lake/visual-config.yaml` only if FITL needs non-default presentation hints

### Removed files

- `packages/runner/src/ui/AnimationControls.tsx`
- `packages/runner/src/ui/AnimationControls.module.css`

## Migration Notes

- No backwards compatibility is required.
- Existing top-bar control markup and tests may be deleted rather than adapted.
- `AnimationControls` is superseded, not preserved behind a legacy path.
- Games without `runnerChrome` config must render correctly using generic defaults.

## Verification

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`
4. Manual runner verification with FITL:
   - top area has materially more free space,
   - settings trigger sits left of `Hide Log`,
   - menu sections are structured and non-cluttering,
   - no game-state/status information is hidden unexpectedly.

## Out of Scope

- Replay control redesign
- Save/load workflow redesign
- New game-specific HUD widgets
- Persistence of user preferences across sessions
- Mobile-first re-layout of the entire runner shell
