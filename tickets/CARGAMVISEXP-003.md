# CARGAMVISEXP-003: Card-role-aware table layout (zones on table, not sidebar)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: None (standalone, can be done in parallel with CARGAMVISEXP-001)

## Problem

`partitionZones()` (in `build-layout-graph.ts`) puts all non-adjacency zones in `aux`. `computeAuxLayout()` places all aux zones in a sidebar. For Texas Hold'em, ALL zones end up in the sidebar because there are no adjacency edges. Worse, in `layout-cache.ts` lines 36-39, aux positions overwrite board positions in the same map, so even if a board layout were computed, aux would clobber it.

Additionally, seat 0 starts at the top of the table (`-Math.PI / 2` in `placePlayerZones()`), but poker convention places the human player (seat 0) at the bottom.

## Assumption Reassessment (2026-02-20)

1. `partitionZones()` lives in `build-layout-graph.ts:17-41`, re-exported from `layout-helpers.ts` — confirmed.
2. `layout-cache.ts` lines 36-39: aux positions overwrite board positions in the same `positions` map — confirmed.
3. `computeLayout()` at `compute-layout.ts:51-66` takes `(def, mode, regionHints?)` — does NOT accept an optional `boardZones` param — confirmed.
4. `computeTableLayout()` is a private function at `compute-layout.ts:68-101` that calls `selectPrimaryLayoutZones(def)` internally — confirmed.
5. `placePlayerZones()` at `compute-layout.ts:344-380` uses starting angle `-Math.PI / 2` (top) — confirmed.
6. `CardAnimationZoneRolesSchema` exists at `visual-config-types.ts:129-135` with `draw`, `hand`, `shared`, `burn`, `discard` — confirmed.
7. `getCardAnimation()` at `visual-config-provider.ts:198-200` returns `config?.cardAnimation ?? null` — confirmed.
8. `layout-helpers.test.ts` DOES NOT EXIST — confirmed, needs to be created.

## Architecture Check

1. `promoteCardRoleZones()` is generic: it reads zone roles from the visual config's `cardAnimation.zoneRoles` — any card game can use this, not Texas Hold'em-specific.
2. The board/aux partition fix is a layout-pipeline concern only — no engine changes.
3. Adding an optional `boardZones` param to `computeLayout()` is backwards-compatible (defaults to `selectPrimaryLayoutZones(def)` when omitted).
4. Changing seat 0 angle from top to bottom affects the `table` layout mode only, which is new and only used by card games. FITL uses `graph` mode, so no regression.
5. Enhanced center layout positions zones by card role (draw/shared/burn/discard) — also driven entirely by config, not game-specific branching.

## What to Change

### 1. Add `promoteCardRoleZones()` to `layout-helpers.ts`

New exported function:
```typescript
export function promoteCardRoleZones(
  partitioned: { board: ZoneDef[]; aux: ZoneDef[] },
  provider: VisualConfigProvider,
): { board: readonly ZoneDef[]; aux: readonly ZoneDef[] }
```
Reads `provider.getCardAnimation()`, collects all zone IDs from `zoneRoles.*`, moves matching zones from aux to board.

### 2. Wire promotion into `layout-cache.ts`

After `partitionZones(def)`, call `promoteCardRoleZones(partitioned, provider)`. Pass `promoted.board` to `computeLayout()` and `promoted.aux` to `computeAuxLayout()`.

This requires `layout-cache.ts` to receive or import the `VisualConfigProvider`. Check how it currently gets `def` and `mode`, and thread the provider through the same path.

### 3. Add optional `boardZones` param to `computeLayout()`

Modify signature:
```typescript
export function computeLayout(
  def: GameDef,
  mode: LayoutMode,
  regionHints?: readonly RegionHint[] | null,
  boardZones?: readonly ZoneDef[],
): LayoutResult
```
In `table` case: `computeTableLayout(boardZones ?? selectPrimaryLayoutZones(def))`.

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
- `packages/runner/src/layout/compute-layout.ts` (modify — optional `boardZones` param, seat 0 angle, card-role center layout)
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
2. `layout-helpers.test.ts` — new test: `promoteCardRoleZones()` returns original partition when `getCardAnimation()` returns null
3. `layout-helpers.test.ts` — new test: zones already in board are not duplicated
4. `compute-layout.test.ts` — new test: table layout with `boardZones` param uses provided zones instead of `selectPrimaryLayoutZones()`
5. `compute-layout.test.ts` — new test: seat 0 is positioned at bottom of table (y > 0) in table layout mode
6. `compute-layout.test.ts` — new test: card-role center layout places draw zones above center, shared zones at center, burn/discard below
7. `layout-cache.test.ts` — new test: promoted card-role zones appear at board positions, not aux sidebar positions
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. FITL game layout (graph mode) is completely unaffected.
2. Games without `cardAnimation` in their visual config behave identically (no promotion, no card-role center layout).
3. Aux zones NOT listed in `zoneRoles` remain in the aux sidebar.
4. No engine/kernel/compiler code is modified.
5. `computeLayout()` without the optional `boardZones` param behaves identically to before.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/layout/layout-helpers.test.ts` (new) — promoteCardRoleZones: promotion, null-config passthrough, no-duplicate
2. `packages/runner/test/layout/compute-layout.test.ts` — card-role center placement, seat 0 at bottom, boardZones param
3. `packages/runner/test/layout/layout-cache.test.ts` — full pipeline with card role zone promotion

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/layout/`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`
