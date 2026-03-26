# Spec 84 — Curve Editing & Control Point UX

## Context

Spec 83 added zone-edge anchor endpoints for connection routes, allowing endpoints to attach to specific edges of zones rather than their centers. While the anchor system works correctly, two remaining issues prevent effective curve editing in the map editor:

1. **Diamond control point handles are not interactive.** The cursor does not change to `grab` on hover, and click-drag pans the map instead of moving the handle. Root cause: the handle renderer's root container uses `eventMode = 'none'`, which blocks PixiJS v8's event system from resolving hit tests on child handles.

2. **Absolute control points produce broken curves.** Control points specified as absolute world coordinates (e.g., `{ kind: position, x: 480, y: 40 }`) do not correspond to actual zone positions computed by the ForceAtlas2 layout engine, producing wildly distorted Bézier curves (observed on the Hue↔Da Nang road).

This spec fixes both issues and adds a relative `curvature` control point mode plus live visual feedback during drag editing.

## Scope

- All connection routes in all games (engine-agnostic)
- Map editor handle interaction
- Visual config schema
- FITL visual-config.yaml migration (2 routes)

## Foundations Alignment

- **F1 (Engine Agnostic):** Changes are runner-only; no engine code touched
- **F3 (Visual Separation):** Curvature data lives in visual-config.yaml, not GameSpecDoc
- **F7 (Pure Functions):** All curvature math is side-effect-free
- **F9 (Backwards Compatible):** Existing `{ kind: position }` and `{ kind: anchor }` control point modes remain valid

---

## Deliverables

### 1. Fix Diamond Handle Event Propagation

**Root cause:** `map-editor-handle-renderer.ts:45` sets `root.eventMode = 'none'` on the container wrapping all editor handles. In PixiJS v8, `eventMode = 'none'` prevents the event system from resolving hit tests on child elements, even with `interactiveChildren = true`. This is the only container in the map editor using this pattern — all other interactive containers use `eventMode = 'passive'`.

**Evidence:**
- Route renderer root uses `eventMode = 'passive'` and its children receive events correctly
- The handle layer itself (`map-editor-canvas.ts:117-120`) uses `eventMode = 'passive'`
- Z-order is correct — `interfaceGroup` (handles) renders above `connectionRouteLayer` (routes)
- Diamond Polygon hit area is correctly defined: `(0,-10), (10,0), (0,10), (-10,0)`
- pixi-viewport's `.drag()` plugin does not bypass child hit tests

**Fix:** Change `root.eventMode` from `'none'` to `'passive'`.

**Files:**
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` — line 45

**Tests:**
- Existing tests verify handle configuration but not event propagation through parent hierarchy
- Add a test asserting `root.eventMode === 'passive'` to prevent regression

### 2. Relative Curvature Control Point Mode

**Problem:** Absolute `{ kind: position, x, y }` control points are fragile — they don't adapt when zones move. The layout engine computes zone positions dynamically, so a control point at `(480, 40)` can be completely wrong for the actual layout.

**Solution:** Add a `curvature` control point kind where the control point is expressed relative to the endpoint midpoint.

**Schema addition** in `visual-config-types.ts`:

```typescript
const CurvatureControlSchema = z.object({
  kind: z.literal('curvature'),
  offset: z.number(),                              // signed scalar: distance as fraction of endpoint span
  angle: z.number().min(0).max(360).optional(),     // override perpendicular direction (degrees)
}).strict();
```

Add `CurvatureControlSchema` to the `ConnectionRouteControlSchema` discriminated union.

**Resolution algorithm** (pure function):

```
Given endpoints P0 and P1:
1. M = midpoint(P0, P1)
2. D = distance(P0, P1)
3. If angle is specified:
     direction = unit vector at angle (using screen coordinate convention: 0°=east, 90°=north)
   Else:
     direction = perpendicular to (P0 → P1), rotated left (counterclockwise)
4. controlPoint = M + direction * offset * D
```

- `offset = 0` → control point at midpoint → effectively straight line
- `offset = 0.3` → gentle curve (30% of endpoint distance from midpoint)
- `offset = -0.3` → gentle curve in the opposite direction
- `offset = 1.0` → aggressive curve

**Files:**
- `packages/runner/src/config/visual-config-types.ts` — add `CurvatureControlSchema`
- `packages/runner/src/presentation/connection-route-resolver.ts` — resolve curvature in `resolveControlPoint()`
- `packages/runner/src/map-editor/map-editor-route-geometry.ts` — resolve curvature in editor geometry
- `packages/runner/src/map-editor/map-editor-store.ts` — support curvature in store actions (preview/commit)
- `packages/runner/src/map-editor/map-editor-export.ts` — serialize curvature control points to YAML
- `packages/runner/src/canvas/renderers/connection-route-renderer.ts` — resolve curvature in presentation renderer

**Tests:**
- Unit tests for curvature resolution: offset=0 → midpoint, positive/negative offset, with/without angle override
- Schema validation tests for the new `curvature` kind
- Export serialization round-trip tests
- Store action tests for curvature preview/commit

### 3. Live Visual Feedback During Drag

**Current state:** The handle renderer suppresses re-rendering during drag (`map-editor-handle-renderer.ts:232`). The route renderer also skips updates during drag. This means the user drags a handle without seeing how the curve changes.

**Three improvements:**

#### 3A. Live Tangent Line Updates

During control point drag, update the tangent line Graphics (white lines from endpoints to control point) in real-time.

**Approach:** Instead of full container teardown/rebuild during drag, update tangent line positions directly using the preview state from `previewControlPointMove`. Modify the handle renderer's store subscriber to allow tangent line updates while `isDragging` is true.

**Files:**
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` — update tangent Graphics during drag

#### 3B. Live Curve Preview

During control point drag, redraw the Bézier curve in real-time as the control point moves.

**Approach:** The route renderer (`map-editor-route-renderer.ts`) currently skips updates during drag. Remove this optimization for the selected route — allow it to re-render when `connectionRoutes` changes during drag. The `previewControlPointMove` action already updates the routes in the store.

**Files:**
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` — allow selected route updates during drag

#### 3C. Angle Indicator for Zone-Edge Anchor Drag

During zone-edge anchor endpoint drag, show the computed angle (degrees) near the handle.

**Approach:** Add a BitmapText label that appears during drag, positioned offset from the handle, showing the angle rounded to the nearest degree (e.g., `"90°"`). Destroy it when drag ends.

**Files:**
- `packages/runner/src/map-editor/map-editor-handle-renderer.ts` or `map-editor-drag.ts` — create/update/destroy angle label during drag

**Tests:**
- Verify tangent line positions update during mock drag events
- Verify route renderer responds to preview state changes during drag
- Verify angle label creation/update/destruction lifecycle

### 4. FITL Visual Config Migration

Two routes currently use `{ kind: position }` control points. Both should be migrated to `{ kind: curvature }`:

| Route | Current Control | Migration |
|-------|----------------|-----------|
| `loc-hue-da-nang:none` | `{ kind: position, x: 480, y: 40 }` | `{ kind: curvature, offset: 0.3 }` |
| `loc-saigon-an-loc-ban-me-thuot:none` | `{ kind: position, x: 500, y: 200 }` | `{ kind: curvature, offset: 0.3 }` |

All other FITL routes use `{ kind: straight }` segments — no migration needed.

The exact `offset` values should be visually tuned in the map editor after Deliverable 1 (handle fix) is implemented. `0.3` is a reasonable starting default.

**Files:**
- `data/games/fire-in-the-lake/visual-config.yaml` — lines 165-166 and 204-205

---

## Implementation Order

1. **Deliverable 1** (handle fix) — unblocks interactive editing
2. **Deliverable 2** (curvature mode) — unblocks Deliverable 4 migration
3. **Deliverable 4** (FITL migration) — applies curvature to fix broken routes
4. **Deliverable 3** (live feedback) — enhances editing UX

Deliverables 1 and 2 are independent and can be implemented in parallel. Deliverable 3 depends on Deliverable 1 (handles must work before live feedback matters). Deliverable 4 depends on Deliverable 2 (curvature mode must exist before routes can use it).

---

## Verification

1. **Handle interaction:** Open map editor, select a route with a quadratic segment, hover over the diamond handle → cursor changes to `grab`. Click and drag → handle moves, map does NOT pan.
2. **Curvature mode:** Create a route with `{ kind: curvature, offset: 0.3 }` → curve renders as a gentle arc perpendicular to the endpoint line. Change `offset` to `0` → curve becomes a straight line.
3. **Live feedback:** Drag a control point → curve and tangent lines update in real-time during drag. Drag a zone-edge anchor → angle indicator shows degrees.
4. **FITL routes:** The Hue↔Da Nang road renders as a gentle curve from Hue's south edge to Da Nang's north edge without wild looping. The Saigon→An Loc→Ban Me Thuot road renders with a reasonable curve.
5. **Existing routes unaffected:** All `{ kind: straight }` routes render unchanged. Any remaining `{ kind: position }` or `{ kind: anchor }` control points continue to work.
6. **Tests pass:** `pnpm -F @ludoforge/runner test`, `pnpm -F @ludoforge/runner typecheck`, `pnpm -F @ludoforge/runner lint`
