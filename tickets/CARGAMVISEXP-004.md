# CARGAMVISEXP-004: Table background ("felt")

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-003 (needs board bounds from table layout to size the background)

## Problem

The canvas shows an empty dark background with no visual table surface. Card games need a felt-like table surface behind all zones to establish the play area.

## Assumption Reassessment (2026-02-20)

1. `LayoutConfigSchema` at `visual-config-types.ts:50-53` has `mode` and `regionHints` — confirmed. Does NOT yet have `tableBackground`.
2. `layers.ts` has `boardGroup` in `LayerHierarchy` — confirmed. Does NOT yet have a `backgroundLayer`.
3. `GameCanvas.tsx` exists and wires renderers — confirmed. Does not wire a background renderer.
4. `computeBounds()` exists at `layout-helpers.ts:42` — can be used to compute board extents for background sizing.
5. Texas Hold'em `visual-config.yaml` has `layout.mode: table` — confirmed. No `tableBackground` section.

## Architecture Check

1. `TableBackgroundSchema` is a generic layout config feature — any game using table mode can define a background. Not game-specific.
2. The background renderer is a pure PixiJS Graphics draw — reads config, draws shape, no game logic.
3. Adding `tableBackground` to `LayoutConfigSchema` is optional and backwards-compatible.
4. Background is drawn BEFORE zones in the render order (first child of `boardGroup`), so zones always appear on top.

## What to Change

### 1. Add `TableBackgroundSchema` to visual-config-types.ts

```typescript
const TableBackgroundSchema = z.object({
  color: z.string().optional(),
  shape: z.enum(['ellipse', 'rectangle', 'roundedRect']).optional(),
  paddingX: z.number().optional(),
  paddingY: z.number().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
});
```

Add to `LayoutConfigSchema`: `tableBackground: TableBackgroundSchema.optional()`.

### 2. Add `getTableBackground()` to visual-config-provider.ts

Returns `config?.layout?.tableBackground ?? null`.

### 3. Add `backgroundLayer` to layers.ts

Add a `backgroundLayer: Container` field to `LayerHierarchy`. In `createLayerHierarchy()`, create it and add as first child of `boardGroup`.

### 4. Create `table-background-renderer.ts`

New file in `packages/runner/src/canvas/renderers/`. Exports:
- `drawTableBackground(container, background, bounds)` — clears container, draws a filled shape (ellipse/rectangle/roundedRect) sized to `bounds` + padding. Uses config color, border color, border width.
- Defaults: color `#0a5c2e`, shape `ellipse`, paddingX 80, paddingY 60.

### 5. Wire into GameCanvas.tsx

Import and call `drawTableBackground()` after layout is computed, before zone rendering. Pass `layers.backgroundLayer`, table background config, and computed board bounds.

### 6. Update Texas Hold'em visual-config.yaml

```yaml
layout:
  mode: table
  tableBackground:
    color: "#0a5c2e"
    shape: ellipse
    paddingX: 100
    paddingY: 80
    borderColor: "#4a2c0a"
    borderWidth: 4
```

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/canvas/layers.ts` (modify)
- `packages/runner/src/canvas/renderers/table-background-renderer.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/table-background-renderer.test.ts` (new)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Token type matching or card template rendering — that's CARGAMVISEXP-001/002
- Zone layout positioning or promotion — that's CARGAMVISEXP-003
- Table overlays (pot, bets, dealer) — that's CARGAMVISEXP-005
- Hand panel UI — that's CARGAMVISEXP-006
- Engine/kernel changes of any kind
- FITL visual config changes (FITL uses graph mode, no table background)
- Canvas-updater changes (background is static, drawn once on layout change)

## Acceptance Criteria

### Tests That Must Pass

1. `table-background-renderer.test.ts` — new test: draws ellipse shape when config specifies `shape: ellipse`
2. `table-background-renderer.test.ts` — new test: applies padding to bounds for ellipse sizing
3. `table-background-renderer.test.ts` — new test: draws rectangle when `shape: rectangle`
4. `table-background-renderer.test.ts` — new test: draws rounded rectangle when `shape: roundedRect`
5. `table-background-renderer.test.ts` — new test: uses default values when config fields are omitted
6. `table-background-renderer.test.ts` — new test: draws border with specified color and width
7. `table-background-renderer.test.ts` — new test: clears container before redrawing
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Games without `tableBackground` in their config see no background rendered (no regressions).
2. Background is always behind all zone and token renderers (z-order).
3. Background is in world-space (pans/zooms with the viewport).
4. No engine/kernel/compiler code is modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/table-background-renderer.test.ts` (new) — shape drawing, padding, defaults, border, clear-before-redraw

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/canvas/renderers/table-background-renderer.test.ts`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`
