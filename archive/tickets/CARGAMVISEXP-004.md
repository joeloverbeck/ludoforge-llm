# CARGAMVISEXP-004: Table background ("felt")

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: CARGAMVISEXP-003 (uses table layout board bounds)

## Problem

The canvas currently has no visual table surface behind table-laid-out zones. Card games need a felt-like surface behind table zones to establish the play area.

## Assumption Reassessment (2026-02-20)

1. `LayoutConfigSchema` in `packages/runner/src/config/visual-config-types.ts` currently has `mode` and `hints` (not `regionHints`). `tableBackground` does not exist yet.
2. `LayerHierarchy` in `packages/runner/src/canvas/layers.ts` currently has `boardGroup`, `adjacencyLayer`, and `zoneLayer` but no dedicated background layer.
3. `createGameCanvasRuntime()` in `packages/runner/src/canvas/GameCanvas.tsx` computes layout from `getOrComputeLayout()` and updates `positionStore`, but does not render a table background.
4. `getOrComputeLayout()` currently returns unified zone bounds through `positionMap.bounds`; it does not expose board-only bounds for table surface sizing.
5. Texas Hold'em `data/games/texas-holdem/visual-config.yaml` is already on `layout.mode: table` and currently has no `layout.tableBackground` section.
6. D1-D3 work from `specs/43-card-game-visual-experience.md` is already implemented (token defaults, card field mapping/color/symbol, card-role table promotion/placement). This ticket should only deliver D4.

## Architecture Reassessment

1. A table background belongs in generic runner visual config (`layout.tableBackground`) and should remain game-agnostic.
2. Background rendering should be isolated in a dedicated renderer and drawn on a dedicated background container inside `boardGroup`, ordered before adjacency/zones.
3. Sizing must use board-only bounds (table play area), not unified bounds including aux sidebar zones.
4. To keep architecture clean and extensible, `layout-cache` should expose `boardBounds` explicitly in its result instead of recomputing bounds ad hoc in multiple callers.
5. Keep config contract strict and singular: introduce `tableBackground` once under `layout`; do not add aliases/legacy fallback keys.

## Scope (Updated)

### 1. Extend visual config schema with table background

In `packages/runner/src/config/visual-config-types.ts`:

- Add `TableBackgroundSchema`:

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

- Add `tableBackground: TableBackgroundSchema.optional()` to `LayoutConfigSchema`.
- Export `TableBackgroundConfig` type.

### 2. Expose table background config from provider

In `packages/runner/src/config/visual-config-provider.ts`:

- Add `getTableBackground(): TableBackgroundConfig | null` returning `config?.layout?.tableBackground ?? null`.

### 3. Add dedicated background layer

In `packages/runner/src/canvas/layers.ts`:

- Add `backgroundLayer: Container` to `LayerHierarchy`.
- Create and configure `backgroundLayer` as non-interactive.
- Add it as the first child of `boardGroup` before adjacency and zone layers.

### 4. Add table background renderer

Create `packages/runner/src/canvas/renderers/table-background-renderer.ts`:

- Export `drawTableBackground(container, background, bounds)`.
- Clear prior graphics before drawing.
- Draw one shape sized from bounds + padding.
- Defaults:
  - `color`: `#0a5c2e`
  - `shape`: `ellipse`
  - `paddingX`: `80`
  - `paddingY`: `60`
  - `borderWidth`: `0`

### 5. Expose board bounds from layout cache and wire renderer in GameCanvas

In `packages/runner/src/layout/layout-cache.ts`:

- Extend `FullLayoutResult` with `boardBounds` from the board layout result.

In `packages/runner/src/canvas/GameCanvas.tsx`:

- On layout application, draw/update background using:
  - `layers.backgroundLayer`
  - `visualConfigProvider.getTableBackground()`
  - `layoutResult.boardBounds`
- Clear background layer when no `gameDef` is active.

### 6. Update Texas Hold'em visual config

In `data/games/texas-holdem/visual-config.yaml` add:

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
- `packages/runner/src/layout/layout-cache.ts` (modify)
- `packages/runner/test/canvas/renderers/table-background-renderer.test.ts` (new)
- `packages/runner/test/canvas/layers.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Token type matching / template rendering (D1, D2)
- Zone promotion / role-based table placement (D3)
- Table overlays (D5)
- Hand panel UI (D6)
- Engine/kernel/compiler changes
- FITL visual config changes (non-table game)

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/canvas/renderers/table-background-renderer.test.ts`:
   - ellipse default draw
   - rectangle draw
   - rounded rectangle draw
   - bounds padding applied
   - border style applied when configured
   - clear-before-redraw behavior
2. `packages/runner/test/canvas/layers.test.ts` verifies background layer is first child in `boardGroup`.
3. `packages/runner/test/canvas/GameCanvas.test.ts` verifies runtime draws background using layout `boardBounds` and clears when `gameDef` is null.
4. `packages/runner/test/config/visual-config-provider.test.ts` verifies `getTableBackground()` returns config or null.
5. `packages/runner/test/config/visual-config-files.test.ts` verifies Texas visual config contains expected `layout.tableBackground` values.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Games without `layout.tableBackground` render no table background (no regressions).
2. Background is always behind adjacency, zones, and tokens.
3. Background is in world space (pans/zooms with viewport).
4. No engine/kernel/compiler code is modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/table-background-renderer.test.ts` (new)
2. `packages/runner/test/canvas/layers.test.ts` (modified)
3. `packages/runner/test/canvas/GameCanvas.test.ts` (modified)
4. `packages/runner/test/config/visual-config-provider.test.ts` (modified)
5. `packages/runner/test/config/visual-config-files.test.ts` (modified)

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/canvas/renderers/table-background-renderer.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- Implemented changes:
  - Added `layout.tableBackground` schema + provider accessor.
  - Added dedicated `backgroundLayer` as first child of `boardGroup`.
  - Added `table-background-renderer.ts` with ellipse/rectangle/rounded-rect drawing, defaults, border support, and clear-before-redraw.
  - Extended `layout-cache` result to expose `boardBounds` and wired `GameCanvas` to draw/clear background from board bounds.
  - Updated Texas Hold'em `visual-config.yaml` with felt background settings.
  - Added/updated tests across renderer, layers, GameCanvas runtime, provider, config fixtures, and layout-cache board-bounds separation.
- Deviations from original ticket:
  - Scope was corrected first because D1-D3 from Spec 43 were already implemented; this ticket now strictly delivered D4.
  - Added explicit `boardBounds` exposure in layout cache to avoid recomputing/deriving board extents in multiple places.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
