---
name: map-representation-implement
description: Use when the latest map plan is ready and improvements need to be implemented. Reads reports/map-representation-plan.md and reports/map-representation-evaluation.md, then implements the planned changes to the runner canvas renderers and visual config.
---

# Map Representation Implementation

Improve the FITL game map rendering based on the latest plan's recommendations.

## Checklist

> **Plan mode note**: If plan mode is active when this skill is invoked, steps 1-3 serve as the exploration phase. During exploration, also identify the specific file paths from the plan's implementation steps and read them via Explore agents to front-load context for the plan file. Write your execution plan to the plan file, exit plan mode, then continue with steps 4-12.

1. Read `reports/map-representation-evaluation.md` — focus on the latest EVALUATION #N for context on what needs improving.
2. Read `reports/map-representation-plan.md` — the implementation plan to execute. This is the primary guide for this session.
3. Read `docs/FOUNDATIONS.md` — verify alignment before writing any code. Pay special attention to:
   - **Foundation #3** (Visual Separation): All changes in runner/visual-config, never in engine or GameSpecDoc
   - **Foundation #7** (Immutability): State transitions return new objects, no mutation
   - **Foundation #9** (No Backwards Compatibility): No shims or deprecated fallbacks
   - **Foundation #10** (Architectural Completeness): Complete solutions, not patches
4. Collect the unique file paths (source files, config files, and test files with golden assertions) from all Implementation Steps in the plan. Read them in parallel (batch) to front-load context before starting edits. If the plan is data-only (e.g., visual-config.yaml vertex authoring), read the target data file(s) instead.
5. Follow the plan's implementation steps **in order**, respecting noted dependencies.
6. If vertices were authored or modified, verify shared borders: for each adjacent pair, confirm that converting relative vertices back to absolute world coordinates (`absoluteX = relativeX + centerX`) produces matching points on both sides of the shared edge.
7. If a step is ambiguous or you discover the plan's assumptions about the code are wrong, apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation) before proceeding — per Foundation #10.
8. If the plan includes map editor changes, implement those too.
9. Update golden test assertions. Check at minimum: `visual-config-files.test.ts` (attribute rules, colors, override counts), `layers.test.ts` (z-order indices if layer order changed), and `connection-route-renderer.test.ts` (route geometry expectations if route constants changed).
10. Run verification: `pnpm turbo typecheck` and `pnpm -F @ludoforge/runner test`.
11. Visual verification: Run `pnpm -F @ludoforge/runner dev` and inspect the map in the browser. Verify: all targeted zones render with the new shapes, terrain colors apply correctly, tokens render inside polygon bounds, adjacency lines connect to polygon edges, and the map editor shows the same changes. Report any visual anomalies to the user before concluding.
12. Do NOT update either report file — that happens in the next evaluate invocation.

## Key Files

### Frequently Modified

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/canvas/layers.ts` | Layer z-order hierarchy — controls rendering order of background, regions, adjacency, zones, routes, and overlays |
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Game canvas zone rendering — shape, fill, stroke, labels, badges, hidden stack visual |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Shape drawing primitives — `drawZoneShape()` dispatches shapes, `getEdgePointAtAngle()` computes edge intersections |
| `packages/runner/src/canvas/renderers/adjacency-renderer.ts` | Adjacency line rendering — dashed segments between zone edges, highlighting |
| `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` | Region boundary rendering — convex hull, label alpha, border styles |
| `packages/runner/src/config/visual-config-types.ts` | Zod schemas for visual config — must update when extending the config contract |
| `packages/runner/src/config/visual-config-defaults.ts` | `ZoneShape` type union, default dimensions, faction palette |
| `packages/runner/src/config/visual-config-provider.ts` | `ResolvedZoneVisual` interface, `resolveZoneVisual()` cascade, `applyZoneStyle()` |
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL visual configuration — zone shapes, positions, colors, routes |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Road/river route rendering — Bezier curves, wave effects, stroke styles, route endpoint geometry |
| `packages/runner/src/presentation/presentation-scene.ts` | Presentation layer — resolves zone render specs (label positioning, fill color, stroke, badges) from visual config + interaction state |
| `packages/runner/src/canvas/text/bitmap-font-registry.ts` | Bitmap font installation — base font size and resolution for all BitmapText labels |
| `packages/runner/src/map-editor/map-editor-zone-renderer.ts` | Map editor zone rendering (if plan requires editor changes) |

### Reference Only

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/canvas/geometry/dashed-segments.ts` | Dashed line segment algorithm — `buildDashedSegments()` |
| `packages/runner/src/canvas/renderers/stroke-dashed-segments.ts` | Rendering dashed segments to PixiJS Graphics |
| `packages/runner/src/config/visual-config-loader.ts` | Loads and parses visual config YAML |
| `packages/runner/src/layout/world-layout-model.ts` | Layout model types — `ZonePositionMap`, zone dimensions |
| `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` | Map editor adjacency lines (if plan requires editor changes) |

## Key Test Files

| File | What It Covers |
|------|---------------|
| `packages/runner/test/canvas/layers.test.ts` | Layer z-order golden assertions — `boardGroup.children` indices must be updated when layer order changes |
| `packages/runner/test/canvas/renderers/` | Zone renderer, adjacency renderer, connection route renderer tests |
| `packages/runner/test/config/` | Visual config loading and provider tests |
| `packages/runner/test/config/visual-config-files.test.ts` | **Golden assertions** on FITL visual-config.yaml structure and values — must be updated whenever YAML attribute rules, colors, or override counts change |
| `packages/runner/test/canvas/` | Canvas layer tests (renderers, interactions, viewport) |

## Architecture Context

### Zone Shape Drawing

The `drawZoneShape()` function in `shape-utils.ts` is the central shape dispatcher. It receives a `Graphics` object, dimensions, and a shape type string, then draws the appropriate shape. See the `ZoneShape` type union in `visual-config-defaults.ts` for the full list of supported shapes.

To add a new shape type (e.g., `polygon` with arbitrary vertices):
1. Add the shape name to the shape type union in `visual-config-types.ts`
2. Add a case in `drawZoneShape()` in `shape-utils.ts`
3. Update `visual-config.yaml` zone entries to use the new shape
4. Ensure the adjacency renderer can compute edge intersection points for the new shape

### Vertex Smoothing

`smoothPolygonVertices()` in `shape-utils.ts` applies Chaikin's corner-cutting algorithm (2 iterations by default) to all polygon vertices. It is called in both `drawZoneShape()` (for rendering) and `getEdgePointAtAngle()` (for adjacency line edge intersection). This ensures the drawn shape and the computed edge attachment points always match. The function is a pure transform: `readonly number[] → number[]`. It preserves shared-edge alignment between adjacent polygons because Chaikin's is a local operation — each output vertex depends only on two adjacent input vertices, so the same edge in two polygons produces identical smoothed points independently.

### Adjacency Edge Computation

Adjacency lines connect from edge point to edge point, not center to center. The edge point calculation is shape-specific — it finds the intersection of the line from center-to-center with the shape boundary. When adding a new shape, you must also update the edge intersection logic or the adjacency lines will connect to the wrong points.

### Connection Route Rendering

Routes (roads, rivers) use Bezier curves with configurable geometry. Route geometry is defined in `visual-config.yaml` via `connectionRoutes` entries with `points` arrays (zone or anchor endpoints) and `segments` arrays (straight or quadratic). The resolver (`connection-route-resolver.ts`) computes absolute positions from zone centers and configured anchors; the renderer (`connection-route-renderer.ts`) consumes pre-resolved paths. Route endpoints can be extended past polygon edges via `extendRouteEndpoints()` to create the impression of routes flowing through territory. When province shapes change, route anchor positions may need repositioning.

### Game Canvas vs Map Editor

Both flows reuse `drawZoneShape()` from `shape-utils.ts`. The game canvas adds labels, badges, selection highlighting, and token rendering on top. The map editor adds drag handles and selection highlighting. A change to `drawZoneShape()` affects both flows — verify both after changes. Label font size constants are NOT shared — `zone-renderer.ts` and `map-editor-zone-renderer.ts` each have their own. Check both when the plan modifies label sizing.

### Interaction vs. Config Stroke Resolution

The zone renderer receives two stroke color sources that must coexist:

- **Interaction stroke** (`zone.render.stroke`): Set by `resolveZoneStroke()` in `presentation-scene.ts`. Values: highlight (yellow), selectable (blue), or default (`#111827`, width 1, alpha 0.7). This is driven by game interaction state.
- **Config stroke** (`zone.visual.strokeColor`): Set by `resolveZoneVisual()` in `visual-config-provider.ts`. Comes from terrain attribute rules or per-zone overrides. This is purely visual config data.

The zone renderer uses a `DEFAULT_STROKE_SIGNATURE` pattern to detect whether an interaction stroke is active: if the render stroke matches `{ color: '#111827', width: 1, alpha: 0.7 }` exactly, it's the default and the visual config's `strokeColor` takes precedence. Otherwise, the interaction stroke wins. The map editor uses a simpler pattern: `isSelected ? SELECTED_STROKE_COLOR : visual.strokeColor ?? DEFAULT_STROKE_COLOR`.

### Polygon Vertex Design

When defining polygon vertices for province shapes:

1. **Coordinate system**: Vertices are relative to the zone's center `(0, 0)`. The zone container is positioned at the zone's world `(x, y)` coordinates. Vertices use the flat alternating format `[x1, y1, x2, y2, ...]` that `Graphics.poly()` expects.
2. **Shared borders**: Adjacent provinces must share identical border coordinates. To achieve this:
   - Define shared boundary points in **absolute world coordinates** first (e.g., the triple-point where three provinces meet).
   - Convert to zone-relative coordinates by subtracting each zone's center position: `relativeX = worldX - zoneCenterX`, `relativeY = worldY - zoneCenterY`.
   - In adjacent polygon vertex lists, the shared segment appears in **opposite winding order** (province A has points P1→P2, province B has P2→P1).
3. **Verification**: After computing vertices, verify all shared borders by converting back to world coords and confirming the same absolute segment appears in both polygons.
4. **External boundaries**: Non-shared edges (outer boundaries) can be placed freely to create a reasonable territory shape.

### Batch Vertex Authoring

When a plan requires authoring polygon vertices for many zones (10+), follow this workflow:

1. **Compute all midpoints first**: For every adjacent province pair, compute `midpoint = ((A.x + B.x) / 2, (A.y + B.y) / 2)` in absolute world coordinates. Build a lookup table.
2. **Identify 3-way junctions**: Where 3 provinces meet, compute the centroid of the 3 centers: `junction = ((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3)`.
3. **Author in geographic groups**: Work outward from existing polygons or from one end of the map. This maintains spatial coherence and makes shared-border alignment easier to verify.
4. **Spot-check after each group**: After authoring a group, pick 2-3 shared borders and manually verify that the absolute world coordinates match on both sides (`absolute = relative + center`).
5. **Round all coordinates to integers**: Avoids floating-point alignment drift between adjacent polygons.

### Tooling

For iterations that require authoring polygon vertices for many zones, consider writing a temporary Node.js script that reads zone center positions and adjacency data from visual-config.yaml / GameSpecDoc, computes midpoints and junction points, and outputs vertex arrays in YAML format. Delete the script after use per workspace hygiene rules.

## Extending Visual Config

When the plan requires new config fields (e.g., polygon vertex data, terrain texture settings), follow these steps in order, **skipping any that don't apply** to your field type:

1. **Schema** (`visual-config-types.ts`): Add the field to the relevant Zod schema (e.g., `ZoneVisualStyleSchema`). Use `.optional()` for new fields to maintain backward compatibility with other games.
2. **Type union** (`visual-config-defaults.ts`): *(Only if adding a new enum/shape value.)* Add it to the `ZoneShape` (or equivalent) type union here. The type union and the Zod enum must stay in sync. Skip this step for plain string/number fields.
3. **Interface** (`visual-config-provider.ts`): Add the field to `ResolvedZoneVisual` (or the relevant resolved interface). This is the contract that renderers consume.
4. **Cascade** (`visual-config-provider.ts`): Thread the field through `resolveZoneVisual()` (initialize with a default) and `applyZoneStyle()` (copy from source when present). This is the style-merge pipeline that applies category → attribute rules → overrides.
5. **Consumer** (renderer files): Use the new field where needed — pass it to drawing functions, edge calculations, hit areas, etc.
6. **Game config** (`data/games/fire-in-the-lake/visual-config.yaml`): Add the actual values.

**Test breakage warning**: Adding a required field to `ResolvedZoneVisual` breaks ~37 literal constructions across ~17 test files. To bulk-fix: search for `vertices: null` (the last field before the new one) and append `, newField: null`. **Watch for two patterns**: inline (`connectionStyleKey: null, vertices: null`) and multi-line (`vertices: null,` on its own line followed by `}`). Running both sed and replace_all risks double-insertion — verify with `grep 'newField: null, newField: null'` afterward and deduplicate any hits.

## Common Pitfalls

- **Edge intersection for new shapes**: If you add polygon-based provinces, the adjacency renderer's edge point calculation must handle arbitrary polygons. Without this, adjacency lines will connect to wrong points or pass through the shape interior.
- **Token positioning**: Tokens are positioned relative to zone center and dimensions. If province shapes change from rectangles to irregular polygons, ensure tokens still render inside the shape. Token layout may need a bounding-box or centroid-based approach.
- **Label positioning**: Zone labels are positioned in `presentation-scene.ts:resolveZoneRenderSpec()`. Non-circle shapes place labels at `y: 0` (inside the zone); circles place labels below at `y: bottomEdge + LABEL_GAP`. A semi-transparent background pill in `zone-renderer.ts` ensures contrast on all terrain colors. If shapes become concave polygons, the geometric center may not be inside the shape — consider a point-in-polygon check.
- **Map editor sync**: `drawZoneShape()` is shared, but the map editor has its own stroke colors and interaction handlers. Test both flows after shape changes.
- **Visual config backward compatibility**: Other games (Texas Hold'em) also use visual-config. New schema fields must be optional so other games don't break. Test with `pnpm turbo typecheck` to catch schema issues.
- **PixiJS Graphics API**: PixiJS 8 uses `Graphics.poly(points)` for arbitrary polygons where `points` is a flat array `[x1,y1, x2,y2, ...]`. Ensure the polygon is closed (first point = last point) or use `closePath()`.
- **TypeScript exactOptionalPropertyTypes**: This project enables `exactOptionalPropertyTypes`. When adding optional fields that receive `foo ?? undefined`, the type must include `| undefined` explicitly. E.g., `readonly vertices?: readonly number[] | undefined`, not just `readonly vertices?: readonly number[]`.
- **Vertex transforms affect edge intersection tests**: If smoothing or other vertex transformations are applied to `drawZoneShape()`, they must also be applied in `getEdgePointAtAngle()`, AND existing polygon edge intersection tests will need updated expectations since the shape boundary changes. The `smoothPolygonVertices()` function rounds corners inward, so edge intersection points move closer to center.
- **Route overlap margin affects geometry tests**: Changing `ROUTE_OVERLAP_MARGIN` in `connection-route-renderer.ts` extends route endpoints, which shifts the sampled midpoint position and tangent direction. This breaks assertions on midpoint coordinates and label rotation in `connection-route-renderer.test.ts`. The rotation normalization can produce values near 2π (equivalent to 0) — test assertions must handle modular equivalence.
- **Zone renderer child ordering**: `zone-renderer.test.ts` accesses zone container children by numeric index (`children[0]` = base, `children[1]` = hiddenStack, etc.). Adding or reordering children in `createZoneVisualElements()` / `addChild()` shifts all subsequent indices. After modifying the child list, update indices in the test using Python or manual edits — do **not** use sequential sed replacements (e.g., `[2]→[3]` then `[3]→[4]`) as this causes double-shifting. Process from highest index to lowest, or use a script that replaces all in one pass. Also update any `toHaveLength(N)` assertions on `container.children`.

## Scope Constraints

- Do not modify engine code (`packages/engine/`) — Foundation #3 (Visual Separation)
- Do not change game logic or GameSpecDoc YAML — Foundation #1 (Engine Agnosticism)
- All rendering changes must be in runner source (`packages/runner/src/`) or visual config (`data/games/*/visual-config.yaml`)
- Follow the plan's implementation steps — don't scope-creep beyond what was planned
- If you discover the plan is wrong or incomplete, apply the 1-3-1 rule rather than improvising
- The proposed changes should align with `docs/FOUNDATIONS.md`
