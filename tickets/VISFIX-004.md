# VISFIX-004: Increase Mini Card Size in Hand Panel

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The mini card thumbnails in the hand panel are 36x52 px, which is too small to read card values (rank/suit) comfortably, especially for Texas Hold'em where players need to quickly identify their hole cards. Increasing to 56x80 px provides better legibility while still fitting within the hand panel layout.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/MiniCard.tsx` defines `MINI_CARD_WIDTH = 36` and `MINI_CARD_HEIGHT = 52` (lines 13–14). These constants drive the `widthScale`/`heightScale` computation for field positioning.
2. `packages/runner/src/ui/MiniCard.module.css` hardcodes `.card { width: 36px; height: 52px; }` (lines 3–4).
3. Both the JS constants and CSS dimensions must be updated together to stay in sync. The `toFieldStyle` function scales field positions proportionally via `widthScale`/`heightScale`, so increasing dimensions automatically scales field text positions correctly.

## Architecture Check

1. Updating both the JS constants and CSS dimensions is the correct approach — the JS constants drive layout math and the CSS drives actual rendering. No alternative (e.g. CSS-only scaling via `transform: scale()`) would keep the field positioning logic correct.
2. This is purely a UI presentation change — no engine, GameSpecDoc, or GameDef boundaries affected.
3. No backwards-compatibility concerns — mini card size is not persisted or referenced elsewhere.

## What to Change

### 1. Update JS constants in MiniCard.tsx

In `packages/runner/src/ui/MiniCard.tsx`:

```typescript
// Before:
const MINI_CARD_WIDTH = 36;
const MINI_CARD_HEIGHT = 52;

// After:
const MINI_CARD_WIDTH = 56;
const MINI_CARD_HEIGHT = 80;
```

### 2. Update CSS dimensions in MiniCard.module.css

In `packages/runner/src/ui/MiniCard.module.css`:

```css
/* Before: */
.card {
  width: 36px;
  height: 52px;
}

/* After: */
.card {
  width: 56px;
  height: 80px;
}
```

## Files to Touch

- `packages/runner/src/ui/MiniCard.tsx` (modify)
- `packages/runner/src/ui/MiniCard.module.css` (modify)

## Out of Scope

- Making card size configurable via visual config
- Adding zoom/resize controls to the hand panel
- Redesigning the card field layout or typography
- Adjusting border-radius or other card styling

## Acceptance Criteria

### Tests That Must Pass

1. Mini cards in the hand panel render at 56x80 px
2. Card field text (rank, suit) is legible at the new size
3. Face-down cards render correctly at the new size
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `widthScale`/`heightScale` computations remain correct (field positions scale proportionally)
2. Hand panel layout does not overflow or break with larger cards

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/MiniCard.test.tsx` — if existing tests assert specific pixel dimensions, update expected values from 36x52 to 56x80

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
