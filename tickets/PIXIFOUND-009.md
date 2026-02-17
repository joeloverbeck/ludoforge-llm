# PIXIFOUND-009: Adjacency Connection Renderer

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D5
**Priority**: P0
**Depends on**: PIXIFOUND-002, PIXIFOUND-004
**Blocks**: PIXIFOUND-011

---

## Objective

Implement the `AdjacencyRenderer` that renders `RenderAdjacency[]` as lines between zone centers using per-pair Graphics objects (not a single Graphics cleared each update). Supports incremental add/remove/update of adjacency lines.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/adjacency-renderer.ts` — `createAdjacencyRenderer()` factory

### New test files
- `packages/runner/test/canvas/renderers/adjacency-renderer.test.ts`

---

## Out of Scope

- Do NOT implement zone or token renderers — those are PIXIFOUND-008/010.
- Do NOT implement the canvas-updater subscription wiring — that is PIXIFOUND-011.
- Do NOT implement highlighted adjacency paths for valid movement — highlight state is a property on `RenderAdjacency`; rendering it here is fine, but actual game logic determining which paths to highlight is out of scope.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify `renderer-types.ts`, `position-store.ts`, or any other PIXIFOUND file.

---

## Implementation Details

### Factory

```typescript
export function createAdjacencyRenderer(
  parentContainer: Container,
): AdjacencyRenderer;
```

### Per-pair Graphics objects

- Internal `Map<string, Graphics>` keyed by sorted pair `${from}:${to}` (alphabetical sort ensures `a:b === b:a`).
- On each `update()`:
  - New pairs: create `Graphics`, draw line from `positions.get(from)` to `positions.get(to)`, add to map and parent.
  - Removed pairs: destroy `Graphics`, remove from parent and map.
  - Existing pairs: update line endpoints if positions changed. Update visual style if highlight state changed.
- No `graphics.clear()` + full redraw pattern — incremental updates only.

### Default line style

- Semi-transparent (alpha ~0.3), thin (lineWidth ~1.5), muted gray color.
- Highlighted state: thicker (lineWidth ~3), brighter, higher alpha (~0.7) — for showing valid movement paths.

---

## Acceptance Criteria

### Tests that must pass

**`adjacency-renderer.test.ts`** (mock PixiJS Container/Graphics):
- `update()` with empty array creates no Graphics objects.
- `update()` with 2 adjacencies creates 2 Graphics in the map.
- Pair key is sorted: `('b', 'a')` and `('a', 'b')` produce the same key `'a:b'`.
- Second `update()` removing a pair: Graphics destroyed, removed from parent and map.
- Second `update()` adding a new pair: new Graphics created and added.
- Existing pairs: line endpoints update when positions change.
- Pairs with missing zone positions (zone not in position map) are skipped without error.
- `destroy()` destroys all Graphics, removes from parent, clears map.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Implements `AdjacencyRenderer` interface from `renderer-types.ts`.
- Uses per-pair Graphics objects (not a single Graphics cleared each frame).
- Pair key normalization ensures no duplicate lines for bidirectional adjacency.
- No game-specific logic — purely driven by `RenderAdjacency[]` and position data.
