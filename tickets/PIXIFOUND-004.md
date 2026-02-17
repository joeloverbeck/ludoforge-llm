# PIXIFOUND-004: Position Store with Placeholder Grid Layout

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D12
**Priority**: P0
**Depends on**: PIXIFOUND-002
**Blocks**: PIXIFOUND-008, PIXIFOUND-009, PIXIFOUND-011

---

## Objective

Create a reactive position store that decouples zone positioning from rendering. Include a placeholder grid layout that arranges zones in a grid based on array index. This store is consumed by zone and adjacency renderers, and later replaced by Spec 41's ForceAtlas2 layout.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/position-store.ts` — `ZonePositionMap` type, position store (Zustand atom or EventTarget), `computeGridLayout()` function

### New test files
- `packages/runner/test/canvas/position-store.test.ts`

---

## Out of Scope

- Do NOT implement ForceAtlas2 or any graph-based layout — that is Spec 41.
- Do NOT create any PixiJS application or rendering code.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT create or modify `canvas-updater.ts` — that is PIXIFOUND-011.

---

## Implementation Details

### ZonePositionMap interface

```typescript
export interface ZonePositionMap {
  readonly positions: ReadonlyMap<string, Position>;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}
```

### Placeholder grid layout

`computeGridLayout(zoneIDs: readonly string[]): ZonePositionMap`

- Compute grid columns as `Math.ceil(Math.sqrt(zoneIDs.length))`.
- Cell size: fixed constant (e.g., 160px) with margin (e.g., 40px).
- Each zone gets a position based on `(index % cols, Math.floor(index / cols))` scaled by cell+margin.
- Bounds computed from min/max of all positions plus zone size padding.

### Reactive store

Expose as a Zustand vanilla store (or simple EventTarget with `subscribe()` pattern) so the canvas updater (PIXIFOUND-011) can subscribe to position changes independently of RenderModel changes.

---

## Acceptance Criteria

### Tests that must pass

**`position-store.test.ts`**:
- `computeGridLayout([])` returns empty positions map and zero-area bounds.
- `computeGridLayout(['a'])` returns one position at origin-area.
- `computeGridLayout(['a', 'b', 'c', 'd'])` returns 4 positions in a 2x2 grid.
- All positions are non-overlapping (no two zones share the same x,y).
- Bounds enclose all zone positions with padding.
- Grid columns equal `Math.ceil(Math.sqrt(n))` for various `n` values (1, 4, 5, 9, 10, 25).
- Position store fires subscription callbacks when layout is updated.
- Repeated calls with same zone IDs produce identical positions (deterministic).

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `Position` type imported from `renderer-types.ts` (PIXIFOUND-002).
- Layout is fully deterministic — same input always produces same output.
- No PixiJS imports — this is pure logic with a reactive wrapper.
- Store is subscribable for the canvas-updater to use later.
