# VISCONF2-001: Token Shape Rendering

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only change
**Deps**: None

## Problem

`resolveTokenShape()` in `packages/runner/src/canvas/renderers/token-renderer.ts` currently collapses token shapes to only `'card'` and `'circle'`, so `TokenShape` values configured in `visual-config.yaml` (for example `cube`, `round-disk`, `cylinder`) do not render distinctly.

The visual config type surface already declares 10 token shapes, but token rendering behavior only supports 2 draw paths. This creates a configuration/runtime mismatch.

The shape name `cylinder` is ambiguous in a 2D top-down renderer. For FITL semantics, this should be modeled as `beveled-cylinder` (octagonal disk with an inner bevel).

## Assumption Reassessment (Code + Tests)

### Verified assumptions

1. `TokenShape` currently includes 10 values in runner config type definitions.
2. At reassessment time, FITL `visual-config.yaml` used `shape: cylinder` for multiple token types.
3. Token rendering currently supports only two draw branches (`circle` and `card`).

### Corrected assumptions

1. Integration coverage for FITL visual config parsing already exists in `packages/runner/test/config/visual-config-files.test.ts`.
   - Action: update/strengthen existing test expectations instead of adding a duplicate integration test file.
2. Token renderer tests are extensive, but currently model token shape as `'card' | 'circle'` in local test helpers.
   - Action: widen test helper typing to `TokenShape` and add shape-dispatch assertions.
3. Scope impact is broader than three files.
   - Action: include all runner tests/fixtures that validate token shape enums or FITL tokenTypes, plus any compile-time type sites.

## Architecture Decision

Proposed direction is better than the current architecture.

Reasons:
1. A dedicated token shape drawer module with a typed registry mirrors the existing zone-shape dispatch pattern and removes ad-hoc branching from `token-renderer.ts`.
2. Rendering behavior becomes open for extension (new shape = add one registry entry) and closed for modification of token renderer orchestration logic.
3. Reusing `buildRegularPolygonPoints()` centralizes polygon math and avoids drift between zone/token geometry.

Non-goals:
1. No backward-compatibility alias for `cylinder`.
2. No game-specific renderer branching.

## Updated Scope

### 1. Rename `cylinder` to `beveled-cylinder` (no alias)

**Files**:
- `packages/runner/src/config/visual-config-defaults.ts` — `TokenShape` union
- `packages/runner/src/config/visual-config-types.ts` — `TokenShapeSchema`
- `data/games/fire-in-the-lake/visual-config.yaml` — replace `shape: cylinder`
- Runner tests/fixtures referencing `cylinder`/token-shape enums as needed

### 2. Add token shape dispatch module

**New file**:
- `packages/runner/src/canvas/renderers/token-shape-drawer.ts`

Responsibilities:
- Export `drawTokenShape(graphics, shape, dimensions, fillColor, stroke)`.
- Export/define typed shape registry keyed by all `TokenShape` values.
- Implement 10 shape renderers:
  - `circle`
  - `square`
  - `triangle`
  - `diamond`
  - `hexagon`
  - `beveled-cylinder`
  - `meeple`
  - `card`
  - `cube`
  - `round-disk`
- Reuse `buildRegularPolygonPoints()` from `shape-utils.ts`.

### 3. Refactor token renderer to consume shape dispatch

**File**:
- `packages/runner/src/canvas/renderers/token-renderer.ts`

Changes:
- Remove shape-collapsing logic.
- Replace `drawTokenBase()` implementation with `drawTokenShape()` call.
- Expand dimension resolution to `TokenShape` (not `'circle' | 'card'` only).
- Preserve current card and circle visual behavior.

### 4. Update tests (hard + edge coverage)

**New tests**:
- `packages/runner/test/canvas/renderers/token-shape-drawer.test.ts`
  - Registry completeness against all `TokenShape` values.
  - Smoke draw for every shape.
  - Shape-specific invariants:
    - `beveled-cylinder` outer octagon + inner ring/polygon.
    - `cube` body + top-face hint.
    - `round-disk` concentric rings.

**Modified tests**:
- `packages/runner/test/canvas/renderers/token-renderer.test.ts`
  - Widen test helper shape type to `TokenShape`.
  - Add regression that non-card token shapes no longer collapse to circle behavior.
  - Add/strengthen dimension/aspect assertions where shape-specific sizing matters.
- `packages/runner/test/config/visual-config-files.test.ts`
  - Strengthen FITL token shape assertions to include `beveled-cylinder` values.

## Invariants

1. Every `TokenShape` value is represented in the shape registry.
2. All token shapes render centered at `(0, 0)`.
3. All shapes honor `dimensions`.
4. All shapes apply both fill and stroke styles.
5. `beveled-cylinder` renders an octagonal body with visible inner bevel geometry.
6. Existing `circle` and `card` visuals remain behaviorally unchanged.
7. FITL visual config validates after `cylinder` → `beveled-cylinder` rename.

## Verification

Run at minimum:
1. `pnpm -F @ludoforge/runner test -- token-shape-drawer token-renderer visual-config-files visual-config-schema`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-19
- What changed:
  - Renamed token shape contract from `cylinder` to `beveled-cylinder` across runner token-shape type/schema and FITL visual config.
  - Added `packages/runner/src/canvas/renderers/token-shape-drawer.ts` with a typed registry implementing all token shapes and centralized dispatch.
  - Refactored `token-renderer.ts` to stop collapsing shapes and to use full `TokenShape` dispatch/dimensions.
  - Added dedicated drawer tests and strengthened existing renderer/config schema/file tests.
- Deviations from original plan:
  - Reused existing FITL visual-config integration suite (`visual-config-files.test.ts`) and strengthened it instead of introducing a separate duplicate integration test.
  - Shape-specific dimension behavior is verified through renderer behavior tests plus drawer invariants rather than a standalone exported `resolveTokenDimensions` unit API.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- token-shape-drawer token-renderer visual-config-files visual-config-schema` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo lint` passed.
