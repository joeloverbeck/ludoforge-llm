# PIXIFOUND-011: Canvas Updater and Zustand Subscription Wiring

**Status**: ✅ COMPLETED
**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D7 (wiring + animation gating)
**Priority**: P0
**Depends on**: PIXIFOUND-004, PIXIFOUND-006, PIXIFOUND-007, PIXIFOUND-008, PIXIFOUND-009, PIXIFOUND-010
**Blocks**: PIXIFOUND-014

---

## Objective

Wire Zustand store subscriptions to canvas renderers using custom equality comparators. Subscribe to both RenderModel slices and the position store. Implement animation gating: queue state updates while `animationPlaying === true`, apply latest snapshot when animations complete.

## Reassessed Assumptions and Scope Updates

- `PositionStoreApi` does not exist in the current codebase. Use `PositionStore` from `packages/runner/src/canvas/position-store.ts`.
- `GameStore.renderModel` is nullable (`RenderModel | null`) and must be handled explicitly.
- Zone rendering depends on both `zones` and `mapSpaces`; listening to `zones` only can miss valid visual updates. This ticket now includes a dedicated `mapSpaces` subscription/equality gate.
- `canvas-equality.ts` already provides comparators for `zones`, `tokens`, and `adjacencies` (PIXIFOUND-007). This ticket consumes those comparators and defines any missing local comparator logic required for updater wiring.
- Initial sync is required: on `start()`, the updater must hydrate renderer state from current store snapshots, not only future subscription events.

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
  readonly positionStore: PositionStore;
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
1. Subscribe to `store` for a composite canvas snapshot (`zones`, `tokens`, `adjacencies`, `mapSpaces`) with a custom equality function:
   - `zonesVisuallyEqual`
   - `tokensVisuallyEqual`
   - `adjacenciesVisuallyEqual`
   - deterministic map-space comparator
2. Subscribe to `store.animationPlaying`.
3. Subscribe to `positionStore` for position changes.
4. Perform initial sync from `store.getState()` + `positionStore.getSnapshot()` immediately after subscriptions are installed.
5. When RenderModel + positions are available, call `zoneRenderer.update()`, then `adjacencyRenderer.update()`, then `tokenRenderer.update()`.
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
- Zone renderer `update()` called when `mapSpaces` changes.
- Token renderer `update()` called when tokens change.
- Adjacency renderer `update()` called when adjacencies change.
- Renderers receive position data from position store.
- Viewport `updateWorldBounds()` called when positions change.
- `start()` performs initial sync when store snapshot already contains `renderModel`.
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

## Outcome

- **Completion date**: 2026-02-17
- **Implemented**:
  - Added `packages/runner/src/canvas/canvas-updater.ts` with `createCanvasUpdater()` and lifecycle methods (`start`, `destroy`).
  - Wired subscriptions for composite canvas snapshot (`zones`, `tokens`, `adjacencies`, `mapSpaces`), `animationPlaying`, and `positionStore`.
  - Implemented animation gating with latest-snapshot queue semantics.
  - Implemented deterministic map-space comparator inside the updater for zone-overlay correctness.
  - Added tests in `packages/runner/test/canvas/canvas-updater.test.ts` covering subscription wiring, equality gating, map-space updates, animation gating, latest-only queue behavior, position updates, and teardown unsubscribe behavior.
- **Deviation from original ticket text**:
  - Subscription wiring uses a single composite RenderModel selector with custom equality instead of separate per-slice store subscriptions, reducing duplicate redraw churn while preserving custom-comparator behavior.
  - Ticket assumptions were corrected to match the current codebase (`PositionStore` naming, nullable `renderModel`, required `mapSpaces` sensitivity, initial sync requirement).
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
