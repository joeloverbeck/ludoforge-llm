# 86ADJLINRED-005: Hover Highlight for Dashed Adjacency Lines

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/86ADJLINRED/86ADJLINRED-003.md

## Problem

After restyling adjacency lines to dashed white edge-to-edge lines (86ADJLINRED-003), the highlight state needs updated visual parameters. The existing highlight data flow (`RunnerAdjacency.isHighlighted` → `PresentationAdjacencyNode.isHighlighted` → `drawAdjacencyLine()`) is already correct — only the style values need updating.

## Assumption Reassessment (2026-03-27)

1. `resolveEdgeStyle()` in `visual-config-provider.ts` applies highlight overrides at lines 352-358: hardcoded `{ color: '#93c5fd', width: 3, alpha: 0.7 }`, then applies `this.config?.edges?.highlighted` on top — confirmed.
2. The `adjacency-renderer.ts` already calls `resolveEdgeStyle(category, isHighlighted)` and passes the result as stroke style — confirmed. The highlight data flow is intact.
3. After 86ADJLINRED-003, `drawAdjacencyLine()` will use `drawDashedLine()` — the highlight state needs to change dash pattern parameters (wider dashes, narrower gaps) in addition to stroke style.

## Architecture Check

1. This is a style constant update + parameter threading. No new architecture — the existing highlight flow is preserved (Foundation 10: Architectural Completeness — the existing flow is already complete).
2. Game-agnostic: highlight styles are defaults that any game can override via `edges.highlighted` in visual config (Foundation 3: Visual Separation).
3. No backwards compatibility — old highlight colors are replaced (Foundation 9).

## What to Change

### 1. Update Highlight Defaults in `visual-config-provider.ts`

Change the hardcoded highlight overrides in `resolveEdgeStyle()`:

```typescript
// Before:
if (isHighlighted) {
  applyEdgeStyle(resolved, {
    color: '#93c5fd',
    width: 3,
    alpha: 0.7,
  });
}

// After:
if (isHighlighted) {
  applyEdgeStyle(resolved, {
    color: '#ffffff',
    width: 3,
    alpha: 0.85,
  });
}
```

### 2. Thread Dash Parameters Through Highlight State in `adjacency-renderer.ts`

The `drawAdjacencyLine()` function (after 86ADJLINRED-003) calls `drawDashedLine()` with `dashLength` and `gapLength`. These should vary by highlight state:

- **Normal**: `dashLength = 6`, `gapLength = 4`
- **Highlighted**: `dashLength = 8`, `gapLength = 3`

Add these as constants or derive them from the `isHighlighted` boolean in the draw function. The dash parameters are local to the renderer — they do not need to flow through `VisualConfigProvider` (keeping it simple).

### 3. Update FITL `visual-config.yaml` Highlighted Edge Style (if overriding)

If the FITL visual config has an `edges.highlighted` section, update it to match:

```yaml
edges:
  highlighted:
    color: "#ffffff"
    width: 3
    alpha: 0.85
```

## Files to Touch

- `packages/runner/src/config/visual-config-provider.ts` (modify — update highlighted edge style defaults)
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` (modify — vary dash/gap by highlight state)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify — update `edges.highlighted` if present)

## Out of Scope

- Dashed line utility (86ADJLINRED-002)
- Edge clipping logic (86ADJLINRED-003)
- Spur line rendering (86ADJLINRED-004)
- Connection route highlight behavior — this ticket only covers adjacency lines
- Adding new highlight states beyond normal/highlighted
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. **Updated unit test**: `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`
   - When `isHighlighted = false`: `drawDashedLine` is called with `dashLength=6`, `gapLength=4`
   - When `isHighlighted = true`: `drawDashedLine` is called with `dashLength=8`, `gapLength=3`
2. **Updated unit test**: `packages/runner/test/config/visual-config-provider.test.ts` (if exists)
   - `resolveEdgeStyle(null, true)` returns `{ color: '#ffffff', width: 3, alpha: 0.85 }`
   - `resolveEdgeStyle(null, false)` returns `{ color: '#ffffff', width: 2, alpha: 0.6 }`
3. Runner lint: `pnpm -F @ludoforge/runner lint`
4. Runner typecheck: `pnpm -F @ludoforge/runner typecheck`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Highlighted adjacency lines are visually distinct from normal ones — brighter, thicker, tighter dash pattern
2. Highlight data flow is unchanged: `RunnerAdjacency.isHighlighted` → `PresentationAdjacencyNode.isHighlighted` → `drawAdjacencyLine()` — no new plumbing
3. Default highlight style is white (#ffffff), 3px, alpha 0.85 — matching spec
4. Dash parameters (6/4 normal, 8/3 highlighted) are constants in the renderer, not in visual config (keeping it simple)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts` — verify dash/gap parameters vary by highlight state
2. `packages/runner/test/config/visual-config-provider.test.ts` — verify resolved highlight style values

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

### Visual Verification

1. `pnpm -F @ludoforge/runner dev` → load FITL game
2. Hover a zone → confirm adjacent dashed lines become brighter, thicker, with tighter dash pattern
3. Un-hover → confirm lines return to normal style
4. Hover multiple zones in succession → confirm smooth transitions
