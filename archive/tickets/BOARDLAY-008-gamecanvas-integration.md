# BOARDLAY-008: GameCanvas Integration — Layout-Driven Position Store

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No
**Deps**: BOARDLAY-007 (getOrComputeLayout unified entry point)

## Problem

The layout engine (BOARDLAY-001 through -007) produces zone positions but nothing wires them into the rendering pipeline. Currently, `createGameCanvasRuntime()` in `GameCanvas.tsx` subscribes to zone ID changes and calls `positionStore.setZoneIDs()`, which triggers `computeGridLayout()` (a simple square grid). When a GameDef is available with layout data, the runtime should instead call `getOrComputeLayout(def)` and pass the computed positions to `positionStore.setPositions()`.

This ticket must establish one clear precedence rule: **layout-derived positions win whenever `gameDef` is present**; the grid path is fallback-only for `gameDef === null`.

## What to Change

**Files (expected)**:
- `packages/runner/src/canvas/GameCanvas.tsx` — modify `createGameCanvasRuntime()` to use layout engine
- `packages/runner/test/canvas/GameCanvas.test.ts` — update/add integration tests (if existing test file covers runtime creation; otherwise create test for the wiring)

### Integration Steps

1. **Add `gameDef` subscription** in `createGameCanvasRuntime()`:
   - Subscribe to `state.gameDef` changes using the existing `selectorStore.subscribe()` pattern.
   - When `gameDef` is non-null, call `getOrComputeLayout(gameDef)`.
   - Call `positionStore.setPositions(result.positionMap, gameDef.zones.map((zone) => zone.id))` with merged board+aux positions.

2. **Modify initial position computation**:
   - On runtime creation, if initial store state has a `gameDef`, immediately compute layout and call `setPositions()`.
   - Only call `setZoneIDs(initialZoneIDs)` when initial `gameDef` is null.

3. **Preserve fallback behavior without overriding layout**:
   - If `gameDef` is null (e.g., during initialization before GameDef loads), keep the existing `setZoneIDs()` → `computeGridLayout()` fallback.
   - Keep the zone-ID subscription, but guard it: only call `setZoneIDs()` while `selectorStore.getState().gameDef === null`.
   - When `gameDef` becomes null again (session reset/error), re-apply fallback from current `selectZoneIDs(state)`.

4. **Cache lifecycle**:
   - Do not clear layout cache in `GameCanvasRuntime.destroy()`. Destroying/remounting canvas should not discard per-`GameDef` cached layouts.
   - `getOrComputeLayout()` cache keying already handles recompute on meaningful `GameDef` changes.
   - Any cache eviction policy changes are out of scope for this ticket.

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
4. **Fallback does not override active layout**: While `gameDef` is non-null, zone-ID subscription updates do not call `setZoneIDs()`.
5. **Destroy unsubscribes gameDef listener**: No layout recomputation after destroy.
6. **All existing GameCanvas tests pass**: No regression in canvas initialization, zone rendering, token rendering, adjacency rendering, or interaction handling.

### Invariants

1. `computeGridLayout()` in `position-store.ts` is NOT modified — it remains the store's internal fallback.
2. `canvas-updater.ts` is NOT modified — it already reacts to position store changes.
3. `viewport-setup.ts` is NOT modified — `updateWorldBounds()` is already triggered by canvas-updater.
4. The layout subscription uses the same `selectorStore.subscribe()` pattern as existing subscriptions (zone IDs, factions, token types).
5. The `destroy()` method properly cleans up the new subscription.
6. Runtime code does not call `clearLayoutCache()` during destroy/remount flows.
7. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.
8. All existing runner tests remain green.

## Outcome

- **Completed**: 2026-02-19
- **What changed**:
  - `createGameCanvasRuntime()` now applies layout-engine positions from `getOrComputeLayout(gameDef)` when `gameDef` is present.
  - Initial runtime bootstrap now prefers layout positions (when `gameDef` exists) instead of defaulting to grid.
  - Zone-ID subscription is now explicitly fallback-only and does not override active layout positions.
  - Added `gameDef` subscription cleanup in `destroy()`.
  - Added/updated `GameCanvas` tests for layout wiring, fallback gating, gameDef change behavior, and listener teardown.
- **Deviation from original plan**:
  - Did **not** clear layout cache on `runtime.destroy()`. Cache lifecycle remains owned by layout-cache semantics; destroy/remount no longer forces cache eviction.
  - Added a defensive guard for malformed/partial `gameDef` values missing `zones` to avoid runtime crashes in fallback scenarios.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm turbo build` passed.
