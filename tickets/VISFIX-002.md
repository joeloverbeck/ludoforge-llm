# VISFIX-002: Remove Token Count Badge from Zones

**Status**: PENDING
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

## Architecture Check

1. Setting `tokenCountBadge.visible = false` unconditionally is the simplest change — one line. The badge creation code remains in place (no dead code removal needed now; can be cleaned up later if desired).
2. This is purely a canvas rendering concern — no GameSpecDoc/GameDef/kernel boundaries affected.
3. No backwards-compatibility shims — the badge simply stops rendering.

## What to Change

### 1. Disable token count badge visibility in zone-renderer.ts

In `packages/runner/src/canvas/renderers/zone-renderer.ts`, replace the conditional visibility logic (lines 196–198):

```typescript
// Before:
const tokenTotal = zone.tokenIDs.length + zone.hiddenTokenCount;
visuals.tokenCountBadge.text = String(tokenTotal);
visuals.tokenCountBadge.visible = tokenTotal > 0;

// After:
visuals.tokenCountBadge.visible = false;
```

The `tokenTotal` computation and text assignment can be removed since the badge is always hidden.

## Files to Touch

- `packages/runner/src/canvas/renderers/zone-renderer.ts` (modify)

## Out of Scope

- Removing the `tokenCountBadge` display object creation entirely (minor dead code, cleanup deferred)
- Implementing stack visuals for hidden zones (that's VISFIX-005)
- Per-zone configurability of badge visibility

## Acceptance Criteria

### Tests That Must Pass

1. No zone displays a token count badge overlay after this change
2. Zones with tokens still render tokens correctly (only the badge is hidden)
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Zone renderer still correctly computes and renders all other zone visuals (name, markers, base shape)
2. `RenderZone.hiddenTokenCount` is still available in the render model for VISFIX-005

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/zone-renderer.test.ts` — if an existing test asserts `tokenCountBadge.visible === true`, update it to assert `false`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
