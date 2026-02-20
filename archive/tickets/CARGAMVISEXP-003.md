# CARGAMVISEXP-003: Card-role-aware table layout (zones on table, not sidebar)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: None (standalone, can be done in parallel with CARGAMVISEXP-001)

## Problem

`partitionZones()` (in `build-layout-graph.ts`) puts all non-adjacency zones in `aux`. `computeAuxLayout()` places all aux zones in a sidebar. For Texas Hold'em, ALL zones end up in the sidebar because there are no adjacency edges. Worse, in `layout-cache.ts` lines 36-39, aux positions overwrite board positions in the same map, so even if a board layout were computed, aux would clobber it.

Additionally, seat 0 starts at the top of the table (`-Math.PI / 2` in `placePlayerZones()`), but poker convention places the human player (seat 0) at the bottom.

## Assumption Reassessment (2026-02-20)

1. `partitionZones()` lives in `build-layout-graph.ts:17-41` and is **not** re-exported from `layout-helpers.ts` — corrected.
2. `layout-cache.ts` merges board and aux maps; when table mode falls back to `selectPrimaryLayoutZones(def) => def.zones`, aux zones are laid out twice and aux coordinates overwrite table coordinates for the same IDs — confirmed.
3. `computeLayout()` at `compute-layout.ts:51-66` takes `(def, mode, regionHints?)` and cannot accept promoted board zones or table-role metadata — confirmed.
4. `computeTableLayout()` is private and currently re-derives table zones from `def` via `selectPrimaryLayoutZones(def)` instead of using upstream partition/promotion results — confirmed.
5. `placePlayerZones()` at `compute-layout.ts:344-380` uses starting angle `-Math.PI / 2` (top) — confirmed.
6. `CardAnimationZoneRolesSchema` exists with `draw`, `hand`, `shared`, `burn`, `discard`, and `getCardAnimation()` exposes it from config — confirmed.
7. `layout-helpers.test.ts` does not exist — confirmed, needs to be created.

## Architecture Check

1. `promoteCardRoleZones()` is generic: it reads zone roles from the visual config's `cardAnimation.zoneRoles` — any card game can use this, not Texas Hold'em-specific.
2. The board/aux partition fix is a layout-pipeline concern only — no engine changes.
3. Preferred architecture: layout partition/promotion is decided once in `layout-cache.ts`, and `computeLayout()` receives explicit options (board zones + optional table role metadata) rather than re-deriving from `def` in table mode.
4. Changing seat 0 angle from top to bottom affects the `table` layout mode only, which is new and only used by card games. FITL uses `graph` mode, so no regression.
5. Enhanced center layout positions zones by card role (draw/shared/burn/discard) — also driven entirely by config, not game-specific branching.

## What to Change

### 1. Add `promoteCardRoleZones()` to `layout-helpers.ts`

New exported function:
```typescript
export function promoteCardRoleZones(
  partitioned: { board: ZoneDef[]; aux: ZoneDef[] },
  roleZoneIds: ReadonlySet<string>,
): { board: readonly ZoneDef[]; aux: readonly ZoneDef[] }
```
Moves matching zones from aux to board by role zone ID. Keep this helper pure (no provider/config dependency).

### 2. Wire promotion into `layout-cache.ts`

After `partitionZones(def)`, read `cardAnimation.zoneRoles` from provider, build one `Set<string>` of zone IDs, call `promoteCardRoleZones(partitioned, roleZoneIds)`. Pass promoted board zones to table layout and promoted aux zones to `computeAuxLayout()`.

### 3. Refactor `computeLayout()` to explicit options

Modify signature:
```typescript
export function computeLayout(
  def: GameDef,
  mode: LayoutMode,
  options?: {
    regionHints?: readonly RegionHint[] | null;
    boardZones?: readonly ZoneDef[];
    tableZoneRoles?: CardAnimationZoneRoles | null;
  },
): LayoutResult
```
In `table` case: `computeTableLayout(options?.boardZones ?? selectPrimaryLayoutZones(def), options?.tableZoneRoles ?? null)`.
In `graph` case: continue to use `options?.regionHints ?? null`.

### 4. Change seat 0 angle in `placePlayerZones()`

Change starting angle from `-Math.PI / 2` to `Math.PI / 2` so seat 0 appears at the bottom of the table.

### 5. Enhanced table center layout for card-role zones

Modify `computeTableLayout()` to accept optional `CardAnimationZoneRoles` and position shared (non-player) zones by role:
- `draw` zones: above center
- `shared` zones: center row, spread horizontally
- `burn` zones: below center-left
- `discard` zones: below center-right

Add constants `TABLE_CENTER_ROW_GAP = 100` and `TABLE_CENTER_HORIZONTAL_SPACING = 140`.

## Files to Touch

- `packages/runner/src/layout/layout-helpers.ts` (modify — add `promoteCardRoleZones()`)
- `packages/runner/src/layout/layout-cache.ts` (modify — wire promotion)
- `packages/runner/src/layout/compute-layout.ts` (modify — explicit options object, seat 0 angle, card-role center layout)
- `packages/runner/test/layout/layout-helpers.test.ts` (new — promoteCardRoleZones tests)
- `packages/runner/test/layout/compute-layout.test.ts` (modify — card-role center placement, seat 0 at bottom)
- `packages/runner/test/layout/layout-cache.test.ts` (modify — full pipeline with promotion)

## Out of Scope

- Token type or card template rendering — that's CARGAMVISEXP-001/002
- Table background drawing — that's CARGAMVISEXP-004
- Table overlays (pot, bets, dealer) — that's CARGAMVISEXP-005
- Hand panel UI — that's CARGAMVISEXP-006
- Deal animation code changes (D7 is verification only, depends on this ticket's layout fix)
- Engine/kernel changes of any kind
- FITL layout (uses `graph` mode, unaffected by `table` mode changes)
- `visual-config-types.ts` schema changes (no new schema needed for this ticket)

## Acceptance Criteria

### Tests That Must Pass

1. `layout-helpers.test.ts` — new test: `promoteCardRoleZones()` moves zones listed in `zoneRoles` from aux to board
2. `layout-helpers.test.ts` — new test: `promoteCardRoleZones()` returns original partition when role set is empty
3. `layout-helpers.test.ts` — new test: zones already in board are not duplicated
4. `compute-layout.test.ts` — new test: table layout with `options.boardZones` uses provided zones instead of `selectPrimaryLayoutZones()`
5. `compute-layout.test.ts` — new test: seat 0 is positioned at bottom of table (y > 0) in table layout mode
6. `compute-layout.test.ts` — new test: card-role center layout places draw zones above center, shared zones at center, burn/discard below
7. `layout-cache.test.ts` — new test: promoted card-role zones appear at board positions, not aux sidebar positions
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. FITL game layout (graph mode) is completely unaffected.
2. Games without `cardAnimation` in their visual config behave identically (no promotion, no card-role center layout).
3. Aux zones NOT listed in `zoneRoles` remain in the aux sidebar.
4. No engine/kernel/compiler code is modified.
5. `computeLayout()` in graph/track/grid modes behaves identically to before.
6. Shared layout helpers remain provider-agnostic (no `VisualConfigProvider` dependency in `layout-helpers.ts`).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/layout/layout-helpers.test.ts` (new) — promoteCardRoleZones: promotion, null-config passthrough, no-duplicate
2. `packages/runner/test/layout/compute-layout.test.ts` — card-role center placement, seat 0 at bottom, boardZones param
3. `packages/runner/test/layout/layout-cache.test.ts` — full pipeline with card role zone promotion

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/layout/`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Added `promoteCardRoleZones()` in layout helpers as a pure role-ID-set transform.
  - Refactored `computeLayout()` to accept an explicit options object (`regionHints`, `boardZones`, `tableZoneRoles`) and wired table layout to consume promoted board zones and card-role metadata.
  - Updated table layout to place seat 0 at the bottom and to place role-tagged shared zones into role-specific center rows.
  - Wired `layout-cache` to build role zone IDs from visual config, promote roles before layout, and keep only non-promoted zones in aux layout.
  - Added/updated layout tests for helper promotion, explicit board zone input, seat 0 orientation, role-based center placement, and full cache pipeline promotion behavior.
- Deviations from original plan:
  - Replaced the positional `boardZones` parameter proposal with an explicit options object for cleaner extensibility and to avoid parameter growth.
  - Kept `layout-helpers.ts` provider-agnostic (no `VisualConfigProvider` dependency inside helper).
- Verification:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose test/layout/` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
