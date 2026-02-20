# VISFIX-004: Increase Mini Card Size in Hand Panel

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The mini card thumbnails in the hand panel are 36x52 px, which is too small to read card values (rank/suit) comfortably, especially for Texas Hold'em where players need to quickly identify their hole cards. Increasing to 56x80 px improves legibility.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/MiniCard.tsx` defines `MINI_CARD_WIDTH = 36` and `MINI_CARD_HEIGHT = 52`; these constants drive field placement scaling (`widthScale`/`heightScale`).
2. `packages/runner/src/ui/MiniCard.module.css` hardcodes `.card { width: 36px; height: 52px; }`, duplicating the same values in CSS.
3. The referenced test files in the previous draft were incorrect:
- Actual files are `packages/runner/test/ui/MiniCard.test.ts` and `packages/runner/test/ui/PlayerHandPanel.test.ts`.
4. Existing tests validate face-up/face-down rendering and template field output, but they do not assert rendered mini card pixel dimensions.

## Architecture Reassessment

1. The existing proposal (changing both TS constants and CSS dimensions) works functionally, but it keeps duplicated source-of-truth for card size.
2. A cleaner architecture is to keep width/height authoritative in `MiniCard.tsx` (where scale math already lives) and apply rendered dimensions from that source (inline style or CSS variable wiring), avoiding drift between TS and CSS.
3. This remains a UI-only change with no engine/GameSpecDoc boundary impact.

## Updated Scope

1. Increase mini card dimensions from 36x52 to 56x80.
2. Remove duplicated size authority by deriving rendered card width/height from the TS constants used for field scaling.
3. Add/strengthen tests to enforce size and scaling behavior so regressions are caught.

## What to Change

### 1. Update mini card size constants

In `packages/runner/src/ui/MiniCard.tsx`:

```typescript
const MINI_CARD_WIDTH = 56;
const MINI_CARD_HEIGHT = 80;
```

### 2. Make sizing single-source-of-truth

In `packages/runner/src/ui/MiniCard.tsx` and `packages/runner/src/ui/MiniCard.module.css`:

- Stop hardcoding width/height in two places.
- Render card width/height from TS constants (inline style or CSS variable wiring), while keeping structural card styles in CSS.

### 3. Strengthen tests

In `packages/runner/test/ui/MiniCard.test.ts`:

- Add assertions that rendered mini card uses 56x80 dimensions.
- Add assertions that field positioning scales consistently with the new size (e.g., expected `left`/`top` for a known template field).

## Files to Touch

- `packages/runner/src/ui/MiniCard.tsx` (modify)
- `packages/runner/src/ui/MiniCard.module.css` (modify)
- `packages/runner/test/ui/MiniCard.test.ts` (modify)

## Out of Scope

- Making card size configurable via visual config
- Adding zoom/resize controls to the hand panel
- Redesigning the card field layout or typography

## Acceptance Criteria

### Tests That Must Pass

1. Mini cards render at 56x80.
2. Face-up and face-down mini cards still render correctly.
3. Field positions remain proportionally scaled from template coordinates.
4. Existing suite: `pnpm -F @ludoforge/runner test`.
5. Quality gates: `pnpm -F @ludoforge/runner typecheck` and `pnpm -F @ludoforge/runner lint`.

### Invariants

1. Width/height values used for field scaling and rendered card dimensions stay in sync by construction.
2. Hand panel layout remains functional with larger cards.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/MiniCard.test.ts`
- Add explicit size assertions for `56px` by `80px`.
- Add explicit scaled-position assertion for one deterministic field style.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- Actually changed:
  - Increased mini card dimensions to 56x80 in `packages/runner/src/ui/MiniCard.tsx`.
  - Removed duplicated width/height declarations from `packages/runner/src/ui/MiniCard.module.css`.
  - Added inline width/height style binding from TS constants so render size and scaling math share one source-of-truth.
  - Strengthened `packages/runner/test/ui/MiniCard.test.ts` with explicit size assertions and deterministic scaled-coordinate assertions.
- Deviations from original plan:
  - Implemented a small architectural cleanup (single-source sizing) instead of only updating two duplicated constants.
  - Corrected test path assumptions from `.tsx` to `.ts`.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
