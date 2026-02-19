# VISCONF2-001: Token Shape Rendering

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only change
**Deps**: None

## Problem

`resolveTokenShape()` at `packages/runner/src/canvas/renderers/token-renderer.ts:338-340` collapses all 10 token shapes down to two outcomes:

```typescript
function resolveTokenShape(shape: TokenShape | undefined): 'circle' | 'card' {
  return shape === 'card' ? 'card' : 'circle';
}
```

The FITL visual config specifies `cube`, `round-disk`, and `cylinder` shapes for different token types, but all render as circles. `drawTokenBase()` at line 316-336 only handles `'circle' | 'card'`.

The `TokenShape` type at `packages/runner/src/config/visual-config-defaults.ts:11-21` declares 10 shapes: `circle`, `square`, `triangle`, `diamond`, `hexagon`, `cylinder`, `meeple`, `card`, `cube`, `round-disk`.

The `cylinder` shape name is misleading for a 2D top-down view. In the COIN-series board game context, these are beveled cylinders (octagonal discs with a bevel rim). Rename to `beveled-cylinder`.

## What to Change

### 1. Rename `cylinder` to `beveled-cylinder`

**Files**:
- `packages/runner/src/config/visual-config-defaults.ts` — `TokenShape` union type
- `packages/runner/src/config/visual-config-types.ts` — `TokenShapeSchema` enum values
- `data/games/fire-in-the-lake/visual-config.yaml` — all `shape: cylinder` entries (us-irregulars, arvn-rangers, nva-guerrillas, vc-guerrillas)

### 2. New module: `packages/runner/src/canvas/renderers/token-shape-drawer.ts`

Create a registry-based shape dispatch module:

- Export `drawTokenShape(graphics, shape, dimensions, fillColor, stroke)` function
- Registry maps each `TokenShape` value to a draw function
- All 10 shapes implemented:
  - `circle` — filled circle (radius = width/2)
  - `square` — filled rounded rect (equal width/height, small corner radius)
  - `triangle` — equilateral triangle polygon pointing up
  - `diamond` — rotated square polygon
  - `hexagon` — 6-sided regular polygon
  - `beveled-cylinder` — octagon (8 sides) with a concentric inner bevel ring at ~80% radius
  - `meeple` — simplified meeple silhouette using poly points (head circle + body trapezoid)
  - `card` — rounded rect with card aspect ratio
  - `cube` — square with a 3D perspective top parallelogram (isometric hint)
  - `round-disk` — circle with a concentric inner ring at ~70% radius for disc appearance

### 3. Wire into token-renderer.ts

- Replace `resolveTokenShape()` (line 338-340) — delete it, return full `TokenShape`
- Replace `drawTokenBase()` (line 316-336) — call `drawTokenShape()` from new module
- Update `resolveTokenDimensions()` (line 342-357) — handle per-shape aspect ratios (card is taller than wide, cube/square are equal, etc.)
- Update type annotations: `'circle' | 'card'` becomes `TokenShape` throughout

### 4. Reuse `buildRegularPolygonPoints()` from shape-utils.ts

`packages/runner/src/canvas/renderers/shape-utils.ts:129-136` already has the polygon builder used by zone shapes. Import and reuse for token hexagon/triangle/diamond/beveled-cylinder.

## Invariants

1. Every value in `TokenShape` must produce a distinct visual shape (no two shapes may render identically).
2. All shapes must be centered at (0, 0).
3. All shapes must respect the `dimensions` parameter for sizing.
4. All shapes must apply both `fill` and `stroke`.
5. The `beveled-cylinder` shape must render as an octagon with a visible inner bevel ring.
6. Existing `circle` and `card` shapes must look identical to current rendering.
7. FITL visual config must parse without errors after `cylinder` → `beveled-cylinder` rename.

## Tests

1. **Unit — shape registry completeness**: Assert every `TokenShape` enum value has a registered draw function in the registry. No missing keys.
2. **Unit — drawTokenShape smoke test**: For each shape, call `drawTokenShape()` with mock Graphics, verify `clear()` + draw calls are made without throwing.
3. **Unit — beveled-cylinder draws octagon + inner ring**: Mock Graphics, call with `beveled-cylinder`, assert both an outer `poly()` (8 points) and an inner `poly()` or `circle()` call.
4. **Unit — cube draws square + parallelogram**: Mock Graphics, call with `cube`, assert at least two `poly()` or `rect()` calls (body + top face).
5. **Unit — round-disk draws two concentric circles**: Mock Graphics, call with `round-disk`, assert two `circle()` calls at different radii.
6. **Unit — resolveTokenDimensions returns correct aspect ratios**: `card` → height > width, `square`/`cube` → width === height, etc.
7. **Integration — FITL visual config loads**: Load FITL visual config YAML, verify `tokenTypes` entries parse with `beveled-cylinder` shape.
8. **Regression**: Existing token renderer tests still pass.
