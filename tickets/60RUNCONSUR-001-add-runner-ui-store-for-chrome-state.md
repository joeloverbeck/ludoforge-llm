# 60RUNCONSUR-001: Add Runner UI Store for Chrome State

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only state ownership cleanup
**Deps**: specs/60-runner-control-surface-and-settings-menu.md

## Problem

`GameContainer` currently owns event-log visibility as local React state even though that visibility is runner chrome, not component-private UI trivia. That makes the top-right session controls, keyboard shortcuts, and future settings menu state harder to coordinate because there is no single runner-owned source of truth for transient chrome state.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/GameContainer.tsx` still stores `eventLogVisible` in local component state and toggles it both from the button cluster and the `l` keyboard shortcut.
2. No runner UI store currently exists under `packages/runner/src/ui/`.
3. Corrected scope: this ticket should establish the chrome-state boundary first, but it should not introduce the settings menu UI or change top-overlay composition yet.

## Architecture Check

1. A dedicated runner UI store is cleaner than continuing to let `GameContainer` act as an ad hoc state container for long-lived chrome behavior.
2. Keeping event-log visibility and future menu-open state in a runner-owned store preserves the spec boundary: simulation state stays in `GameStore`, while transient chrome state stays outside engine/runtime contracts.
3. No backwards-compatibility shim should preserve local-state ownership as the authoritative source once the new store exists.

## What to Change

### 1. Introduce a small runner UI store

Add a focused store module for non-simulation chrome state with at least:

- `settingsMenuOpen`
- `eventLogVisible`
- open/close/toggle actions for the settings menu
- set/toggle actions for event-log visibility

### 2. Move event-log ownership out of `GameContainer`

Refactor `GameContainer` so the event-log button, keyboard shortcut, and reset-on-store-change logic read and write through the runner UI store instead of local `useState`.

### 3. Add focused store and wiring tests

Cover direct store actions plus the `GameContainer` contract that the event-log toggle and keyboard shortcut use the same backing state.

## File List It Expects to Touch

- `packages/runner/src/ui/runner-ui-store.ts` (new)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify)
- `packages/runner/test/ui/runner-ui-store.test.ts` (new)

## Out of Scope

- splitting `UIOverlay` into separate top status and top session slots
- adding control-descriptor builders
- adding settings menu rendering components
- removing `AnimationControls`
- adding `runnerChrome` schema or YAML support

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/runner-ui-store.test.ts` proves `toggleEventLogVisible`, `setEventLogVisible`, `openSettingsMenu`, `closeSettingsMenu`, and `toggleSettingsMenu` behave deterministically.
2. `packages/runner/test/ui/GameContainer.test.ts` proves the event-log button and `l` keyboard shortcut both update the same runner UI store state.
3. `packages/runner/test/ui/GameContainer.test.ts` proves event-log visibility resets from the runner UI store when a new `store` prop is mounted.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Event-log visibility remains runner-owned UI chrome, not simulation state and not `GameDef` data.
2. `GameStore` continues owning playback and AI behavior state; this ticket must not migrate those fields.
3. Keyboard and button toggles remain behaviorally equivalent from the user’s perspective.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/runner-ui-store.test.ts` — direct state/action coverage for runner chrome state.
2. `packages/runner/test/ui/GameContainer.test.ts` — event-log toggle ownership and keyboard wiring.

### Commands

1. `pnpm -F @ludoforge/runner test -- runner-ui-store`
2. `pnpm -F @ludoforge/runner test -- GameContainer`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm run check:ticket-deps`
