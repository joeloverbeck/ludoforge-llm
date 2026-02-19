# BOARDLAY-001: Add Graphology Dependencies and Layout Type Definitions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No
**Deps**: None (first ticket in series)

## Problem

Spec 41 requires ForceAtlas2 force-directed graph layout, which depends on the `graphology` graph data structure library and `graphology-layout-forceatlas2`. These packages are not yet in the runner's dependency tree. Additionally, the layout engine needs shared type definitions that all subsequent tickets will import.

## What to Change

**Files (expected)**:
- `packages/runner/package.json` — add `graphology` and `graphology-layout-forceatlas2` as dependencies
- `packages/runner/src/layout/layout-types.ts` — create shared type definitions for the layout engine
- `pnpm-lock.yaml` — updated by `pnpm install`

### Steps

1. Run `pnpm -F @ludoforge/runner add graphology graphology-layout-forceatlas2`.
2. Run `pnpm -F @ludoforge/runner add -D @types/graphology` if types are not bundled.
3. Create `packages/runner/src/layout/layout-types.ts` with:
   - `LayoutMode = 'graph' | 'table' | 'track' | 'grid'`
   - `LayoutResult` interface: `{ positions: Map<string, { x: number; y: number }>; mode: LayoutMode; boardBounds: { minX, minY, maxX, maxY } }`
   - `AuxLayoutResult` interface: `{ positions: Map<string, { x: number; y: number }>; groups: readonly { label: string; zoneIds: readonly string[] }[] }`
4. Verify `pnpm turbo build` passes (runner builds with new deps).
5. Verify `pnpm turbo typecheck` passes.

## Out of Scope

- Layout algorithms (BOARDLAY-003 through BOARDLAY-005)
- Zone partitioning or mode resolution logic (BOARDLAY-002)
- Any modifications to existing canvas, position store, or renderer files
- Engine package changes (metadata.layoutMode already exists)
- Aux zone layout logic (BOARDLAY-006)

## Acceptance Criteria

### Tests That Must Pass
1. `pnpm turbo build` succeeds — runner compiles with graphology imports available.
2. `pnpm turbo typecheck` succeeds — layout-types.ts has no type errors.
3. Existing runner tests (`pnpm -F @ludoforge/runner test`) remain green.

### Invariants
1. No existing runner source files are modified (only new files + package.json).
2. `graphology` and `graphology-layout-forceatlas2` are listed under `dependencies` (not `devDependencies`) since they are used at runtime.
3. The `layout-types.ts` file exports only type definitions — no runtime logic.
4. Engine package is untouched.
