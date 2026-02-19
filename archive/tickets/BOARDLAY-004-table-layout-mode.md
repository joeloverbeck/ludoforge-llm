# BOARDLAY-004: Table Layout Mode

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No
**Deps**: `archive/tickets/BOARDLAY-003-graph-layout-forceatlas2.md` (dispatcher exists, table branch still placeholder)

## Problem

Games without spatial adjacency (like Texas Hold'em) need a table-style layout: shared zones centered, player zones arranged in a circle/oval around the perimeter. The existing `computeGridLayout()` in `position-store.ts` provides a basic square grid but not the table arrangement described in Spec 41 D2 (table mode).

## Assumption Reassessment (2026-02-19)

1. `computeLayout()` already exists in `packages/runner/src/layout/compute-layout.ts`; table mode currently throws `Error('Table layout not yet implemented')`, and tests currently assert that throw.
2. `BOARDLAY-003` is already completed and archived; this ticket must update existing dispatcher behavior instead of introducing it.
3. `partitionZones(def)` currently classifies no-adjacency zones as aux unless `zoneKind: 'board'` is present. For table-mode games like Texas Hold'em, relying only on `partitionZones(def).board` can produce an empty layout. Table mode therefore needs its own zone selection fallback.
4. There is no generic `ZoneDef` field containing explicit player seat index; per-player assignment is commonly encoded in zone IDs (for example `hand:0`, `hand:1`). Grouping must be generic and inference-based, not game-specific.
5. `createGameCanvasRuntime` is not yet wired to layout engine (BOARDLAY-008). This ticket is layout-module scoped; no canvas integration changes belong here.

## What to Change

**Files (expected)**:
- `packages/runner/src/layout/compute-layout.ts` — add `computeTableLayout()` internal, replace throw in dispatcher
- `packages/runner/test/layout/compute-layout.test.ts` — add table mode tests

### Table Mode Algorithm

1. Select table zones with mode-local fallback:
   - Start with `partitionZones(def).board`.
   - If empty, use `def.zones` as table layout input (so no-adjacency games still get positions).
2. Classify zones:
   - **Shared zones**: `owner === 'none'` — these go in the center.
   - **Player zones**: `owner === 'player'` — these go around the perimeter.
3. **Center layout**: Stack shared zones vertically in the center of the layout area.
4. **Perimeter layout**: Distribute player zones evenly around an ellipse. Group zones by inferred player bucket:
   - Primary: parse trailing `:<integer>` from zone ID for `owner: 'player'`.
   - Fallback: if no numeric suffix exists, treat each zone as its own bucket to avoid overlap and preserve determinism.
   - Place each bucket contiguously.
5. Build `LayoutResult` with all positions and bounding box.

### Dispatcher Update

Replace `throw Error('Table layout not yet implemented')` with call to `computeTableLayout()`.

## Out of Scope

- Track and grid layout modes (BOARDLAY-005)
- Aux zone sidebar layout (BOARDLAY-006)
- Layout caching (BOARDLAY-007)
- GameCanvas integration (BOARDLAY-008)
- Engine package changes
- Modifying `computeGridLayout()` in position-store.ts (it remains as the position store's internal fallback)
- Zone styling or visual enhancements

## Acceptance Criteria

### Specific Tests That Must Pass

1. **Table layout produces positions for all zones**: Given N board zones, result has N position entries.
2. **Shared zones are centered**: Zones with `owner === 'none'` have positions near the center of the bounding box.
3. **Player zones are on perimeter**: Zones with `owner === 'player'` are positioned farther from center than shared zones.
4. **Player zones are distributed angularly**: Player zones are spread around the perimeter (no two player zones at same angle, within tolerance).
5. **mode field is 'table'**: Result `mode` equals `'table'`.
6. **Single shared zone**: One `owner: 'none'` zone is placed at origin.
7. **No shared zones**: All player zones arranged in circle (no center cluster).
8. **No player zones**: Only shared zones stacked at center.
9. **Bounding box is valid**: `boardBounds` has minX < maxX and minY < maxY for non-trivial input.
10. **Dispatcher routes table mode**: `computeLayout(def, 'table')` produces a result with `mode: 'table'`.
11. **No-adjacency fallback**: In table mode, when `partitionZones(def).board` is empty, layout still includes zones from `def.zones`.
12. **Grouped seat buckets**: Player zones with IDs like `hand:0` and `boardSeat:0` share a bucket angle and are placed contiguously.

### Invariants

1. `computeTableLayout()` is pure — no side effects.
2. Returned `LayoutResult` is immutable.
3. Runtime code changes are limited to `compute-layout.ts` and its test file.
4. `computeGridLayout()` in `position-store.ts` is NOT modified.
5. `pnpm turbo build` and `pnpm -F @ludoforge/runner test` pass.

## Architecture Rationale

This change is beneficial over the current placeholder architecture because it:

1. Removes the table-mode dead branch from the layout dispatcher.
2. Keeps table concerns mode-local instead of mutating generic partition logic shared by graph mode.
3. Preserves game-agnostic behavior by inferring player buckets from generic zone-ID patterns and deterministic fallbacks, with no game-specific IDs or hardcoded mappings.

## Outcome

- **Completion date**: 2026-02-19
- **What was changed**:
  - Implemented table mode in `packages/runner/src/layout/compute-layout.ts` via `computeTableLayout()`.
  - Replaced dispatcher throw for `'table'` with concrete layout computation.
  - Added mode-local table-zone fallback (`partitionZones(def).board` then fallback to `def.zones`) so no-adjacency games still receive layout positions.
  - Added deterministic player grouping by numeric zone ID suffix (for example `hand:0`) with per-zone fallback buckets when suffix is absent.
  - Added/updated table-mode tests in `packages/runner/test/layout/compute-layout.test.ts`.
- **Deviations from original plan**:
  - Did not modify shared partition logic; table fallback was kept local to `computeTableLayout()` to avoid cross-mode behavior regressions.
  - Explicitly encoded the no-adjacency fallback invariant, which was not fully captured in the original ticket.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- compute-layout.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm turbo build` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
