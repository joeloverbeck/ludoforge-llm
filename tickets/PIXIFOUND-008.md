# PIXIFOUND-008: Zone Renderer with MapSpace Overlays and Markers

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D4
**Priority**: P0
**Depends on**: PIXIFOUND-002, PIXIFOUND-003, PIXIFOUND-004
**Blocks**: PIXIFOUND-011, PIXIFOUND-012

---

## Objective

Implement the `ZoneRenderer` that renders `RenderZone[]` as visual elements with incremental diff updates, mapSpace overlays (population, econ, terrain, coastal), and zone markers. Uses object pooling via `ContainerPool`.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/zone-renderer.ts` — `createZoneRenderer()` factory

### New test files
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts`

---

## Out of Scope

- Do NOT implement token rendering — that is PIXIFOUND-010.
- Do NOT implement adjacency rendering — that is PIXIFOUND-009.
- Do NOT implement click-to-select interactions — that is PIXIFOUND-012.
- Do NOT implement the canvas-updater subscription wiring — that is PIXIFOUND-011.
- Do NOT implement per-game visual styling or custom renderers — that is Spec 42.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify `renderer-types.ts`, `faction-colors.ts`, `container-pool.ts`, or `position-store.ts`.

---

## Implementation Details

### Factory

```typescript
export function createZoneRenderer(
  parentContainer: Container,
  pool: ContainerPool,
): ZoneRenderer;
```

### Incremental diff via object pooling

- Internal `Map<string, Container>` is the diff source.
- On each `update()`:
  - New zone IDs: create Container (from pool), add to map and parent.
  - Removed zone IDs: remove Container from parent, return to pool, delete from map.
  - Existing IDs: update properties in place (position, color, label, selection state, markers, mapSpace badges).

### Default appearance (no visual config)

- Rectangle with rounded corners, filled with muted color based on zone type.
- Zone name as BitmapText label centered in the zone.
- Token count badge (small circle with number) when zone contains tokens.
- Visual states:
  - **Normal**: base fill.
  - **Selectable**: subtle glow border.
  - **Highlighted**: bright border.
  - **Selected**: thick bright border (for future use).

### MapSpace overlay rendering

When a zone has a matching `RenderMapSpace` (by ID):
- Population badge: small number in top-left corner.
- Econ badge: small number in top-right corner.
- Terrain tag indicator: colored dot or abbreviated label.
- Coastal indicator: wave-style border or visual marker.

### Zone marker rendering

Render `RenderMarker[]` on each zone as small state labels below the zone name.

---

## Acceptance Criteria

### Tests that must pass

**`zone-renderer.test.ts`** (mock PixiJS Container/Graphics/BitmapText):
- `update()` with empty arrays creates no containers.
- `update()` with 3 zones creates 3 containers in the map.
- Second `update()` removing one zone: map shrinks to 2, removed container returned to pool.
- Second `update()` adding a new zone: map grows, new container acquired from pool.
- Existing zones have position updated when position map changes.
- Zone `displayName` label text updates when name changes.
- Zone with `isSelectable: true` has glow border visual.
- Zone with `isHighlighted: true` has bright border visual.
- MapSpace overlay: zone with matching `RenderMapSpace` shows population and econ badges.
- MapSpace overlay: zone with `coastal: true` has coastal visual indicator.
- Zone markers render as state labels below zone name.
- `getContainerMap()` returns the internal map (read-only view).
- `destroy()` returns all containers to pool, removes from parent, clears map.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Implements `ZoneRenderer` interface from `renderer-types.ts`.
- Container references are stable across updates (same ID = same Container instance) — required for Spec 40 animation.
- No game-specific logic — appearance is derived entirely from RenderModel data.
- Uses `ContainerPool` from PIXIFOUND-003, not direct `new Container()` calls.
