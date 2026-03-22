# 74VISMAPLAYEDI-008: Editor Toolbar and Keyboard Shortcuts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/74VISMAPLAYEDI/74VISMAPLAYEDI-002-editor-types-and-store.md, archive/tickets/74VISMAPLAYEDI-005-editor-screen-and-entry-point.md

## Problem

The map editor screen currently exposes only a placeholder toolbar row plus a Back button. Core editor actions already exist in the store, but they are not surfaced through screen controls or shared keyboard handling, which makes the editor slower to use and leaves screen-level orchestration incomplete.

## Assumption Reassessment (2026-03-22)

1. `MapEditorScreen` already exists and is the editor composition root. It currently renders a placeholder toolbar directly in `packages/runner/src/map-editor/MapEditorScreen.tsx`; this ticket should replace that placeholder rather than introduce a second toolbar path.
2. The editor store already contains the action/state needed for this ticket: `undo()`, `redo()`, `toggleGrid()`, `setGridSize()`, `setSnapToGrid()`, `showGrid`, `snapToGrid`, `dirty`, `selectedZoneId`, `selectedRouteId`, `undoStack`, and `redoStack`.
3. The runner does have a shared keyboard abstraction in `packages/runner/src/input/keyboard-coordinator.ts`, and other screens already use it with `isEditableTarget(...)`. However, its current `KeyboardEventLike` contract does not expose modifier keys, so it cannot cleanly represent `Ctrl/Cmd+Z` or `Ctrl/Cmd+Shift+Z` yet.
4. CSS modules are already in use for the screen. This ticket should extend `MapEditorScreen.module.css` and add a focused toolbar component stylesheet only if needed.
5. There is no dedicated waypoint-selection state in the editor store. Removing a waypoint currently happens by right-clicking a non-endpoint anchor handle in `map-editor-handle-renderer.ts`. A `Delete` shortcut would require inventing new selection semantics that are not otherwise part of this ticket.
6. The export flow is still ticket `74VISMAPLAYEDI-009`. This ticket may expose a disabled export button and callback seam, but it must not implement YAML export.

## Architecture Check

1. `MapEditorScreen` must remain the composition root. Toolbar rendering, shortcut registration, and back/export callback wiring belong there, not inside canvas or renderer modules.
2. Shared keyboard behavior should go through the existing keyboard coordinator pattern used elsewhere in the runner. Bypassing it with a bespoke `window.addEventListener('keydown', ...)` would duplicate input infrastructure and age poorly.
3. To make that possible, the keyboard coordinator contract should be extended to carry modifier-key state (`ctrlKey`, `metaKey`, `shiftKey`, `altKey`) instead of forcing downstream screens to escape the abstraction.
4. The toolbar should stay UI-focused: read editor state, invoke existing store actions, and surface navigation/export callbacks. It should not own canvas lifecycle, route editing logic, or bootstrap state.
5. Back navigation remains callback-driven from `MapEditorScreen` to the session store. No router calls, location changes, or parallel navigation paths.
6. No backwards-compatibility shims. If the shared keyboard contract changes, its current users and tests should be updated in the same change (Foundations 9 and 10).

## Scope Correction

1. Replace the inline placeholder toolbar in `MapEditorScreen` with a dedicated `MapEditorToolbar` component.
2. Add editor keyboard shortcuts through a screen-level hook or helper that uses the shared keyboard coordinator and `isEditableTarget(...)`.
3. Extend the keyboard coordinator event contract so modifier-aware shortcuts are first-class.
4. Do not introduce a new waypoint-selection model just to satisfy a speculative `Delete` shortcut.
5. Do not implement YAML export in this ticket; only add a disabled button and callback seam for the later export ticket.

## What to Change

### 1. Create toolbar component

New file `packages/runner/src/map-editor/map-editor-toolbar.tsx`:

**Buttons / controls**:
- **Back**: Calls the existing `onBack` callback. If `dirty === true`, prompt for confirmation before leaving.
- **Undo**: Calls `store.undo()`. Disabled when `undoStack` is empty.
- **Redo**: Calls `store.redo()`. Disabled when `redoStack` is empty.
- **Grid**: Calls `store.toggleGrid()`. Shows active state from `showGrid`.
- **Snap**: Calls `store.setSnapToGrid(!snapToGrid)`. Shows active state from `snapToGrid`.
- **Export YAML**: Calls `onExport` when enabled; for now render disabled because export is not implemented in this ticket.

**Display**:
- current game title
- editable grid size control, enabled only while grid is visible
- dirty-state indicator when there are unsaved editor changes

### 2. Add editor keyboard shortcut registration

Create a small screen-level helper such as `useMapEditorKeyboardShortcuts(...)` or equivalent:

- instantiate a keyboard coordinator following the existing runner pattern
- ignore editable targets via `isEditableTarget(...)`
- register the following shortcuts:
  - `Ctrl/Cmd+Z` -> `store.undo()`
  - `Ctrl/Cmd+Shift+Z` -> `store.redo()`
  - `Escape` -> `store.selectZone(null); store.selectRoute(null)`
  - `g` / `G` -> `store.toggleGrid()`
- destroy the coordinator on unmount

Important:
- Support both `ctrlKey` and `metaKey` so the shortcuts behave correctly on Windows/Linux and macOS.
- Do not add `Delete` in this ticket. The current architecture lacks explicit waypoint selection, and adding that would be a separate state-model change.

### 3. Extend the shared keyboard coordinator contract

Modify `packages/runner/src/input/keyboard-coordinator.ts` so `KeyboardEventLike` includes:
- `ctrlKey`
- `metaKey`
- `shiftKey`
- `altKey`

Update existing coordinator tests and any affected consumers accordingly. This is the enabling architecture change that keeps editor shortcuts inside the shared input system.

### 4. Wire toolbar and shortcuts into `MapEditorScreen`

Modify `packages/runner/src/map-editor/MapEditorScreen.tsx`:
- replace the inline placeholder toolbar markup with `MapEditorToolbar`
- keep `MapEditorScreen` as the owner of `onBack`, `onExport`, and shortcut registration
- pass the editor store into the toolbar only when the screen is ready

## Files to Touch

- `packages/runner/src/input/keyboard-coordinator.ts` (modify)
- `packages/runner/src/map-editor/map-editor-toolbar.tsx` (new)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify)
- `packages/runner/src/map-editor/MapEditorScreen.module.css` (modify)
- `packages/runner/test/input/keyboard-coordinator.test.ts` (modify)
- `packages/runner/test/map-editor/MapEditorScreen.test.tsx` (modify)
- `packages/runner/test/map-editor/map-editor-toolbar.test.tsx` (new)
- `packages/runner/test/map-editor/map-editor-keyboard-shortcuts.test.tsx` or equivalent (new)

## Out of Scope

- YAML export implementation (`74VISMAPLAYEDI-009`)
- Grid overlay rendering on the Pixi canvas (`74VISMAPLAYEDI-011`)
- Snap-to-grid drag math (`74VISMAPLAYEDI-004`, already implemented)
- New waypoint-selection state or `Delete`-key removal workflow
- Canvas/runtime ownership changes outside `MapEditorScreen`

## Acceptance Criteria

### Tests That Must Pass

1. Undo button is disabled when `undoStack` is empty.
2. Redo button is disabled when `redoStack` is empty.
3. Clicking Undo calls `store.undo()`.
4. Clicking Redo calls `store.redo()`.
5. Grid and Snap buttons reflect store state and invoke the corresponding actions.
6. Dirty indicator appears when `dirty === true`.
7. Grid size input reflects `gridSize` and updates it when edited.
8. `Ctrl/Cmd+Z` triggers undo.
9. `Ctrl/Cmd+Shift+Z` triggers redo.
10. `Escape` clears zone/route selection.
11. `g` toggles grid when focus is not inside an editable target.
12. Keyboard shortcut registration is cleaned up on unmount.
13. Back button prompts when the editor is dirty and otherwise calls `onBack` directly.
14. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `MapEditorScreen` remains the editor composition root.
2. Shortcut handling uses the shared keyboard coordinator abstraction rather than a screen-local raw DOM listener.
3. The shared keyboard coordinator exposes enough event state for modifier-aware shortcuts without bespoke editor-only escape hatches.
4. Toolbar code remains presentational/store-driven and does not absorb canvas or renderer responsibilities.
5. No new compatibility aliases or duplicate input systems are introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/input/keyboard-coordinator.test.ts` — modifier fields remain available through the shared event contract and handler ordering/cleanup still work
2. `packages/runner/test/map-editor/map-editor-toolbar.test.tsx` — button states, click handlers, dirty/back behavior, grid-size editing
3. `packages/runner/test/map-editor/map-editor-keyboard-shortcuts.test.tsx` — shortcut dispatch, editable-target bypass, cleanup
4. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — toolbar integration and screen-level wiring

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-22
- What actually changed:
  - Added `packages/runner/src/map-editor/map-editor-toolbar.tsx` and replaced the inline `MapEditorScreen` placeholder toolbar with a connected toolbar component that surfaces Back, Undo, Redo, Grid, Snap, grid-size editing, dirty-state indication, and a disabled export seam.
  - Added `packages/runner/src/map-editor/use-map-editor-keyboard-shortcuts.ts` and wired `MapEditorScreen` to register editor shortcuts through the shared keyboard coordinator instead of a bespoke DOM listener.
  - Extended `packages/runner/src/input/keyboard-coordinator.ts` so modifier-aware shortcuts are supported cleanly across the runner.
  - Added and updated runner tests covering toolbar behavior, shortcut behavior, screen integration, and the shared keyboard coordinator contract.
- Deviations from original plan:
  - The ticket was corrected before implementation because the existing keyboard coordinator did not expose modifier keys; using raw `window` listeners would have been a weaker architecture than extending the shared input abstraction.
  - `Delete` was explicitly left out. The current editor model has route selection but no waypoint-selection state, so adding `Delete` here would have forced an unrelated state-model expansion.
  - The export button remains intentionally disabled, with only the callback seam added, because YAML export belongs to `74VISMAPLAYEDI-009`.
- Verification results:
  - `pnpm -C packages/runner test`
  - `pnpm -C packages/runner typecheck`
  - `pnpm turbo lint`
