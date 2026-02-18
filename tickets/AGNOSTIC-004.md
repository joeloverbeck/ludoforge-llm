# AGNOSTIC-004: End-to-End Runner Support for Zone Metadata and Visual Hints

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Runner + optional engine wiring
**Deps**: AGNOSTIC-002

## Problem

Runner types expose zone metadata, but current derivation sets `metadata: {}` for all zones and canvas equality ignores metadata changes. This blocks a generic rendering path for data-driven board visuals.

Affected paths include:
- `packages/runner/src/model/derive-render-model.ts`
- `packages/runner/src/canvas/canvas-equality.ts`
- `packages/runner/src/canvas/renderers/zone-renderer.ts`

## What Must Change

1. Populate `RenderZone` metadata from game-agnostic zone fields (`category`, `attributes`, `visual`) during render-model derivation.

2. Include metadata in zone visual equality checks so metadata-only changes trigger renderer updates.

3. Update zone renderer to consume generic visual hints (`shape`, `width`, `height`, `color`, `label`) from metadata rather than hardcoding map assumptions.

4. Keep renderer behavior generic: no FITL-specific fields or labels in renderer code.

5. Add tests proving metadata propagation and repaint behavior.

## Invariants

1. Render model preserves zone metadata from `GameDef` for every zone.
2. Metadata-only zone changes are not dropped by `CanvasUpdater` equality gating.
3. Renderer defaults remain stable when visual metadata is absent.
4. Renderer can apply visual hints without introducing game-specific branches.
5. Mobile/desktop rendering behavior remains functional with existing zone layouts.

## Tests That Should Pass

1. `packages/runner/test/model/derive-render-model-zones.test.ts`
- New case: zone category/attributes/visual appear in derived zone metadata.

2. `packages/runner/test/canvas/canvas-updater.test.ts`
- New case: metadata-only zone change triggers `zoneRenderer.update`.

3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
- New cases for visual hint usage (`shape`, `color`, `label`) and fallback behavior.

4. `packages/runner/test/canvas/renderers/renderer-types.test.ts`
- Update interface expectations if renderer inputs/types change.

5. `pnpm -F @ludoforge/runner test`
