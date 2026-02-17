# PIXIFOUND-011: Canvas Updater and Zustand Subscription Wiring

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D7 (wiring + animation gating)
**Priority**: P0
**Depends on**: PIXIFOUND-004, PIXIFOUND-006, PIXIFOUND-007, PIXIFOUND-008, PIXIFOUND-009, PIXIFOUND-010
**Blocks**: PIXIFOUND-014

---

## Objective

Wire Zustand store subscriptions to canvas renderers using custom equality comparators. Subscribe to both RenderModel slices and the position store. Implement animation gating: queue state updates while `animationPlaying === true`, apply latest snapshot when animations complete.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/canvas-updater.ts` — `createCanvasUpdater()`, subscription management, animation gating

### New test files
- `packages/runner/test/canvas/canvas-updater.test.ts`

---

## Out of Scope

- Do NOT implement renderers — those are PIXIFOUND-008/009/010 (consumed here as dependencies).
- Do NOT implement the equality comparators — those are PIXIFOUND-007 (imported here).
- Do NOT implement the React mount component — that is PIXIFOUND-014.
- Do NOT implement GSAP animations or effect trace interpretation — that is Spec 40.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify any previously created PIXIFOUND source files.

---

## Implementation Details

### Factory

```typescript
export interface CanvasUpdaterDeps {
  readonly store: StoreApi<GameStore>;
  readonly positionStore: PositionStoreApi;
  readonly zoneRenderer: ZoneRenderer;
  readonly adjacencyRenderer: AdjacencyRenderer;
  readonly tokenRenderer: TokenRenderer;
  readonly viewport: ViewportResult;
}

export interface CanvasUpdater {
  /** Start all subscriptions. */
  start(): void;
  /** Unsubscribe all. Returns void for teardown ordering. */
  destroy(): void;
}

export function createCanvasUpdater(deps: CanvasUpdaterDeps): CanvasUpdater;
```

### Subscription strategy

On `start()`:
1. Subscribe to `store` for `renderModel.zones` changes using `zonesVisuallyEqual`.
2. Subscribe to `store` for `renderModel.tokens` changes using `tokensVisuallyEqual`.
3. Subscribe to `store` for `renderModel.adjacencies` changes using `adjacenciesVisuallyEqual`.
4. Subscribe to `positionStore` for position changes.
5. When both zones + positions are available, call `zoneRenderer.update()`, then `adjacencyRenderer.update()`, then `tokenRenderer.update()`.
6. When positions change, also call `viewport.updateWorldBounds()`.

### Animation gating

- Subscribe to `store.animationPlaying`.
- When `animationPlaying === true`: incoming RenderModel snapshots are queued (keep only latest).
- When `animationPlaying` transitions to `false`: apply the latest queued snapshot as a single batch update.
- This prevents tokens from snapping to final positions mid-animation.

### Cleanup

`destroy()` unsubscribes all listeners. Must be called before renderer `destroy()` calls.

---

## Acceptance Criteria

### Tests that must pass

**`canvas-updater.test.ts`** (mock store, mock renderers, mock position store):
- `start()` subscribes to store and position store.
- Zone renderer `update()` called when `renderModel.zones` changes (equality check fails).
- Zone renderer `update()` NOT called when zones are visually equal.
- Token renderer `update()` called when tokens change.
- Adjacency renderer `update()` called when adjacencies change.
- Renderers receive position data from position store.
- Viewport `updateWorldBounds()` called when positions change.
- **Animation gating**: when `animationPlaying === true`, renderer updates are NOT called.
- **Animation gating**: when `animationPlaying` transitions to `false`, latest queued snapshot is applied.
- **Animation gating**: only the LATEST queued snapshot is applied (intermediate snapshots discarded).
- `destroy()` unsubscribes all listeners (subsequent store changes don't trigger updates).

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Subscriptions use custom equality comparators (not shallow equality).
- Animation gating queues only the latest snapshot (no unbounded growth).
- `destroy()` MUST be called before renderer `destroy()` — teardown ordering is enforced by PIXIFOUND-014.
- No game-specific logic.
