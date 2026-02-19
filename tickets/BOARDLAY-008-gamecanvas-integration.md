# BOARDLAY-008: GameCanvas Integration — Layout-Driven Position Store

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-007 (getOrComputeLayout unified entry point)

## Problem

The layout engine (BOARDLAY-001 through -007) produces zone positions but nothing wires them into the rendering pipeline. Currently, `createGameCanvasRuntime()` in `GameCanvas.tsx` subscribes to zone ID changes and calls `positionStore.setZoneIDs()`, which triggers `computeGridLayout()` (a simple square grid). When a GameDef is available with layout data, the runtime should instead call `getOrComputeLayout(def)` and pass the computed positions to `positionStore.setPositions()`.

This is the final integration ticket: it connects the layout engine to the existing canvas pipeline.

## What to Change

**Files (expected)**:
- `packages/runner/src/canvas/GameCanvas.tsx` — modify `createGameCanvasRuntime()` to use layout engine
- `packages/runner/test/canvas/GameCanvas.test.ts` — update/add integration tests (if existing test file covers runtime creation; otherwise create test for the wiring)

### Integration Steps

1. **Add `gameDef` subscription** in `createGameCanvasRuntime()`:
   - Subscribe to `state.gameDef` changes using the existing `selectorStore.subscribe()` pattern.
   - When `gameDef` is non-null, call `getOrComputeLayout(gameDef)`.
   - Call `positionStore.setPositions(result.positionMap, allZoneIDs)` with the merged layout positions.

2. **Modify initial position computation**:
   - On runtime creation, if the initial store state has a `gameDef`, immediately compute layout and call `setPositions()` instead of relying on `computeGridLayout()` from `setZoneIDs()`.

3. **Preserve fallback behavior**:
   - If `gameDef` is null (e.g., during initialization before GameDef loads), keep the existing `setZoneIDs()` → `computeGridLayout()` fallback.
   - The existing `unsubscribeZoneIDs` subscription remains as a safety net for edge cases where GameDef is not available.

4. **Cache clearing on game change**:
   - When a new `gameDef` with a different ID arrives, `getOrComputeLayout()` handles caching automatically (returns cached result for same ID, computes for new ID).
   - Call `clearLayoutCache()` in the `destroy()` method to prevent stale cache entries from leaking across game sessions.

5. **Cleanup**: Add `unsubscribeGameDef()` call in the `destroy()` method alongside the other unsubscribe calls.

### Expected Behavior Change

| Scenario | Before (grid fallback) | After (layout engine) |
|----------|----------------------|----------------------|
| FITL loaded | All ~58 zones in square grid | Board zones (~47) in force-directed map, aux zones (~11) in sidebar |
| Texas Hold'em loaded | All zones in square grid | Zones in circle/table arrangement |
| No GameDef yet | Square grid from renderModel zone IDs | Same (fallback preserved) |

## Out of Scope

- Layout algorithm changes (those are frozen in BOARDLAY-003 through -006)
- Layout cache internals (BOARDLAY-007)
- Position store API changes (it already has `setPositions()`)
- Canvas updater changes (it already subscribes to position store — no modifications needed)
- Viewport changes (it already calls `updateWorldBounds()` on position changes)
- Engine package changes
- Zone renderer changes
- Adjacency renderer changes
- Token renderer changes

## Acceptance Criteria

### Specific Tests That Must Pass

1. **Layout-driven positions when GameDef available**: When store has a `gameDef` with zones, `positionStore.setPositions()` is called with layout-computed positions (not grid fallback).
2. **Fallback when no GameDef**: When `gameDef` is null, the existing `setZoneIDs()` → `computeGridLayout()` path still works.
3. **GameDef change triggers re-layout**: When `gameDef` changes (new game loaded), layout is recomputed and position store is updated.
4. **Destroy clears layout cache**: Calling `runtime.destroy()` calls `clearLayoutCache()`.
5. **Destroy unsubscribes gameDef listener**: No layout recomputation after destroy.
6. **All existing GameCanvas tests pass**: No regression in canvas initialization, zone rendering, token rendering, adjacency rendering, or interaction handling.

### Invariants

1. `computeGridLayout()` in `position-store.ts` is NOT modified — it remains the store's internal fallback.
2. `canvas-updater.ts` is NOT modified — it already reacts to position store changes.
3. `viewport-setup.ts` is NOT modified — `updateWorldBounds()` is already triggered by canvas-updater.
4. The layout subscription uses the same `selectorStore.subscribe()` pattern as existing subscriptions (zone IDs, factions, token types).
5. The `destroy()` method properly cleans up the new subscription.
6. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
7. All existing runner tests remain green.
