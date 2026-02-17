# PIXIFOUND-004: Position Store with Placeholder Grid Layout
**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D12
**Priority**: P0
**Depends on**: PIXIFOUND-002
**Blocks**: PIXIFOUND-008, PIXIFOUND-009, PIXIFOUND-011

---

## Objective

Create a reactive position store that decouples zone positioning from rendering. Include a placeholder grid layout that arranges zones in a grid based on array index. This store is consumed by zone and adjacency renderers, and later replaced by Spec 41's ForceAtlas2 layout.

The implementation should prioritize clean long-term architecture: explicit factory-created store instances (no module-level singleton mutable state), deterministic pure layout computation, and a stable subscription contract for later canvas-updater wiring.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/position-store.ts` — `ZonePositionMap` type, `computeGridLayout()` function, and store factory

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

### Current-code assumptions (reassessed)

- `Position` already exists at `packages/runner/src/canvas/renderers/renderer-types.ts` (from PIXIFOUND-002) and must be reused.
- No position store implementation currently exists in `packages/runner/src/canvas/`.
- Runner tests use Vitest (`pnpm -F @ludoforge/runner test`) with Node environment.
- No current consumer depends on a singleton position store instance, so factory-based construction is safe and cleaner.

### ZonePositionMap interfaces

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

export interface PositionStoreSnapshot extends ZonePositionMap {
  readonly zoneIDs: readonly string[];
}
```

### Placeholder grid layout

`computeGridLayout(zoneIDs: readonly string[]): ZonePositionMap`

- Compute grid columns as `Math.ceil(Math.sqrt(zoneIDs.length))`.
- Cell size scales with `Math.sqrt(zoneCount)` (Spec 38), with a deterministic margin. Do not hardcode a fixed cell size contract in tests.
- Each zone gets a position based on `(index % cols, Math.floor(index / cols))` scaled by cell+margin.
- Bounds computed from min/max of all positions plus zone size padding.

### Reactive store

Expose as an explicit store factory with a simple subscribe pattern so the canvas updater (PIXIFOUND-011) can subscribe to position changes independently of RenderModel changes.

```typescript
export interface PositionStore {
  getSnapshot(): PositionStoreSnapshot;
  setZoneIDs(zoneIDs: readonly string[]): void;
  setPositions(next: ZonePositionMap, zoneIDs?: readonly string[]): void;
  subscribe(listener: (snapshot: PositionStoreSnapshot) => void): () => void;
}

export function createPositionStore(
  initialZoneIDs?: readonly string[],
): PositionStore;
```

Notes:
- `setZoneIDs()` computes placeholder grid layout and updates the snapshot.
- `setPositions()` allows future Spec 41 layout writers to publish custom positions without changing store wiring.
- Repeated writes with visually identical deterministic snapshots should not trigger duplicate notifications.

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
- Subscribers are not notified when `setZoneIDs()` receives the same ordered IDs and produces no snapshot change.
- `setPositions()` can inject a replacement layout (future Spec 41 handoff) while preserving deterministic snapshots.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `Position` type imported from `renderer-types.ts` (PIXIFOUND-002).
- Layout is fully deterministic — same input always produces same output.
- No PixiJS imports — this is pure logic with a reactive wrapper.
- Store is subscribable for the canvas-updater to use later.
- No module-level mutable singleton position state; use explicit `createPositionStore()` instances.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/position-store.ts` with:
    - Deterministic `computeGridLayout(zoneIDs)` using `sqrt(zoneCount)`-scaled spacing.
    - `createPositionStore()` factory and typed subscribe/get/set APIs.
    - Explicit `setPositions()` hook for future Spec 41 layout writer replacement.
  - Added `packages/runner/test/canvas/position-store.test.ts` with coverage for layout shape, bounds, determinism, subscription notifications, no-op duplicate writes, and injected-layout updates.
- **Deviation from original ticket draft**:
  - Replaced the “fixed cell size” assumption with Spec 38-aligned `sqrt(zoneCount)` scaling.
  - Chose explicit factory store instances instead of module-level singleton mutable state for cleaner multi-canvas extensibility.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
