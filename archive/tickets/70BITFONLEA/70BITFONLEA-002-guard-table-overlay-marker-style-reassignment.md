# 70BITFONLEA-002: Guard Table Overlay Marker Style Reassignment

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/70BITFONLEA/70BITFONLEA-001-use-preinstalled-font-names-in-table-overlay.md, archive/tickets/70BITFONLEA/70BITFONLEA-004-replace-bitmaptext-fontfamily-strings-with-typed-font-contract.md

## Problem

`packages/runner/src/canvas/renderers/table-overlay-renderer.ts` still reassigns `slot.label.style` on every marker update, even when the rendered marker style has not changed. The table overlay path now correctly uses the typed bitmap-font contract from `70BITFONLEA-004`, so this ticket is no longer about fixing the wrong font identifier. It is about eliminating redundant BitmapText style churn in the remaining unconditional reassignment path.

That churn is architecturally weaker than the rest of the renderer:

- it rebuilds a fresh Pixi style object every tick for unchanged marker labels,
- it needlessly asks BitmapText to process a style update when only position or badge graphics changed,
- and it leaves an avoidable hot-path inefficiency in a renderer that otherwise already keys and reuses display objects.

## Assumption Reassessment (2026-03-21)

1. `updateMarkerSlot()` still assigns `slot.label.style = toPixiBitmapTextStyle(...)` unconditionally on every marker update — **confirmed**.
2. The relevant overlay marker style contract is already `fontName`, not `fontFamily` — **confirmed** in `project-table-overlay-surface.ts` and `bitmap-text-runtime.ts`.
3. The style fields this renderer maps into BitmapText are `fill`, `fontSize`, and `fontName` (which becomes Pixi `fontFamily`) — **confirmed**.
4. The current table-overlay renderer tests use mocked Pixi display objects and do **not** exercise real `BitmapFontManager.install` behavior — **confirmed**. A unit test that spies on `BitmapFontManager.install` from this file would not meaningfully prove the renderer fix.
5. The existing keyed-reconciliation tests already prove identity reuse for overlay text nodes and marker containers, but they do **not** yet prove that marker label style identity is preserved across equivalent updates — **confirmed**.

## Architecture Reassessment

1. Guarding the assignment is better than the current architecture. The renderer already reuses marker containers; preserving the existing label style object when style inputs are unchanged is the same principle applied consistently to BitmapText styling.
2. The fix should stay local to `table-overlay-renderer.ts`. Introducing a broader style-cache abstraction for one three-field comparison would add indirection without improving extensibility.
3. The comparison should happen on the renderer-owned semantic inputs (`fill`, `fontSize`, `fontName`) rather than by comparing whole generated Pixi style objects. That keeps the guard robust if `toPixiBitmapTextStyle()` changes object shape later.
4. No compatibility paths or alias fields should be added. This ticket should reinforce the current `fontName` architecture, not preserve older `fontFamily` terminology anywhere in runner-owned contracts.

## What to Change

### 1. Guard marker-label style reassignment in `updateMarkerSlot()`

**File**: `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`

Before assigning `slot.label.style`, compare the current Pixi style payload against the next marker style values:

- current `fill` vs next `resolved.style.textColor`
- current `fontSize` vs next `resolved.style.fontSize`
- current `fontFamily` vs next `resolved.style.fontName`

Only rebuild and reassign the Pixi style object when at least one of those values changes.

### 2. Add renderer-focused regression coverage

**File**: `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`

Add tests that prove the renderer preserves marker-label style identity across equivalent updates and does reassign when a tracked style field changes. These tests should operate on the mocked Pixi objects already used by the suite.

## Files to Touch

- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (modify)

## Out of Scope

- Changing bitmap font names or overlay font selection — already completed in `70BITFONLEA-001`.
- Reintroducing or preserving raw `fontFamily` runner contracts — removed by `70BITFONLEA-004`.
- Changing text-node reconciliation in `createKeyedBitmapTextReconciler()` — that is a broader shared-runtime concern and is not needed to fix the remaining marker-specific churn.
- Any changes to `project-table-overlay-surface.ts`, `bitmap-text-runtime.ts`, or `bitmap-font-registry.ts`.
- Game-store initialization performance work from `70BITFONLEA-003`.
- Any engine (`packages/engine/`) changes.

## Acceptance Criteria

### Tests That Must Pass

1. **New**: Updating the same marker twice with identical `textColor`, `fontSize`, and `fontName` keeps the same `slot.label.style` object reference.
2. **New**: Changing marker `textColor` causes `slot.label.style` to be reassigned.
3. **New**: Changing marker `fontSize` causes `slot.label.style` to be reassigned.
4. **New**: Changing marker `fontName` causes `slot.label.style` to be reassigned.
5. **Existing**: All tests in `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` pass.
6. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Marker label style reassignment is driven only by changes to `fill`, `fontSize`, or bitmap `fontName`.
2. Marker label text remains updated every cycle; only style reassignment is guarded.
3. Marker badge geometry and color remain redrawn every cycle.
4. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`
   - "keeps the same marker label style object when style inputs are unchanged"
   - "reassigns marker label style when text color changes"
   - "reassigns marker label style when font size changes"
   - "reassigns marker label style when font name changes"

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Corrected the ticket before implementation so it matches the current `fontName`-based BitmapText architecture and the real test harness.
  - Updated `table-overlay-renderer.ts` to preserve the existing marker label style object when `textColor`, `fontSize`, and `fontName` are unchanged.
  - Added renderer regression tests covering unchanged marker style reuse plus reassignment on color, size, and font changes.
- Deviations from original plan:
  - Removed the proposed `BitmapFontManager.install` regression assertion because the existing unit harness mocks Pixi display objects and cannot prove that behavior meaningfully from this file.
  - Narrowed scope to the marker-specific renderer hot path; no shared runtime or overlay-surface changes were needed after reassessing the code.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
