# VISFIX-002: Remove Token Count Badge from Zones

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Every zone displays a token count badge (e.g. "3") overlaid on the zone rectangle. For games like Texas Hold'em where tokens represent cards, this is visual clutter — the cards themselves are visible, making the count redundant. For hidden zones (deck, burn, muck), a separate stack renderer (VISFIX-005) will provide a more appropriate visual representation with its own count badge.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/canvas/renderers/zone-renderer.ts` lines 196–198 compute `tokenTotal` and set `tokenCountBadge.visible = tokenTotal > 0`.
2. The `tokenCountBadge` is a `Text` display object created in the zone visual container and positioned by `layoutZoneLabels`.
3. VISFIX-005 will introduce a dedicated stack renderer for hidden zones with its own count display, so removing the zone-level badge avoids duplicate count information.
4. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` currently asserts that the badge text/visibility updates; those assertions are now stale against the desired architecture.

## Architecture Check

1. Setting `tokenCountBadge.visible = false` unconditionally is a minimal patch, but it leaves dead badge state, layout, and update logic inside the zone renderer.
2. The cleaner long-term architecture is to remove zone badge plumbing entirely from `zone-renderer.ts` now.
3. This is purely a canvas rendering concern — no GameSpecDoc/GameDef/kernel boundaries affected.
4. No backwards-compatibility shims — tests and child-index assumptions should be updated directly.

## Scope Correction

This ticket is updated to remove the zone-level token badge pipeline entirely (not only hide it).

## What to Change

### 1. Remove token count badge from zone-renderer.ts

In `packages/runner/src/canvas/renderers/zone-renderer.ts`:

1. Remove `tokenCountBadge` from `ZoneVisualElements`.
2. Remove badge creation in `createZoneVisualElements`.
3. Remove `visuals.tokenCountBadge` from `zoneContainer.addChild(...)`.
4. Remove token count update logic in `updateZoneVisuals`.
5. Remove badge positioning from `layoutZoneLabels`.

`RenderZone.hiddenTokenCount` remains in the model for VISFIX-005.

### 2. Update zone renderer tests to match new container structure

In `packages/runner/test/canvas/renderers/zone-renderer.test.ts`:

1. Replace badge-specific assertions with marker behavior assertions.
2. Update child-index references that currently assume a badge child at index `2`.

## Files to Touch

- `packages/runner/src/canvas/renderers/zone-renderer.ts` (modify)
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` (modify)

## Out of Scope

- Implementing stack visuals for hidden zones (that's VISFIX-005)
- Per-zone configurability of badge visibility

## Acceptance Criteria

### Tests That Must Pass

1. Zone renderer no longer creates or displays a token count badge overlay.
2. Marker rendering still works and visibility toggles correctly.
3. Zones with tokens still render normally; only zone badge UI is removed.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Zone renderer still correctly computes and renders all other zone visuals (name, markers, base shape)
2. `RenderZone.hiddenTokenCount` is still available in the render model for VISFIX-005

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` — remove badge text/visibility assertions and update expectations for the new child layout.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- Actual changes:
  - Removed zone token badge plumbing from `packages/runner/src/canvas/renderers/zone-renderer.ts` (`ZoneVisualElements`, child creation, update logic, and layout positioning).
  - Updated `packages/runner/test/canvas/renderers/zone-renderer.test.ts` to reflect the new child structure and assert marker behavior without a badge.
- Deviations from original plan:
  - Original plan only hid the badge; implementation removed badge renderer plumbing entirely for cleaner architecture.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
