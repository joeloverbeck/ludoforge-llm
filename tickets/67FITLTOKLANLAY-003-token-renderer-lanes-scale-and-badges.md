# 67FITLTOKLANLAY-003: Token Renderer Lane Layout, Scaled Geometry, and Configurable Stack Badges

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner canvas/render-model plumbing only
**Deps**: 67FITLTOKLANLAY-002

## Problem

The current token renderer is still grid-first and constant-driven. [`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts) uses `TOKENS_PER_ROW`, `TOKEN_SPACING`, and a hardcoded `fontSize: 10` badge with a fixed `-2/+2` inset. It also receives only `zoneID` during token placement, so it cannot resolve a zone token layout policy for a city/province without additional data flow.

## Assumption Reassessment (2026-03-18)

1. `RenderZone` already includes `category`, but `TokenRenderer.update()` currently receives only `tokens` and `zoneContainers` — confirmed.
2. `GameCanvas.tsx` currently builds `TokenLayoutConfig` only for card fan/stack behavior, so map-space token lanes need new plumbing, not just a local renderer patch — confirmed.
3. The renderer test suite already has mock color-provider infrastructure and can support lane-layout assertions without needing FITL YAML integration — confirmed.
4. Ticket `002` now provides normalized provider APIs for token presentation, zone token layouts, and stack badge styling, so this ticket should consume those contracts directly instead of introducing another renderer-local config shape — confirmed.

## Architecture Check

1. Lane placement must be computed from resolved provider metadata, not from token-type shape or hardcoded FITL ids.
2. Token scaling must flow through dimension and hit-area calculation, not through a Pixi container post-scale hack, or selection/hover bounds will drift from visuals.
3. Card fan/stack behavior must continue to work; Spec 67 is adding a new generic layout mode, not regressing existing card-zone handling.
4. The renderer should consume the cleaner provider contract established in ticket `002`; do not reintroduce ad hoc raw-config lookups or re-bloat `ResolvedTokenVisual` locally just to make the renderer patch easier.
5. `GameCanvas` should not remain the owner of a bespoke token-layout translation layer once this lands. If the provider can be threaded into token rendering cleanly, prefer that over preserving `buildTokenLayoutConfig()` as an intermediate shim.

## What to Change

### 1. Add the missing data path into token rendering

Refactor the token rendering call path so the renderer can resolve zone token layouts using actual zone metadata, not just `zoneID`. Prefer passing provider-backed data directly rather than adding or extending a renderer-specific `TokenLayoutConfig` shim. That likely requires changes in:

- [`packages/runner/src/canvas/renderers/renderer-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/renderer-types.ts)
- [`packages/runner/src/canvas/renderers/faction-colors.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/faction-colors.ts)
- [`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts)
- [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx)

If the cleanest approach is to pass rendered zones and the provider into `TokenRenderer.update()`, do that directly rather than inventing or preserving a second bespoke layout map.

Implementation note: prefer deleting superseded renderer-specific layout/badge assumptions, including `GameCanvas`-side translation helpers if they become redundant, over layering aliases or fallback branches on top of them.

### 2. Implement lane-aware placement while preserving stack collapse

Replace the current grid-only placement path for generic map tokens with:

1. resolve zone token layout
2. partition render entries by presentation lane
3. compute centered row offsets within each lane
4. position later lanes relative to earlier lanes using configured gap/anchor rules

`buildRenderEntries()` stack collapse must remain intact; lane assignment happens after collapse using the representative token type.

### 3. Make resolved scale affect rendered geometry

Ensure token presentation scale affects:

- shape dimensions
- hit areas
- badge anchor/offset calculation
- comparable width calculations for centered rows

Remove or supersede the hardcoded grid/badge constants that Spec 67 replaces.

### 4. Make stack badge styling provider-driven

The badge text, outline, and offset must use resolved config instead of the current monospace/size-10/no-stroke default baked into `createTokenVisualElements()` and `updateTokenVisuals()`.

### 5. Add renderer tests for the new behavior

Extend [`packages/runner/test/canvas/renderers/token-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/token-renderer.test.ts) with cases for lane centering, base-lane placement, scaled dimensions/hit areas, and configured badge style/offsets.

## Files to Touch

- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify)
- `packages/runner/src/canvas/renderers/faction-colors.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify, only if renderer input contract changes)

## Out of Scope

- FITL YAML authoring itself
- provider/schema changes beyond what is strictly required to consume the resolved APIs from ticket 002
- altering zone layout computation outside token presentation needs
- any engine or simulation behavior
- screenshot artifact refresh

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts` asserts regular-lane tokens are centered around the zone origin.
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts` asserts base-lane tokens render below the regular lane for a two-lane layout.
3. `packages/runner/test/canvas/renderers/token-renderer.test.ts` asserts a base token with scale `1.5` gets larger rendered dimensions and corresponding hit area than a comparable regular token.
4. `packages/runner/test/canvas/renderers/token-renderer.test.ts` asserts stack badges use configured font/stroke values and corner offsets rather than the old fixed inset.
5. If the token renderer contract changes, `packages/runner/test/canvas/GameCanvas.test.ts` verifies `GameCanvas` passes the new provider/zone inputs correctly and no longer relies on a bespoke token-layout shim.
6. Existing suite: `pnpm -F @ludoforge/runner test -- token-renderer.test.ts GameCanvas.test.ts`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Identical non-selectable tokens still collapse into one rendered entry with a count badge.
2. Card fan and card stack layouts continue to work as before.
3. No FITL-specific token ids or zone ids appear in renderer branching logic.
4. Hit areas stay aligned with final rendered token geometry.
5. The renderer consumes resolved presentation/layout/badge metadata through provider-facing abstractions rather than reaching back into YAML-shaped objects.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — lane packing, badge style, scale/hit area behavior
2. `packages/runner/test/canvas/GameCanvas.test.ts` — only if needed for changed renderer input plumbing or shim removal

### Commands

1. `pnpm -F @ludoforge/runner test -- token-renderer.test.ts GameCanvas.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
