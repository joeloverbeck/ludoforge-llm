# 74VISMAPLAYEDI-010: Layout Engine — Honor `layout.hints.fixed` Positions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`compute-layout.ts` does not currently honor `layout.hints.fixed`. The map editor already exports authored zone positions into `visual-config.yaml`, and `VisualConfigProvider.getLayoutHints()` already exposes them, but the layout pipeline drops those fixed hints before graph layout runs. ForceAtlas2 therefore places all zones fresh, so authored map layouts are not rendered at runtime.

## Assumption Reassessment (2026-03-21)

1. `computeLayout(def, mode, options?)` returns `LayoutResult` with `positions: ReadonlyMap<string, Position>`. Confirmed.
2. `LayoutHintsSchema` has `fixed: z.array(FixedPositionHintSchema).optional()`. Confirmed — schema exists but is not consumed.
3. `ComputeLayoutOptions` does not currently accept full layout hints. It accepts `regionHints?: readonly RegionHint[] | null`, so `fixed` is dropped inside the layout layer. Corrected.
4. `getOrComputeLayout(def, visualConfigProvider)` already fetches `visualConfigProvider.getLayoutHints()`, but currently forwards only `hints?.regions ?? null` to `computeLayout`. Corrected.
5. The map editor export path already writes `layout.hints.fixed` and tests it. This ticket is therefore closing an existing runtime-consumption gap, not adding a speculative future hook. Corrected.
6. The installed `graphology-layout-forceatlas2` package reads a node `fixed` attribute in its node matrix preparation, so pinning fixed nodes in the graph is a viable implementation strategy. Verified locally against the installed package source.

## Architecture Check

1. The clean architecture is to pass the full `LayoutHints` object into the graph-layout path and let `compute-layout.ts` own all graph-layout hint consumption in one place. Avoid threading `regionHints` and `fixed` separately.
2. Fixed zones should be pinned as immovable nodes in the ForceAtlas2 graph. Non-fixed zones should still participate in graph layout, using fixed nodes as anchors.
3. The change remains runner-only and game-agnostic, aligning with Foundations 1 and 3.
4. Empty or missing `fixed` should preserve current behavior. No aliasing or fallback API is needed; internal call sites should be updated directly (Foundation 9).
5. If every board zone is fixed, skipping ForceAtlas2 entirely is cleaner than running a no-op simulation and then correcting drift afterward.

## What to Change

### 1. Refine the layout API to carry graph hints coherently

In `packages/runner/src/layout/compute-layout.ts`:

1. Replace the graph-specific `regionHints` option shape with `layoutHints?: LayoutHints | null` so all graph-layout hints flow through one contract.
2. Update the `'graph'` branch to pass the full hints object into `computeGraphLayout`.

### 2. Honor fixed hints in graph layout

In `packages/runner/src/layout/compute-layout.ts`:
1. Build a zone-to-fixed-position map from `layoutHints?.fixed`.
2. For each fixed hint whose zone exists in the graph:
   - set the node `x` and `y` attributes before ForceAtlas2
   - set `fixed: true`
3. If all graph nodes are fixed, skip ForceAtlas2 and emit the authored positions directly.
4. Otherwise run ForceAtlas2 normally so non-fixed zones settle around fixed anchors.
5. After simulation, overwrite fixed nodes back to their exact authored coordinates before normalization/spacing cleanup.

### 3. Handle edge cases

- Zone ID in `fixed` that doesn't exist in the graph → skip silently (the visual config may reference zones from a different version)
- All zones fixed → no ForceAtlas2 run, just place at specified positions
- No fixed zones → existing behavior unchanged
- Region hints and fixed hints must both work together; fixed positions should not disable compass seeding for the remaining nodes

## Files to Touch

- `packages/runner/src/layout/compute-layout.ts`
- `packages/runner/src/layout/layout-cache.ts`
- `packages/runner/test/layout/compute-layout.test.ts`
- `packages/runner/test/layout/layout-cache.test.ts`

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
7. `getOrComputeLayout(def, visualConfigProvider)` passes `layout.hints.fixed` through to graph layout.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `computeLayout` output is deterministic for the same inputs (Foundation 5 — layout determinism isn't strictly required by the engine, but consistency is important).
2. Non-fixed zones are still laid out by ForceAtlas2 (partial fixed layout, not all-or-nothing).
3. No new dependencies added.
4. Other layout modes (table, track, grid) are unaffected.
5. Graph-layout hint handling is centralized; fixed positions are not threaded through ad hoc special-case parameters.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/layout/compute-layout.test.ts` — add tests for fixed hints: single fixed zone, multiple fixed zones, all fixed, empty fixed, non-existent zone ID, no fixed property, and coexistence with region hints
2. `packages/runner/test/layout/layout-cache.test.ts` — add a test proving `getOrComputeLayout` forwards fixed hints from `VisualConfigProvider`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Corrected the ticket first to match the current codebase: map-editor export already writes `layout.hints.fixed`, and the real missing behavior was runner layout consumption.
  - Refined the internal layout API so graph layout accepts the full `LayoutHints` object instead of a `regionHints`-only special case.
  - Updated graph layout to pin authored fixed zones, skip ForceAtlas2 when every graph node is fixed, and preserve fixed coordinates exactly as authored.
  - Updated layout cache to forward the full hint set into graph layout.
  - Added coverage for fixed hints in both graph-layout tests and layout-cache tests.
- Deviations from original plan:
  - The original ticket assumed a one-file change. The clean implementation required touching both `compute-layout.ts` and `layout-cache.ts`, plus tests.
  - The original ticket did not account for the existing graph post-processing pipeline (`normalizeToExtent`, spacing enforcement, recentering) invalidating authored fixed coordinates. The shipped behavior treats fixed positions as authoritative world-space coordinates instead.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
