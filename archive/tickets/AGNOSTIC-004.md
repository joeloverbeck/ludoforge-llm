# AGNOSTIC-004: End-to-End Runner Support for Zone Metadata and Visual Hints

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Runner only
**Deps**: AGNOSTIC-002

## Reassessment (2026-02-18)

The original ticket assumptions are partially stale:

1. Zone visual hints are already propagated into typed render fields:
- `deriveRenderModel()` already maps `zoneDef.category`, `zoneDef.attributes`, and `zoneDef.visual` to `RenderZone`.
- `zone-renderer` already consumes `RenderZone.visual` generically (`shape`, `width`, `height`, `color`, `label`) and does not hardcode FITL map IDs.

2. Actual gap: `RenderZone.metadata` is currently always `{}` in derivation.
- This makes `metadata` a dead field and drops potentially useful generic zone descriptors for metadata-driven UI surfaces.

3. Current equality behavior intentionally ignores metadata-only changes in canvas gating.
- This is acceptable only if metadata is non-visual/non-interaction and all visual drivers stay in typed fields (`visual`, `category`, etc.).

## Updated Architectural Decision

Keep `RenderZone.visual` / `category` / `attributes` as first-class typed fields for rendering and interaction.  
Do **not** move renderer contracts into `metadata` (would weaken type-safety and create duplicate-source ambiguity).

Use `RenderZone.metadata` as an extensibility projection for generic, non-render-critical zone descriptors, sourced from `GameDef` in a deterministic way.

## Problem

Runner types expose zone metadata, but current derivation sets `metadata: {}` for all zones. This leaves no usable metadata channel for generic UI consumers and future extensibility.

Affected paths include:
- `packages/runner/src/model/derive-render-model.ts`
- `packages/runner/src/canvas/canvas-equality.ts`

## What Must Change

1. Populate `RenderZone.metadata` from game-agnostic zone descriptors during render-model derivation.
- Include at least `zoneKind`.
- Include `category`/`attributes`/`visual` snapshots in metadata only as deterministic projections (not as alternate render contract).

2. Keep renderer path typed and generic (`RenderZone.visual` remains the source for canvas visuals). No game-specific branches.

3. Reassess and codify canvas equality policy:
- Metadata-only changes should remain ignored by canvas visual gating unless metadata is promoted to visual contract.
- Add explicit tests documenting this behavior so it is intentional, not accidental.

4. Add tests proving metadata projection and stabilization/equality behavior.

## Invariants

1. Render model preserves deterministic zone metadata projection for every zone.
2. Typed visual fields (`visual`, `category`, `attributes`) remain canonical for renderer behavior.
3. Metadata-only zone changes do not trigger canvas re-render unless metadata participates in visual contract.
4. Renderer defaults remain stable when visual hints are absent.
5. Runner behavior remains game-agnostic (no game-specific renderer branches).

## Tests That Should Pass

1. `packages/runner/test/model/derive-render-model-zones.test.ts`
- New case: metadata includes projected `zoneKind` and mirrored generic descriptors.
- New case: metadata projection participates in structural-sharing invalidation when changed.

2. `packages/runner/test/canvas/canvas-updater.test.ts`
- Update case to assert metadata-only zone changes do **not** trigger `zoneRenderer.update` under current visual contract.

3. `packages/runner/test/canvas/canvas-equality.test.ts`
- Add/adjust case documenting metadata-only equality policy.

4. `pnpm -F @ludoforge/runner test`

## Outcome

**Completion Date**: 2026-02-18

### What Changed

- Reassessed and corrected outdated assumptions in this ticket before implementation.
- Implemented deterministic zone metadata projection in runner derivation:
  - `RenderZone.metadata` now includes `zoneKind` and, when present, projected `category`, `attributes`, and `visual`.
- Preserved the typed renderer contract:
  - Zone visuals continue to come from `RenderZone.visual`, not from ad-hoc metadata keys.
- Kept canvas visual equality policy intentionally metadata-agnostic for metadata-only changes.

### Test Coverage Added/Adjusted

- Updated `packages/runner/test/model/derive-render-model-zones.test.ts`:
  - Added metadata projection assertions (including `zoneKind` and descriptor projection).
  - Added stabilization regression where metadata-only projection change (via `zoneKind`) replaces zone reference.
- Updated `packages/runner/test/canvas/canvas-equality.test.ts`:
  - Added nested metadata-only change case to codify visual equality policy.
- Updated `packages/runner/test/canvas/canvas-updater.test.ts`:
  - Clarified metadata-only gating expectation in test naming.

### Deviations From Original Plan

- The original plan proposed moving renderer visual hint consumption to metadata and repainting on metadata-only changes.
- This was rejected as architecturally weaker:
  - it would duplicate/blur render contracts across typed fields and metadata;
  - it would reduce type-safety and increase accidental coupling.
- Final implementation keeps rendering contracts explicit and typed while still making metadata usable for non-render consumers.

### Verification

- `pnpm -F @ludoforge/runner test` ✅
- `pnpm -F @ludoforge/runner lint` ✅
- `pnpm -F @ludoforge/runner typecheck` ✅
