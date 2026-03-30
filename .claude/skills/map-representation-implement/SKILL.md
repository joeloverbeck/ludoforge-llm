---
name: map-representation-implement
description: Use when the latest map plan is ready and improvements need to be implemented. Reads reports/map-representation-plan.md and reports/map-representation-evaluation.md, then implements the planned changes to the runner canvas renderers and visual config.
---

# Map Representation Implementation

Improve the FITL game map rendering based on the latest plan's recommendations.

## Checklist

1. Read `reports/map-representation-evaluation.md` — focus on the latest EVALUATION #N for context on what needs improving.
2. Read `reports/map-representation-plan.md` — the implementation plan to execute. This is the primary guide for this session.
3. Read `docs/FOUNDATIONS.md` — verify alignment before writing any code. Pay special attention to:
   - **Foundation #3** (Visual Separation): All changes in runner/visual-config, never in engine or GameSpecDoc
   - **Foundation #7** (Immutability): State transitions return new objects, no mutation
   - **Foundation #9** (No Backwards Compatibility): No shims or deprecated fallbacks
   - **Foundation #10** (Architectural Completeness): Complete solutions, not patches
4. Read the specific source files identified in the plan's Implementation Steps.
5. Follow the plan's implementation steps **in order**, respecting noted dependencies.
6. If a step is ambiguous or you discover the plan's assumptions about the code are wrong, apply the **1-3-1 rule** (1 problem, 3 options, 1 recommendation) before proceeding — per Foundation #10.
7. If the plan includes map editor changes, implement those too.
8. Run verification: `pnpm turbo typecheck` and `pnpm -F @ludoforge/runner test`.
9. Do NOT update either report file — that happens in the next evaluate invocation.

## Key Files

| File | What It Controls |
|------|-----------------|
| `packages/runner/src/canvas/renderers/zone-renderer.ts` | Game canvas zone rendering — shape, fill, stroke, labels, badges, hidden stack visual |
| `packages/runner/src/canvas/renderers/shape-utils.ts` | Shape drawing primitives — `drawZoneShape()` dispatches to rectangle, circle, polygon, etc. |
| `packages/runner/src/canvas/renderers/adjacency-renderer.ts` | Adjacency line rendering — dashed segments between zone edges, highlighting |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Road/river route rendering — Bezier curves, wave effects, stroke styles |
| `packages/runner/src/canvas/geometry/dashed-segments.ts` | Dashed line segment algorithm — `buildDashedSegments()` |
| `packages/runner/src/canvas/renderers/stroke-dashed-segments.ts` | Rendering dashed segments to PixiJS Graphics |
| `packages/runner/src/config/visual-config-types.ts` | Zod schemas for visual config — must update when extending the config contract |
| `packages/runner/src/config/visual-config-provider.ts` | Visual config accessor methods — zone shapes, labels, stroke styles |
| `packages/runner/src/config/visual-config-loader.ts` | Loads and parses visual config YAML |
| `packages/runner/src/layout/world-layout-model.ts` | Layout model types — `ZonePositionMap`, zone dimensions |
| `data/games/fire-in-the-lake/visual-config.yaml` | FITL visual configuration — zone shapes, positions, colors, routes |
| `packages/runner/src/map-editor/map-editor-zone-renderer.ts` | Map editor zone rendering (if plan requires editor changes) |
| `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` | Map editor adjacency lines (if plan requires editor changes) |

## Key Test Files

| File | What It Covers |
|------|---------------|
| `packages/runner/test/canvas/renderers/` | Zone renderer, adjacency renderer, connection route renderer tests |
| `packages/runner/test/config/` | Visual config loading and provider tests |
| `packages/runner/test/canvas/` | Canvas layer tests (renderers, interactions, viewport) |

## Architecture Context

### Zone Shape Drawing

The `drawZoneShape()` function in `shape-utils.ts` is the central shape dispatcher. It receives a `Graphics` object, dimensions, and a shape type string, then draws the appropriate shape. Currently supported: `rectangle`, `circle`, `ellipse`, `diamond`, `hexagon`, `triangle`, `octagon`, `line`, `connection`.

To add a new shape type (e.g., `polygon` with arbitrary vertices):
1. Add the shape name to the shape type union in `visual-config-types.ts`
2. Add a case in `drawZoneShape()` in `shape-utils.ts`
3. Update `visual-config.yaml` zone entries to use the new shape
4. Ensure the adjacency renderer can compute edge intersection points for the new shape

### Adjacency Edge Computation

Adjacency lines connect from edge point to edge point, not center to center. The edge point calculation is shape-specific — it finds the intersection of the line from center-to-center with the shape boundary. When adding a new shape, you must also update the edge intersection logic or the adjacency lines will connect to the wrong points.

### Connection Route Rendering

Routes (roads, rivers) use Bezier curves with configurable endpoints. The endpoints are currently defined in `visual-config.yaml` as `sourceEndpoint` and `targetEndpoint` objects with `x`, `y` offsets relative to zone positions. When province shapes change, route endpoints may need repositioning.

### Game Canvas vs Map Editor

Both flows reuse `drawZoneShape()` from `shape-utils.ts`. The game canvas adds labels, badges, selection highlighting, and token rendering on top. The map editor adds drag handles and selection highlighting. A change to `drawZoneShape()` affects both flows — verify both after changes.

## Extending Visual Config

When the plan requires new config fields (e.g., polygon vertex data, terrain texture settings):

1. **Schema** (`visual-config-types.ts`): Add the field to the relevant Zod schema. Use `.optional()` for new fields to maintain backward compatibility with other games.
2. **Accessor** (`visual-config-provider.ts`): Add a getter method that reads the new field from `this.config`.
3. **Consumer** (renderer file): Call the new accessor where needed.
4. **Game config** (`data/games/fire-in-the-lake/visual-config.yaml`): Add the actual values.

## Common Pitfalls

- **Edge intersection for new shapes**: If you add polygon-based provinces, the adjacency renderer's edge point calculation must handle arbitrary polygons. Without this, adjacency lines will connect to wrong points or pass through the shape interior.
- **Token positioning**: Tokens are positioned relative to zone center and dimensions. If province shapes change from rectangles to irregular polygons, ensure tokens still render inside the shape. Token layout may need a bounding-box or centroid-based approach.
- **Label positioning**: Zone labels are positioned at the zone center. If shapes become irregular, the center of the bounding box may not be inside the shape (concave polygons). Use the centroid or a point-in-polygon check.
- **Map editor sync**: `drawZoneShape()` is shared, but the map editor has its own stroke colors and interaction handlers. Test both flows after shape changes.
- **Visual config backward compatibility**: Other games (Texas Hold'em) also use visual-config. New schema fields must be optional so other games don't break. Test with `pnpm turbo typecheck` to catch schema issues.
- **PixiJS Graphics API**: PixiJS 8 uses `Graphics.poly(points)` for arbitrary polygons where `points` is a flat array `[x1,y1, x2,y2, ...]`. Ensure the polygon is closed (first point = last point) or use `closePath()`.

## Scope Constraints

- Do not modify engine code (`packages/engine/`) — Foundation #3 (Visual Separation)
- Do not change game logic or GameSpecDoc YAML — Foundation #1 (Engine Agnosticism)
- All rendering changes must be in runner source (`packages/runner/src/`) or visual config (`data/games/*/visual-config.yaml`)
- Follow the plan's implementation steps — don't scope-creep beyond what was planned
- If you discover the plan is wrong or incomplete, apply the 1-3-1 rule rather than improvising
- The proposed changes should align with `docs/FOUNDATIONS.md`
