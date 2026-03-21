# 70BITFONLEA-001: Use Pre-Installed Bitmap Font Names in Table Overlay

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The table overlay surface and renderer use `fontFamily: 'monospace'` (the raw CSS font family) instead of the pre-installed bitmap font name `'ludoforge-label'`. When PixiJS BitmapText receives a fontFamily that doesn't match a pre-installed bitmap font, it auto-generates a new bitmap font from the CSS font on every render tick. This causes an unbounded memory leak where the console reports `"You have dynamically created N bitmap fonts"` with N climbing from 51 to 86+ during a single session.

## Assumption Reassessment (2026-03-21)

1. `project-table-overlay-surface.ts` line 56 defines `DEFAULT_FONT_FAMILY = 'monospace'` — **confirmed**.
2. `resolveTextStyle()` (line 179) and `resolveMarkerStyle()` (line 187) both return `fontFamily: DEFAULT_FONT_FAMILY` — **confirmed**.
3. `bitmap-font-registry.ts` exports `LABEL_FONT_NAME = 'ludoforge-label'` at line 16 — **confirmed**.
4. `table-overlay-renderer.ts` line ~49 creates the initial marker label with `fontFamily: 'monospace'` — **confirmed** (via `createManagedBitmapText` call).
5. `table-overlay-renderer.ts` lines 110–114 map text specs with `fontFamily: item.style.fontFamily` which resolves to `'monospace'` — **confirmed** at lines 110–113.
6. Existing tests already encode the old overlay font family in projected-node expectations:
   - `packages/runner/test/presentation/project-table-overlay-surface.test.ts`
   - `packages/runner/test/presentation/presentation-scene.test.ts`
   The ticket must update these tests alongside renderer-focused coverage.
7. The current runner tests do **not** directly assert the hardcoded `'monospace'` marker creation path in `table-overlay-renderer.test.ts`; that file needs a new explicit assertion rather than a simple expectation swap.

## Architecture Check

1. The production fix remains intentionally small: replace raw CSS font-family values in the table-overlay BitmapText path with the existing registry constant `LABEL_FONT_NAME`. The pre-installed font name is already used by zone renderers, token renderers, and hidden-zone-stack — table overlay is the outlier.
2. Font names are a presentation-layer concern; no GameSpecDoc or GameDef boundaries are affected.
3. No backwards-compatibility aliases introduced — the old value `'monospace'` is removed from the table-overlay BitmapText path and all affected tests are updated to the new single source of truth.
4. `project-table-overlay-surface.ts` should not keep its own duplicated string literal for a bitmap font identifier. Importing `LABEL_FONT_NAME` is architecturally cleaner than maintaining another presentation constant that can drift from the registry.

## What to Change

### 1. Replace `DEFAULT_FONT_FAMILY` constant in table overlay surface

**File**: `packages/runner/src/presentation/project-table-overlay-surface.ts`

- Import `LABEL_FONT_NAME` from `'../canvas/text/bitmap-font-registry'`.
- Change line 56 from `const DEFAULT_FONT_FAMILY = 'monospace'` to `const DEFAULT_FONT_FAMILY = LABEL_FONT_NAME`.
- `resolveTextStyle()` and `resolveMarkerStyle()` will automatically pick up the correct value since they reference `DEFAULT_FONT_FAMILY`.

### 2. Replace hardcoded `'monospace'` in initial marker label creation

**File**: `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`

- Import `LABEL_FONT_NAME` from `'../text/bitmap-font-registry'`.
- Change the initial marker label creation style from `fontFamily: 'monospace'` to `fontFamily: LABEL_FONT_NAME`.

## Files to Touch

- `packages/runner/src/presentation/project-table-overlay-surface.ts` (modify)
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (modify — add explicit assertion that marker labels use `LABEL_FONT_NAME`)
- `packages/runner/test/presentation/project-table-overlay-surface.test.ts` (modify — update projected overlay expectations to `LABEL_FONT_NAME`)
- `packages/runner/test/presentation/presentation-scene.test.ts` (modify — update overlay fixture font families to `LABEL_FONT_NAME` so scene-layer tests reflect the real overlay contract)

## Out of Scope

- Style object caching in `updateMarkerSlot()` — that is 70BITFONLEA-002.
- Any changes to `bitmap-font-registry.ts` itself — the registry is correct as-is.
- Changes to zone renderers, token renderers, or hidden-zone-stack — they already use `LABEL_FONT_NAME`.
- Game store initialization performance (Pillar 2) — that is 70BITFONLEA-003.
- Any engine (`packages/engine/`) changes.

## Acceptance Criteria

### Tests That Must Pass

1. **Modified**: projected text overlay nodes from `projectTableOverlaySurface()` carry `fontFamily: LABEL_FONT_NAME`, not `'monospace'`.
2. **Modified**: projected marker overlay nodes from `projectTableOverlaySurface()` carry `fontFamily: LABEL_FONT_NAME`, not `'monospace'`.
3. **New**: Initial marker label in `table-overlay-renderer.ts` is created with `fontFamily: LABEL_FONT_NAME`.
4. **Existing**: All tests in `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` pass.
5. **Existing**: All tests in `packages/runner/test/presentation/project-table-overlay-surface.test.ts` pass.
6. **Existing**: All tests in `packages/runner/test/canvas/text/bitmap-font-registry.test.ts` pass.
7. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `LABEL_FONT_NAME` is the single source of truth for the plain bitmap font name — no new string literals `'ludoforge-label'` outside the registry.
2. No raw CSS font family strings (`'monospace'`, `'sans-serif'`, etc.) appear in table overlay code paths that feed into BitmapText `fontFamily`.
3. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/project-table-overlay-surface.test.ts` — assert projected overlay nodes expose `LABEL_FONT_NAME` in both text and marker styles.
2. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` — add explicit assertion that the initial marker label uses `LABEL_FONT_NAME`.
3. `packages/runner/test/presentation/presentation-scene.test.ts` — update overlay fixtures to use `LABEL_FONT_NAME` so downstream scene tests mirror the production overlay contract.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Updated `project-table-overlay-surface.ts` to source overlay bitmap font families from `LABEL_FONT_NAME`.
  - Updated `table-overlay-renderer.ts` initial marker label creation to use `LABEL_FONT_NAME`.
  - Updated overlay presentation and renderer tests to assert the pre-installed bitmap font name contract instead of the old raw CSS font family.
- Deviations from original plan:
  - The ticket was corrected before implementation to reflect the actual affected tests and acceptance boundaries.
  - `presentation-scene.test.ts` also needed fixture updates because it encoded the old overlay font contract.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
