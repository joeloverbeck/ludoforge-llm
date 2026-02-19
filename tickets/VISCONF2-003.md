# VISCONF2-003: Edge/Adjacency Styling

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only change
**Deps**: None

## Problem

Adjacency lines are hardcoded with two fixed styles in `packages/runner/src/canvas/renderers/adjacency-renderer.ts:7-17`:

```typescript
const DEFAULT_LINE_STYLE = {
  color: 0x6b7280,
  width: 1.5,
  alpha: 0.3,
} as const;

const HIGHLIGHTED_LINE_STYLE = {
  color: 0x93c5fd,
  width: 3,
  alpha: 0.7,
} as const;
```

There is no way for a visual config to style edges differently (e.g., highways vs. rivers in FITL, or different edge types in other games). The `VisualConfig` schema has no `edges` section.

## What to Change

### 1. Add `edges` section to visual config schema

**File**: `packages/runner/src/config/visual-config-types.ts`

Add new schemas:

```typescript
const EdgeVisualStyleSchema = z.object({
  color: z.string().optional(),
  width: z.number().optional(),
  alpha: z.number().optional(),
  dash: z.array(z.number()).optional(),  // [dashLength, gapLength] for dashed lines
});

const EdgesConfigSchema = z.object({
  default: EdgeVisualStyleSchema.optional(),
  highlighted: EdgeVisualStyleSchema.optional(),
  categoryStyles: z.record(z.string(), EdgeVisualStyleSchema).optional(),
});
```

Add `edges: EdgesConfigSchema.optional()` to `VisualConfigSchema` (line 148-158).

Export types: `EdgeVisualStyle`, `EdgesConfig`.

### 2. Add `resolveEdgeStyle()` to provider

**File**: `packages/runner/src/config/visual-config-provider.ts`

Add new interface and method:

```typescript
export interface ResolvedEdgeVisual {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
  readonly dash: readonly number[] | null;
}
```

Add `resolveEdgeStyle(edgeCategory: string | null, isHighlighted: boolean): ResolvedEdgeVisual` to `VisualConfigProvider`:
- Layer: hardcoded defaults → `edges.default` → `edges.categoryStyles[category]` → `edges.highlighted` (if highlighted)
- Parse colors via `parseHexColor()` from `shape-utils.ts`

### 3. Extend RenderAdjacency with category

**File**: `packages/runner/src/model/render-model.ts`

In `RenderAdjacency` interface (line 51-55):
- Add `readonly category: string | null;`

**File**: `packages/runner/src/model/derive-render-model.ts` (or wherever adjacency derivation lives):
- Pass adjacency `category` from `GameDef` edge metadata through to `RenderAdjacency`
- Default to `null` when no category exists

### 4. Wire into adjacency renderer

**File**: `packages/runner/src/canvas/renderers/adjacency-renderer.ts`

- Accept `VisualConfigProvider` (or a `resolveEdgeStyle` callback) as a parameter to `createAdjacencyRenderer()`
- In `drawAdjacencyLine()` (line 96-109): replace hardcoded style lookup with `resolveEdgeStyle(adjacency.category, isHighlighted)`
- Remove `DEFAULT_LINE_STYLE` and `HIGHLIGHTED_LINE_STYLE` constants (they become fallback defaults in the provider)

### 5. Add FITL edge categories to visual config (optional, prep)

**File**: `data/games/fire-in-the-lake/visual-config.yaml`

Add placeholder edges section:

```yaml
edges:
  default:
    color: "#6b7280"
    width: 1.5
    alpha: 0.3
  categoryStyles:
    highway:
      color: "#8b7355"
      width: 2
    mekong:
      color: "#4a7a8c"
      width: 2
      dash: [6, 3]
```

## Invariants

1. When no `edges` config exists, adjacency rendering must look identical to current behavior (same colors, widths, alphas).
2. `resolveEdgeStyle()` must always return a complete `ResolvedEdgeVisual` (no undefined fields).
3. Highlighted style overrides category style (highlighted is the top priority layer).
4. `dash: null` means solid line (no dashing).
5. `RenderAdjacency.category` defaults to `null` for backward compatibility.
6. Existing visual config YAML files without `edges` must still parse.

## Tests

1. **Unit — EdgesConfigSchema parsing**: Parse a config with `default`, `highlighted`, and `categoryStyles`, verify all fields present.
2. **Unit — EdgesConfigSchema optional**: Parse a config without `edges`, verify it succeeds.
3. **Unit — resolveEdgeStyle default fallback**: With no config, verify result matches current hardcoded `DEFAULT_LINE_STYLE` values.
4. **Unit — resolveEdgeStyle highlighted fallback**: With no config + `isHighlighted=true`, verify result matches current `HIGHLIGHTED_LINE_STYLE` values.
5. **Unit — resolveEdgeStyle category override**: With a `categoryStyles.highway` config, verify highway edges use the configured color/width.
6. **Unit — resolveEdgeStyle highlighted overrides category**: With both category and highlighted configs, verify highlighted values take priority.
7. **Unit — dash defaults to null**: When no `dash` is specified, verify `ResolvedEdgeVisual.dash` is `null`.
8. **Integration — FITL visual config loads with edges**: Load FITL visual config YAML with new `edges` section, verify it parses without errors.
9. **Regression**: Existing adjacency renderer tests still pass.
