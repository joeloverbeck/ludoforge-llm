# BOARDLAY-007: Layout Cache and Unified Entry Point

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No
**Deps**: BOARDLAY-003 (computeLayout), BOARDLAY-006 (computeAuxLayout)

## Problem

Layout computation (especially ForceAtlas2) is expensive and should only run once per GameDef. The layout engine needs a caching layer keyed by `GameDef.metadata.id` and a unified entry point that orchestrates the full pipeline: resolve mode → partition zones → compute board layout → compute aux layout → merge positions.

This corresponds to Spec 41 deliverables D3 (caching) and the final assembly of D1+D2+D4.

## Reassessed Assumptions (2026-02-19)

1. `resolveLayoutMode(def)`, `partitionZones(def)`, `computeLayout(def, mode)`, and `computeAuxLayout(aux, boardBounds)` already exist and are covered by existing layout tests.
2. In runner code, `GameDef`/`ZoneDef` types are imported from `@ludoforge/engine/runtime`, not `@ludoforge/engine`.
3. `computeLayout(def, mode)` already handles board-zone selection internally. This ticket must not reimplement layout algorithms; it only composes existing primitives and caches the merged result.
4. `GameCanvas` wiring is explicitly owned by BOARDLAY-008. BOARDLAY-007 ends at a reusable cached API for callers.
5. `GameDef.metadata.id` is required by engine types/schema, so cache keying by ID is architectural and does not need alias/fallback behavior.

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/layout-cache.ts` — create with `getOrComputeLayout()` and `clearLayoutCache()`
- `packages/runner/test/layout/layout-cache.test.ts` — unit tests

### Function Signatures

```typescript
import type { GameDef } from '@ludoforge/engine/runtime';
import type { ZonePositionMap } from '../spatial/position-types';
import type { LayoutMode } from './layout-types';

interface FullLayoutResult {
  readonly positionMap: ZonePositionMap;
  readonly mode: LayoutMode;
}

function getOrComputeLayout(def: GameDef): FullLayoutResult;
function clearLayoutCache(): void;
```

### Pipeline

`getOrComputeLayout(def)`:

1. Check module-level cache `Map<string, FullLayoutResult>` keyed by `def.metadata.id`.
2. If cache hit, return cached result immediately.
3. If cache miss:
   a. `resolveLayoutMode(def)` → mode.
   b. `partitionZones(def)` → `{ board, aux }` (aux list is used for sidebar layout).
   c. `computeLayout(def, mode)` → `LayoutResult` with board positions and bounds.
   d. `computeAuxLayout(aux, boardBounds)` → `AuxLayoutResult` with aux positions.
   e. Merge board + aux positions into a single `Map<string, { x, y }>`.
   f. Compute unified bounding box encompassing both board and aux areas.
   g. Build `ZonePositionMap` (compatible with `positionStore.setPositions()`).
   h. Cache and return.

`clearLayoutCache()`:

1. Clear the module-level cache map.
2. This enables recomputation after a game change (e.g., loading a different GameDef).

### ZonePositionMap Compatibility

The merged output must match the shared `ZonePositionMap` interface from `src/spatial/position-types.ts`:
```typescript
{ positions: ReadonlyMap<string, Position>; bounds: { minX, minY, maxX, maxY } }
```
This ensures `positionStore.setPositions(result.positionMap)` works directly.

## Out of Scope

- Layout algorithm implementations (BOARDLAY-003, -004, -005, -006) — called but not modified
- GameCanvas integration (BOARDLAY-008)
- Engine package changes
- Position store modifications
- LRU eviction or cache size limits (simple map is sufficient; games change infrequently)

## Acceptance Criteria

### Specific Tests That Must Pass

1. **Cache miss computes layout**: First call to `getOrComputeLayout(def)` computes and returns a valid result with positions for all zones.
2. **Cache hit returns same result**: Second call with the same GameDef ID returns the identical object (referential equality).
3. **Different GameDef IDs cache independently**: Two GameDefs with different `metadata.id` values produce independent cache entries.
4. **clearLayoutCache forces recomputation**: After `clearLayoutCache()`, the next call recomputes (verified by checking the result is a new object or by mocking the compute functions).
5. **Merged positions include board and aux zones**: Result `positionMap.positions` contains entries for both board and aux zone IDs.
6. **Unified bounding box**: `positionMap.bounds` encompasses all positions (board + aux).
7. **ZonePositionMap compatibility**: Result `positionMap` can be passed to `positionStore.setPositions()` without type errors.
8. **mode field preserved**: Result `mode` reflects the resolved layout mode.
9. **Empty GameDef**: GameDef with no zones produces empty positions map and zero-area bounds.

### Invariants

1. `getOrComputeLayout()` is idempotent — multiple calls with the same GameDef return the same result (until cache is cleared).
2. The cache is module-level (singleton) — shared across all callers.
3. `clearLayoutCache()` clears ALL entries, not just one.
4. Existing layout algorithm files (`compute-layout.ts`, `aux-zone-layout.ts`, `build-layout-graph.ts`) are not modified by this ticket.
5. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added `packages/runner/src/layout/layout-cache.ts` with:
    - `getOrComputeLayout(def)` cache keyed by `def.metadata.id`
    - unified pipeline orchestration: mode resolution, board layout compute, aux layout compute, merged `ZonePositionMap`, unified bounds
    - `clearLayoutCache()`
  - Added `packages/runner/test/layout/layout-cache.test.ts` covering cache behavior, merge behavior, mode preservation, and empty-input handling.
  - Updated this ticket's assumptions/scope to match current code architecture before implementation.
- **Deviations from original plan**:
  - No functional deviations. The ticket text was corrected first to align with the existing codebase (`@ludoforge/engine/runtime` imports and existing layout primitive ownership) before implementation.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo build`
  - `pnpm turbo lint`
