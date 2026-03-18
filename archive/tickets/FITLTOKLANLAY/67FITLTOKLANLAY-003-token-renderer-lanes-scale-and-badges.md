# 67FITLTOKLANLAY-003: Token Renderer Lane Layout, Scaled Geometry, and Configurable Stack Badges

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner canvas/render-model plumbing only
**Deps**: 67FITLTOKLANLAY-002

## Problem

The current token renderer is still grid-first and constant-driven. [`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts) uses `TOKENS_PER_ROW`, `TOKEN_SPACING`, and a hardcoded `fontSize: 10` badge with a fixed `-2/+2` inset. It also receives only `zoneID` during token placement, so it cannot resolve a zone token layout policy for a city/province without additional data flow.

## Assumption Reassessment (2026-03-18)

1. `RenderZone` already includes the zone metadata this work needs (`id`, `category`, `visual`, etc.), but `TokenRenderer.update()` currently receives only `tokens` and `zoneContainers` — confirmed.
2. Ticket `002` is already landed on `HEAD`: `VisualConfigProvider` now exposes normalized `getTokenTypePresentation()`, `resolveZoneTokenLayout()`, and `getStackBadgeStyle()` APIs, with schema/provider test coverage already in place — confirmed.
3. FITL production `visual-config.yaml` has not yet been migrated to the new lane/presentation/badge primitives; that remains ticket `004` scope, so this ticket must stay generic and test against runner-facing contracts rather than assuming real FITL config is already present — discrepancy corrected.
4. `GameCanvas.tsx` still builds a renderer-local `TokenLayoutConfig` shim, but the clean contract seam is actually `canvas-updater.ts`, which already has both `RenderZone[]` and `RenderToken[]` when it calls `tokenRenderer.update()` — discrepancy corrected.
5. The existing test coverage most directly coupled to this contract is `token-renderer.test.ts` plus `canvas-updater.test.ts`; `GameCanvas.test.ts` only needs adjustment if renderer construction changes in a way that remains visible there — discrepancy corrected.

## Architecture Check

1. Lane placement must be computed from resolved provider metadata, not from token-type shape or hardcoded FITL ids.
2. Token scaling must flow through dimension and hit-area calculation, not through a Pixi container post-scale hack, or selection/hover bounds will drift from visuals.
3. Card fan/stack behavior must continue to work; Spec 67 is adding a new generic layout mode, not regressing existing card-zone handling.
4. The renderer should consume the cleaner provider contract established in ticket `002`; do not reintroduce ad hoc raw-config lookups or re-bloat `ResolvedTokenVisual` locally just to make the renderer patch easier.
5. `GameCanvas` should not remain the owner of a bespoke token-layout translation layer once this lands. Remove `buildTokenLayoutConfig()` instead of preserving or renaming that shim.
6. The cleanest data flow is: `canvas-updater` passes actual `RenderZone[]` alongside `RenderToken[]`, and the renderer resolves per-zone layout through the provider-backed renderer dependency. Prefer that over threading more partial maps through `GameCanvas`.

## What to Change

### 1. Add the missing data path into token rendering

Refactor the token rendering call path so the renderer can resolve zone token layouts using actual zone metadata, not just `zoneID`. Prefer passing provider-backed data directly rather than adding or extending a renderer-specific `TokenLayoutConfig` shim. The primary contract change should happen at the renderer boundary used by `canvas-updater`, not by enriching `GameCanvas` with more translation logic. That likely requires changes in:

- [`packages/runner/src/canvas/canvas-updater.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/canvas-updater.ts)
- [`packages/runner/src/canvas/renderers/renderer-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/renderer-types.ts)
- [`packages/runner/src/canvas/renderers/faction-colors.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/faction-colors.ts)
- [`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts)
- [`packages/runner/src/canvas/GameCanvas.tsx`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/GameCanvas.tsx) (only to remove the obsolete shim wiring after the contract change)

If the cleanest approach is to pass rendered zones into `TokenRenderer.update()` and expose provider-backed layout/presentation helpers through the renderer dependency, do that directly rather than inventing or preserving a second bespoke layout map.

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

- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/renderer-types.ts` (modify)
- `packages/runner/src/canvas/renderers/faction-colors.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/canvas/canvas-updater.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify only if renderer construction changes stay observable there)

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
5. `packages/runner/test/canvas/canvas-updater.test.ts` verifies the updated renderer contract receives the actual `RenderZone[]` data needed for layout resolution.
6. If renderer construction changes remain visible at the `GameCanvas` layer, `packages/runner/test/canvas/GameCanvas.test.ts` verifies `GameCanvas` no longer builds or passes a bespoke token-layout shim.
7. Existing suite: `pnpm -F @ludoforge/runner test -- token-renderer.test.ts canvas-updater.test.ts GameCanvas.test.ts`
8. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Identical non-selectable tokens still collapse into one rendered entry with a count badge.
2. Card fan and card stack layouts continue to work as before.
3. No FITL-specific token ids or zone ids appear in renderer branching logic.
4. Hit areas stay aligned with final rendered token geometry.
5. The renderer consumes resolved presentation/layout/badge metadata through provider-facing abstractions rather than reaching back into YAML-shaped objects.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — lane packing, badge style, scale/hit area behavior
2. `packages/runner/test/canvas/canvas-updater.test.ts` — renderer contract now receives actual zone metadata
3. `packages/runner/test/canvas/GameCanvas.test.ts` — only if needed for visible constructor/shim-removal behavior

### Commands

1. `pnpm -F @ludoforge/runner test -- token-renderer.test.ts canvas-updater.test.ts GameCanvas.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Outcome amended: 2026-03-18

- Completion date: 2026-03-18
- What actually changed:
  - `TokenRenderer.update()` now receives `RenderZone[]` through `canvas-updater`, so token placement can resolve zone category/layout metadata directly.
  - The renderer now consumes provider-backed token presentation, zone token layout, stack badge style, and existing card-zone role/shared-zone metadata through the renderer dependency instead of a `GameCanvas`-built shim.
  - The renderer dependency/module was renamed from `FactionColorProvider`/`faction-colors.ts` to `TokenRenderStyleProvider`/`token-render-style-provider.ts` so the abstraction name matches its full presentation responsibility.
  - Generic token placement now supports lane layouts with centered rows, below-previous-lane anchoring, scaled geometry-driven row width, scaled hit areas, and provider-driven stack badge styling.
  - `GameCanvas` no longer builds or passes `TokenLayoutConfig`.
- Deviations from original plan:
  - `GameCanvas.test.ts` did not need modification because the constructor-visible behavior stayed stable after the shim removal.
  - Card fan/stack preservation remained a renderer/provider concern via shared-zone and layout-role queries, rather than expanding the new zone-token-layout schema to represent fan layout.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- token-renderer.test.ts canvas-updater.test.ts GameCanvas.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
