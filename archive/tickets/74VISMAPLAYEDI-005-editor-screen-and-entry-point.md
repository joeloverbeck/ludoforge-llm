# 74VISMAPLAYEDI-005: MapEditorScreen Component and GameSelection Entry Point

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-001, 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-003, 74VISMAPLAYEDI-004

## Problem

Users need a way to enter the map editor from the game selection screen and see a fully assembled editor screen that loads the game definition, computes initial layout, creates the editor store, and mounts the editor canvas.

## Assumption Reassessment (2026-03-21)

1. `GameSelectionScreen` does render game entries from `listBootstrapDescriptors()`, but each game is currently a single clickable card. It does not already expose per-game action buttons. Ticket scope must account for restructuring the game card actions rather than appending a button to an existing action row.
2. `App.tsx` does switch on `sessionState.screen` and currently renders a placeholder branch for `'mapEditor'`. Confirmed.
3. `partitionZones(def)` returns `{ board, aux }`, but `board` is not limited to zones with explicit adjacency. It includes `zoneKind === 'board'` zones and any non-internal zone with adjacency. Ticket language must not reduce the board partition to adjacency-only semantics.
4. `getOrComputeLayout(def, visualConfigProvider)` returns `{ worldLayout, mode }`. Confirmed.
5. `parseVisualConfigStrict(rawYaml)` returns `VisualConfig | null`, not an always-present validated object. Editor bootstrap must treat invalid or missing visual config as a load failure, not as a guaranteed parsed config.
6. Bootstrap descriptors expose `id`, metadata, `resolveGameDefInput()`, and `resolveVisualConfigYaml()`. They do not currently expose map-editor capability metadata or precomputed layout mode. If the selection screen needs to know whether map editing is supported, that knowledge must be derived in bootstrap code rather than hardcoded in the UI.
7. The repo already contains editor primitives from prior tickets: `map-editor-store.ts`, `map-editor-canvas.ts`, `map-editor-zone-renderer.ts`, and `map-editor-drag.ts`. This ticket is therefore an integration/composition ticket, not a greenfield editor bootstrap ticket.

## Architecture Check

1. `MapEditorScreen` follows the pattern of other screen components — receives `gameId` and callbacks as props, manages its own lifecycle.
2. "Edit Map" availability must be derived once in bootstrap/integration code, not by duplicating layout inference or reparsing visual config ad hoc inside `GameSelectionScreen`. The UI should consume a single capability signal such as `supportsMapEditor`.
3. No backwards-compatibility shims — new button and screen, no fallback (Foundation 9).
4. Session navigation must stay inside the existing discriminated-union session store added by `74VISMAPLAYEDI-001`. Do not introduce React Router, URL-state routing, or alternate navigation aliases for editor entry/exit; `openMapEditor(gameId)` and `returnToMenu()` remain the canonical transitions.
5. `MapEditorScreen` is the editor composition root. It owns bootstrap/loading, store creation, renderer assembly, canvas lifecycle, toolbar wiring, and teardown. Renderer/canvas modules stay narrow and must not absorb screen-level orchestration, session navigation, keyboard registration, or export flow ownership.
6. Bootstrap resolution for the editor should be centralized. Reconstructing the active-game bootstrap pipeline inline inside `MapEditorScreen` would duplicate descriptor resolution, visual-config parsing, and validation concerns. A small bootstrap helper for editor/runtime consumers is preferable to screen-local orchestration glue.

## What to Change

### 1. Create `MapEditorScreen` component

New file `packages/runner/src/map-editor/MapEditorScreen.tsx`:

**Props**: `{ gameId: string; onBack: () => void }`

**Lifecycle**:
1. Load editor bootstrap data for `gameId` through a shared bootstrap helper built on top of the existing descriptor registry
2. Parse visual config and validate references against the resolved `GameDef`
3. Create `VisualConfigProvider` from the parsed config
4. Compute initial layout via `getOrComputeLayout(def, visualConfigProvider)`
5. Create editor store via `createMapEditorStore(def, visualConfig, worldLayout.positions)`
6. Assemble existing editor runtime services at the screen layer: create the editor canvas, attach the existing zone renderer/drag behavior, and leave later route/handle/grid modules to future tickets
7. Mount editor canvas into a `<div ref>` container
8. Render toolbar component (placeholder — wired in 74VISMAPLAYEDI-008)
9. On unmount: destroy canvas/renderers/subscriptions owned by the screen composition root

**Layout**: Full-screen canvas with toolbar overlaid at top (CSS module).

**Required UI states**:
- Loading state while bootstrap data resolves
- Error state when `gameId` is unknown, the game does not support map editing, or visual-config parsing/validation fails
- Ready state once canvas and renderer composition succeed

### 2. Create CSS module

New file `packages/runner/src/map-editor/MapEditorScreen.module.css`:
- `.container` — full viewport, flex column
- `.canvasContainer` — flex: 1, overflow hidden
- `.toolbar` — positioned at top

### 3. Add shared editor bootstrap/capability resolution

Add a bootstrap-layer helper that resolves editor-facing bootstrap data from a descriptor:

- resolve descriptor by `gameId`
- load `GameDef`
- parse visual config
- validate visual-config references
- derive `supportsMapEditor` from the resolved layout mode and/or board-zone partition

This helper is the canonical place for map-editor eligibility checks used by both `MapEditorScreen` and `GameSelectionScreen`.

### 3. Wire into `App.tsx`

Replace the placeholder `<div>` in the `'mapEditor'` case with `<MapEditorScreen gameId={sessionState.gameId} onBack={returnToMenu} />`.

### 4. Add "Edit Map" button to `GameSelectionScreen`

- Add `onEditMap?: (gameId: string) => void` to component props
- Restructure the game card markup so the game remains selectable for play while the card can also expose an explicit "Edit Map" action without nesting interactive elements
- Resolve and cache per-game editor capability through the shared bootstrap helper instead of encoding layout logic directly in the component
- For each game entry, render "Edit Map" only when the game supports map editing
- Button calls `onEditMap(gameId)`

### 5. Connect in `App.tsx`

Pass `onEditMap` prop from `App.tsx` that calls `sessionStore.openMapEditor(gameId)`.
Do not route editor entry through `selectGame()` or any pre-game screen transition. Editing a map is a distinct session intent and must remain explicit in the session API.

## Files to Touch

- `packages/runner/src/map-editor/MapEditorScreen.tsx` (new)
- `packages/runner/src/map-editor/MapEditorScreen.module.css` (new)
- `packages/runner/src/bootstrap/*` (modify/add small editor bootstrap helper and capability derivation)
- `packages/runner/src/App.tsx` (modify — wire MapEditorScreen)
- `packages/runner/src/ui/GameSelectionScreen.tsx` (modify — add "Edit Map" button + `onEditMap` prop)

## Out of Scope

- Route rendering (74VISMAPLAYEDI-006)
- Handle rendering (74VISMAPLAYEDI-006, 007)
- Toolbar implementation (74VISMAPLAYEDI-008)
- YAML export (74VISMAPLAYEDI-009)
- Grid overlay (74VISMAPLAYEDI-011)
- Modifying the underlying visual-config parser semantics
- Broad bootstrap-architecture rewrites beyond the small shared helper needed for editor/runtime composition

## Acceptance Criteria

### Tests That Must Pass

1. `MapEditorScreen` mounts without errors given valid `gameId`.
2. `MapEditorScreen` calls `onBack` when back navigation is triggered.
3. `MapEditorScreen` surfaces a failure state for unknown games or invalid/unsupported editor bootstrap data.
4. `GameSelectionScreen` renders "Edit Map" button for games that support map editing.
5. `GameSelectionScreen` does NOT render "Edit Map" button for games that do not support map editing (for example table-layout-only games).
6. Clicking the main game card still selects the game for normal play.
5. Clicking "Edit Map" calls `onEditMap` with the correct `gameId`.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `MapEditorScreen` is game-agnostic — works with any game that has map zones (Foundation 1).
2. The editor entry path does not duplicate bootstrap/layout capability logic in multiple UI components.
3. Canvas is properly destroyed on unmount (no memory leaks).
4. Existing game selection and play flow is unchanged.
5. Editor navigation continues to use the session store's explicit screen union rather than an additional routing layer.
6. `MapEditorScreen` remains the single composition root for the editor. Later tickets must plug renderers/tools into the screen rather than moving orchestration into `map-editor-canvas.ts` or individual renderer modules.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — loading/success/failure states, mount/unmount lifecycle, back navigation callback
2. `packages/runner/test/ui/GameSelectionScreen.test.tsx` — "Edit Map" button rendering (conditional), normal game selection preserved, click callback
3. `packages/runner/test/ui/App.test.ts` — `'mapEditor'` branch renders `MapEditorScreen` instead of the placeholder and wires back-to-menu correctly

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-22
- What changed:
  - Added `MapEditorScreen` as the editor composition root, including loading, error, and ready states.
  - Added a shared bootstrap helper that loads validated editor bootstrap data and derives `supportsMapEditor` once for both the selection screen and the editor screen.
  - Replaced the `App.tsx` map-editor placeholder with the real screen and wired `onEditMap` from the session store.
  - Updated `GameSelectionScreen` to preserve normal game selection while exposing a conditional `Edit Map` action for supported games.
  - Added tests for the new screen lifecycle/error states, entry-point wiring, and layout-token coverage.
- Deviations from original plan:
  - Instead of letting `GameSelectionScreen` infer editor eligibility directly, editor support was centralized in bootstrap code to avoid duplicated layout/parsing logic.
  - The screen composes the existing canvas/store/zone-renderer primitives from prior tickets rather than treating editor bootstrap as greenfield work.
- Verification:
  - `pnpm -F @ludoforge/runner test -- --runInBand packages/runner/test/ui/GameSelectionScreen.test.tsx packages/runner/test/map-editor/MapEditorScreen.test.tsx packages/runner/test/ui/App.test.ts packages/runner/test/ui/tokens.test.ts` (Vitest executed the full runner suite and passed)
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm turbo lint`
