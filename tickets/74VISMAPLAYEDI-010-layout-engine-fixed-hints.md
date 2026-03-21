# 74VISMAPLAYEDI-010: Layout Engine — Honor `layout.hints.fixed` Positions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (can be implemented independently)

## Problem

`compute-layout.ts` does not currently honor `layout.hints.fixed`. When a user exports a visual config with fixed zone positions from the map editor, those positions are ignored — ForceAtlas2 places all zones fresh. This makes the editor's output useless for the runtime renderer.

## Assumption Reassessment (2026-03-21)

1. `computeLayout(def, mode, options?)` returns `LayoutResult` with `positions: ReadonlyMap<string, Position>`. Confirmed.
2. `LayoutHintsSchema` has `fixed: z.array(FixedPositionHintSchema).optional()`. Confirmed — schema exists but is not consumed.
3. `ComputeLayoutOptions` currently includes `hints?: LayoutHints` (or similar). Need to verify exact signature.
4. ForceAtlas2 (graphology) supports fixed node positions via node attribute `fixed: true` and pre-set `x`/`y` coordinates. Standard graphology-layout-forceatlas2 feature.
5. `getOrComputeLayout(def, visualConfigProvider)` calls `computeLayout` and may pass hints. Need to verify.

## Architecture Check

1. Small, isolated change to `compute-layout.ts` — no new files, no new modules.
2. Fixed zones are pinned as immovable nodes in the ForceAtlas2 graph. Non-fixed zones are laid out normally. This is the standard approach for partial fixed-layout in force-directed systems.
3. Game-agnostic — works with any game's fixed position hints (Foundation 1).
4. Empty `fixed` array or missing `fixed` property behaves identically to current behavior (Foundation 9 — no backwards compatibility needed, but no breaking change either).

## What to Change

### 1. Modify `computeLayout` to accept and honor fixed hints

In `packages/runner/src/layout/compute-layout.ts`:

**For `'graph'` mode**:
1. If `options.hints?.fixed` is present and non-empty:
   - For each fixed hint `{ zone, x, y }`, set the corresponding node's `x` and `y` attributes in the graphology graph
   - Mark the node as `fixed: true` (graphology-layout-forceatlas2 attribute) so ForceAtlas2 does not move it
2. Run ForceAtlas2 as usual — fixed nodes anchor the layout, non-fixed nodes arrange around them
3. After ForceAtlas2 completes, ensure fixed nodes retain their exact specified positions (ForceAtlas2 may round — re-set from hints)

### 2. Pass fixed hints through the call chain

If `getOrComputeLayout` or the `ComputeLayoutOptions` interface doesn't already pass `hints.fixed`, add it:
- Ensure `VisualConfigProvider.getLayoutHints()` result (which includes `fixed` array) reaches `computeLayout`

### 3. Handle edge cases

- Zone ID in `fixed` that doesn't exist in the graph → skip silently (the visual config may reference zones from a different version)
- All zones fixed → no ForceAtlas2 run needed, just place at specified positions
- No fixed zones → existing behavior unchanged

## Files to Touch

- `packages/runner/src/layout/compute-layout.ts` (modify)

## Out of Scope

- Map editor canvas or store (74VISMAPLAYEDI-002 through 009)
- Visual config schema changes (schema already supports `fixed`)
- Other layout modes (table, track, grid) — only `'graph'` mode uses ForceAtlas2
- Any engine changes

## Acceptance Criteria

### Tests That Must Pass

1. With `fixed: [{ zone: 'A', x: 100, y: 200 }]`, zone `A` is at exactly `(100, 200)` in the result. Other zones are laid out by ForceAtlas2.
2. With `fixed: [{ zone: 'A', x: 100, y: 200 }, { zone: 'B', x: 300, y: 400 }]`, both zones are at their specified positions.
3. With all zones fixed, every zone is at its specified position (no ForceAtlas2 jitter).
4. With empty `fixed: []`, behavior is identical to no `fixed` property.
5. With `fixed` referencing a non-existent zone ID, the hint is ignored and other zones are laid out normally.
6. Without `fixed` property at all (undefined), existing behavior is unchanged.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `computeLayout` output is deterministic for the same inputs (Foundation 5 — layout determinism isn't strictly required by the engine, but consistency is important).
2. Non-fixed zones are still laid out by ForceAtlas2 (partial fixed layout, not all-or-nothing).
3. No new dependencies added.
4. Other layout modes (table, track, grid) are unaffected.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/layout/compute-layout.test.ts` — add tests for fixed hints: single fixed zone, multiple fixed zones, all fixed, empty fixed, non-existent zone ID, no fixed property

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
