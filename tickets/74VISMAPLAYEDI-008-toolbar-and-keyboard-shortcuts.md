# 74VISMAPLAYEDI-008: Editor Toolbar and Keyboard Shortcuts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-005

## Problem

The map editor needs a toolbar with undo/redo buttons, grid toggle, snap toggle, and export button, plus keyboard shortcuts for common operations. Without these, the editor is functional but cumbersome to use.

## Assumption Reassessment (2026-03-21)

1. Editor store has `undo()`, `redo()`, `toggleGrid()`, `setGridSize()`, `snapToGrid` state, and `dirty` flag. Confirmed by 74VISMAPLAYEDI-002 design.
2. The runner uses a keyboard coordinator in `packages/runner/src/input/` for unified shortcut handling. Confirmed.
3. CSS modules are used for component styling throughout the runner. Confirmed.
4. The toolbar sits above the canvas as an overlay. Confirmed by 74VISMAPLAYEDI-005 layout.

## Architecture Check

1. Toolbar is a standard React component reading from the editor Zustand store — same pattern as game UI panels.
2. Keyboard shortcuts are registered on mount, removed on unmount — no global state pollution.
3. No engine changes (Foundation 1 preserved).
4. Back navigation remains callback-driven from `MapEditorScreen` into the session store. Do not add a second navigation mechanism in the toolbar (router calls, location changes, or bespoke close-editor aliases).
5. Toolbar/shortcut wiring plugs into `MapEditorScreen`, which remains the editor composition root from `74VISMAPLAYEDI-005`. Do not move canvas/bootstrap/renderer orchestration into the toolbar or shortcut layer.

## What to Change

### 1. Create toolbar component

New file `packages/runner/src/map-editor/map-editor-toolbar.tsx`:

**Buttons**:
- **Back** (← arrow): Calls the existing `onBack` prop from `MapEditorScreen` (which remains wired to session-store navigation). Shows confirmation dialog if `dirty === true`.
- **Undo** (Ctrl+Z icon): Calls `store.undo()`. Disabled when `undoStack` is empty.
- **Redo** (Ctrl+Shift+Z icon): Calls `store.redo()`. Disabled when `redoStack` is empty.
- **Grid** (toggle): Calls `store.toggleGrid()`. Visual indicator when active.
- **Snap** (toggle): Toggles `store.snapToGrid`. Visual indicator when active.
- **Export YAML** (download icon): Calls export handler (wired in 74VISMAPLAYEDI-009). Disabled when `dirty === false` (nothing to export) or as placeholder until export is implemented.

**Display**:
- Current grid size (editable number input when grid is visible)
- Dirty indicator (dot or asterisk when unsaved changes exist)

### 2. Register keyboard shortcuts

In `MapEditorScreen.tsx` (or a dedicated hook `useEditorKeyboardShortcuts`):

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | `store.undo()` |
| Ctrl+Shift+Z | `store.redo()` |
| Escape | `store.selectZone(null); store.selectRoute(null)` |
| G | `store.toggleGrid()` |
| Delete | Remove selected waypoint if applicable |

**Implementation**: `useEffect` with `keydown` listener on `window`, check `event.key` and modifiers, call store actions, `event.preventDefault()` for handled shortcuts. Cleanup on unmount.

### 3. Wire toolbar into MapEditorScreen

Modify `packages/runner/src/map-editor/MapEditorScreen.tsx`:
- Import and render `MapEditorToolbar` in the toolbar slot
- Pass `onBack`, `onExport` (placeholder/no-op until 74VISMAPLAYEDI-009), and store reference

## Files to Touch

- `packages/runner/src/map-editor/map-editor-toolbar.tsx` (new)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — wire toolbar)
- `packages/runner/src/map-editor/MapEditorScreen.module.css` (modify — toolbar styling)

## Out of Scope

- YAML export implementation (74VISMAPLAYEDI-009 — export button exists but calls placeholder)
- Grid overlay rendering on canvas (74VISMAPLAYEDI-011)
- Snap-to-grid logic in drag module (74VISMAPLAYEDI-004 — already implemented)
- Any existing keyboard coordinator changes

## Acceptance Criteria

### Tests That Must Pass

1. Undo button is disabled when `undoStack` is empty.
2. Redo button is disabled when `redoStack` is empty.
3. Clicking Undo calls `store.undo()`.
4. Clicking Redo calls `store.redo()`.
5. Grid toggle button reflects `showGrid` state.
6. Dirty indicator appears when `dirty === true`.
7. Keyboard shortcut Ctrl+Z triggers undo.
8. Keyboard shortcut Ctrl+Shift+Z triggers redo.
9. Keyboard shortcut Escape deselects all.
10. Back button shows confirmation when dirty.
11. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Keyboard shortcuts are cleaned up on unmount (no memory leaks).
2. No modification to the existing keyboard coordinator or input modules.
3. Toolbar is purely presentational + store interaction — no canvas logic.
4. Back navigation stays delegated to the existing `onBack` callback; toolbar work must not introduce a parallel navigation path.
5. Editor-wide assembly remains in `MapEditorScreen`; toolbar code must not become the owner of editor runtime construction/destruction.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-toolbar.test.tsx` — button states, click handlers, dirty indicator
2. `packages/runner/test/map-editor/editor-keyboard-shortcuts.test.ts` — shortcut dispatch, modifier key handling

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`
