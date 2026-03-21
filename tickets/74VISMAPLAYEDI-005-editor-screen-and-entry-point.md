# 74VISMAPLAYEDI-005: MapEditorScreen Component and GameSelection Entry Point

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-001, 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-003, 74VISMAPLAYEDI-004

## Problem

Users need a way to enter the map editor from the game selection screen and see a fully assembled editor screen that loads the game definition, computes initial layout, creates the editor store, and mounts the editor canvas.

## Assumption Reassessment (2026-03-21)

1. `GameSelectionScreen` displays game entries from `listBootstrapDescriptors()` and shows buttons per game (Play, Resume, Replay). Confirmed.
2. `App.tsx` switches on `sessionState.screen` and renders per-screen components. Confirmed — currently has a placeholder for `'mapEditor'` (from 74VISMAPLAYEDI-001).
3. `partitionZones(def)` returns `{ board, aux }` where `board` contains zones with adjacency. Confirmed in layout module.
4. `getOrComputeLayout(def, visualConfigProvider)` returns `{ worldLayout, mode }`. Confirmed.
5. `parseVisualConfigStrict(yamlString)` returns a validated `VisualConfig`. Confirmed.
6. Bootstrap descriptors include `gameId` and game metadata. Confirmed.

## Architecture Check

1. `MapEditorScreen` follows the pattern of other screen components — receives `gameId` and callbacks as props, manages its own lifecycle.
2. "Edit Map" button is conditional on `layout.mode === 'graph'` (map games only) — game-agnostic condition (Foundation 1).
3. No backwards-compatibility shims — new button and screen, no fallback (Foundation 9).
4. Session navigation must stay inside the existing discriminated-union session store added by `74VISMAPLAYEDI-001`. Do not introduce React Router, URL-state routing, or alternate navigation aliases for editor entry/exit; `openMapEditor(gameId)` and `returnToMenu()` remain the canonical transitions.
5. `MapEditorScreen` is the editor composition root. It owns bootstrap/loading, store creation, renderer assembly, canvas lifecycle, toolbar wiring, and teardown. Renderer/canvas modules stay narrow and must not absorb screen-level orchestration, session navigation, keyboard registration, or export flow ownership.

## What to Change

### 1. Create `MapEditorScreen` component

New file `packages/runner/src/map-editor/MapEditorScreen.tsx`:

**Props**: `{ gameId: string; onBack: () => void }`

**Lifecycle**:
1. Load game bootstrap data (GameDef + visual config YAML) using existing bootstrap loader
2. Parse visual config via `parseVisualConfigStrict`
3. Create `VisualConfigProvider` from parsed config
4. Compute initial layout via `getOrComputeLayout(def, visualConfigProvider)`
5. Create editor store via `createMapEditorStore(def, visualConfig, worldLayout.positions)`
6. Assemble editor runtime services at the screen layer: create editor canvas, then attach zone/route/handle/grid renderers and any keyboard/export hooks owned by later tickets
7. Mount editor canvas into a `<div ref>` container
8. Render toolbar component (placeholder — wired in 74VISMAPLAYEDI-008)
9. On unmount: destroy canvas/renderers/subscriptions owned by the screen composition root

**Layout**: Full-screen canvas with toolbar overlaid at top (CSS module).

### 2. Create CSS module

New file `packages/runner/src/map-editor/MapEditorScreen.module.css`:
- `.container` — full viewport, flex column
- `.canvasContainer` — flex: 1, overflow hidden
- `.toolbar` — positioned at top

### 3. Wire into `App.tsx`

Replace the placeholder `<div>` in the `'mapEditor'` case with `<MapEditorScreen gameId={sessionState.gameId} onBack={returnToMenu} />`.

### 4. Add "Edit Map" button to `GameSelectionScreen`

- Add `onEditMap?: (gameId: string) => void` to component props
- For each game entry, add an "Edit Map" button (conditionally shown — requires loading the game def to check if it has board zones, or checking if the bootstrap descriptor indicates graph layout mode)
- Button calls `onEditMap(gameId)`

### 5. Connect in `App.tsx`

Pass `onEditMap` prop from `App.tsx` that calls `sessionStore.openMapEditor(gameId)`.
Do not route editor entry through `selectGame()` or any pre-game screen transition. Editing a map is a distinct session intent and must remain explicit in the session API.

## Files to Touch

- `packages/runner/src/map-editor/MapEditorScreen.tsx` (new)
- `packages/runner/src/map-editor/MapEditorScreen.module.css` (new)
- `packages/runner/src/App.tsx` (modify — wire MapEditorScreen)
- `packages/runner/src/ui/GameSelectionScreen.tsx` (modify — add "Edit Map" button + `onEditMap` prop)

## Out of Scope

- Route rendering (74VISMAPLAYEDI-006)
- Handle rendering (74VISMAPLAYEDI-006, 007)
- Toolbar implementation (74VISMAPLAYEDI-008)
- YAML export (74VISMAPLAYEDI-009)
- Grid overlay (74VISMAPLAYEDI-011)
- Modifying bootstrap loaders or visual config parser

## Acceptance Criteria

### Tests That Must Pass

1. `MapEditorScreen` mounts without errors given valid `gameId`.
2. `MapEditorScreen` calls `onBack` when back navigation is triggered.
3. `GameSelectionScreen` renders "Edit Map" button for games with map zones.
4. `GameSelectionScreen` does NOT render "Edit Map" button for games without board zones (e.g., table-layout-only games).
5. Clicking "Edit Map" calls `onEditMap` with the correct `gameId`.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `MapEditorScreen` is game-agnostic — works with any game that has map zones (Foundation 1).
2. No modifications to bootstrap loaders, visual config parser, or layout computation modules.
3. Canvas is properly destroyed on unmount (no memory leaks).
4. Existing game selection and play flow is unchanged.
5. Editor navigation continues to use the session store's explicit screen union rather than an additional routing layer.
6. `MapEditorScreen` remains the single composition root for the editor. Later tickets must plug renderers/tools into the screen rather than moving orchestration into `map-editor-canvas.ts` or individual renderer modules.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — mount/unmount lifecycle, back navigation callback
2. `packages/runner/test/ui/GameSelectionScreen.test.tsx` — "Edit Map" button rendering (conditional), click callback

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`
