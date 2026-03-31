# 99MAPEDIREN-003: Create editor-to-PresentationScene adapter

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: `specs/99-map-editor-renderer-unification.md`, `99MAPEDIREN-002` (needs aligned layer hierarchy)

## Problem

Game canvas renderers consume `PresentationScene` data. The map editor has its own state shape (editor store). To reuse game canvas renderers in the editor, a thin adapter must convert editor state into a `PresentationScene`. This adapter is the key enabling piece for renderer unification.

## Assumption Reassessment (2026-03-30)

1. `PresentationScene` interface is stable at 7 fields: `zones`, `connectionRoutes`, `junctions`, `tokens`, `adjacencies`, `overlays`, `regions` — CONFIRMED in `presentation/presentation-scene.ts`.
2. `PresentationZoneNode` has fields: `id`, `displayName`, `ownerID`, `isSelectable`, `category`, `attributes`, `visual` (ResolvedZoneVisual with shape/width/height/color/strokeColor/connectionStyleKey/vertices), `render` (PresentationZoneRenderSpec with fillColor/stroke/hiddenStackCount/nameLabel/markersLabel/badge) — CONFIRMED.
3. `resolveConnectionRoutes()` exists in `presentation/connection-route-resolver.ts` and can accept editor anchor/route data — CONFIRMED.
4. `resolveRegionNodes()` exists in `presentation/presentation-scene.ts` — CONFIRMED.
5. `computeProvinceBorders()` exists in `canvas/renderers/province-border-utils.ts` — CONFIRMED.
6. Editor store `zoneVertices` type is `ReadonlyMap<string, readonly number[]>` (flat `[x1,y1,x2,y2,...]`), NOT `Position[]` — CONFIRMED.

## Architecture Check

1. The adapter is a pure function: `(EditorState inputs) → PresentationScene`. No side effects, easy to test, cheap to call on every frame.
2. No engine changes. Adapter works with any `GameDef` — preserves engine agnosticism (Foundation 1).
3. Visual config continues to drive all styling through `VisualConfigProvider` (Foundation 3).
4. No backwards-compatibility shims. This is a new file, not a wrapper around old code.

## What to Change

### 1. Create `packages/runner/src/map-editor/map-editor-presentation-adapter.ts`

Implement `buildEditorPresentationScene()` with this signature:

```typescript
export function buildEditorPresentationScene(options: {
  gameDef: GameDef;
  visualConfigProvider: VisualConfigProvider;
  positions: ReadonlyMap<string, Position>;
  zoneVertices: ReadonlyMap<string, readonly number[]>;
  connectionAnchors: ReadonlyMap<string, Position>;
  connectionRoutes: ReadonlyMap<string, ConnectionRouteDefinition>;
  selectedZoneId: string | null;
}): PresentationScene;
```

Field mapping:
- `zones`: Build `PresentationZoneNode[]` from `gameDef.zones` + `visualConfigProvider` + `positions` + `zoneVertices`. Set `ownerID: null`, `isSelectable: true`. Build `render` spec with `hiddenStackCount: 0`, `badge: null`, empty `markersLabel`. Build `visual` via `visualConfigProvider.resolveZoneVisual()`, overriding `vertices` from `zoneVertices` map when present. Apply selection highlight stroke via `selectedZoneId`.
- `adjacencies`: Map `gameDef` adjacency pairs to `PresentationAdjacencyNode[]`. Set `isHighlighted: false`.
- `connectionRoutes`: Call `resolveConnectionRoutes()` with editor route data.
- `junctions`: From same `resolveConnectionRoutes()` call.
- `regions`: Call `resolveRegionNodes()` with visual config.
- `tokens`: Empty array `[]`.
- `overlays`: Empty array `[]`.

### 2. Create adapter unit tests

Test all field mappings with known inputs, verify defaults, verify empty arrays for tokens/overlays.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-presentation-adapter.ts` (new — ~200 lines)
- `packages/runner/test/map-editor/map-editor-presentation-adapter.test.ts` (new)

## Out of Scope

- Wiring the adapter into `MapEditorScreen.tsx` (that is 99MAPEDIREN-004)
- Modifying game canvas renderers (they are NOT changed)
- Modifying `PresentationScene` type (it is NOT changed)
- Modifying `buildPresentationScene()` (the game canvas version is NOT changed)
- Layer hierarchy changes (99MAPEDIREN-002)
- Polyline utility extraction (99MAPEDIREN-001)
- Deleting editor renderers (99MAPEDIREN-005)
- Any engine package changes

## Acceptance Criteria

### Tests That Must Pass

1. `buildEditorPresentationScene()` produces `zones` with correct count matching `gameDef.zones` count.
2. All zone nodes have `ownerID: null`, `hiddenStackCount: 0`, `markers: ''`, `badge: null`, `isSelectable: true`.
3. Selected zone has distinct stroke color; unselected zones do not.
4. `adjacencies` count matches GameDef adjacency pair count.
5. `tokens` is empty array.
6. `overlays` is empty array.
7. `connectionRoutes` and `junctions` are populated when route data is provided.
8. `regions` are populated when visual config contains region hints.
9. Zone positions match the `positions` map input.
10. Zone vertices match the `zoneVertices` map input.
11. Existing suite: `pnpm -F @ludoforge/runner test`
12. Typecheck: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `PresentationScene` type is NOT modified — adapter produces data conforming to the existing interface.
2. Adapter is a pure function — no side effects, no state mutation.
3. Adapter does not import from any map-editor renderer (no circular dependency risk).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-presentation-adapter.test.ts` — comprehensive adapter unit tests covering all field mappings, defaults, selection highlight, empty collections

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose map-editor-presentation-adapter`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completion date**: 2026-03-30
- **What changed**:
  - Created `packages/runner/src/map-editor/map-editor-presentation-adapter.ts` (~160 lines) — pure function `buildEditorPresentationScene()` converting editor state to `PresentationScene`
  - Created `packages/runner/test/map-editor/map-editor-presentation-adapter.test.ts` — 19 unit tests covering all acceptance criteria
- **Deviations from original plan**:
  - Ticket assumption #2 corrected: `PresentationZoneNode` uses `visual` (ResolvedZoneVisual) + `render` (PresentationZoneRenderSpec), not flat fields
  - `zoneVertices` signature corrected from `ReadonlyMap<string, readonly Position[]>` to `ReadonlyMap<string, readonly number[]>` to match editor store
  - VisualConfig key corrected from `categories` to `categoryStyles`
- **Verification results**: typecheck clean, 206 test files / 2107 tests all passing
