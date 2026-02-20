# VISFIX-003: Reposition Bet/Dealer Overlays Below Player Zones

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None
**Runner Changes**: Texas visual config + runner tests
**Deps**: None

## Problem

The per-player `Bet` value and `D` (dealer) marker overlays render above player zones, where they can collide with cards in a hand zone. Repositioning both overlays below the seat anchor improves readability and preserves card visibility.

## Assumption Reassessment (2026-02-20)

1. `data/games/texas-holdem/visual-config.yaml` currently defines:
   - `perPlayerVar` (`streetBet`) with `offsetY: -40` (above seat anchor)
   - `marker` (`dealerSeat`) with `offsetX: -60`, `offsetY: -20` (above-left of seat anchor)
2. `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` is config-driven and already applies `offsetX`/`offsetY` to resolved anchor positions.
3. Positive `offsetY` moves overlays downward in the current Pixi coordinate system.
4. Existing tests already assert Texas overlay config values in `packages/runner/test/config/visual-config-files.test.ts`; therefore this is not "visual inspection only" and test updates are required.

## Architecture Reassessment

1. Keeping overlay placement in `visual-config.yaml` is the correct architecture. This preserves a clean, data-driven renderer and avoids game-specific branching in runtime code.
2. Updating tests that encode Texas visual config is required to keep deterministic configuration coverage.
3. No aliasing/back-compat layer is needed: Texas config is the source of truth and tests should track it directly.

## What to Change

### 1. Update Texas overlay offsets

In `data/games/texas-holdem/visual-config.yaml`:

```yaml
# perPlayerVar (streetBet) — move from above to below seat anchor
offsetY: -40  ->  offsetY: 75

# marker (dealerSeat) — keep left bias, move below seat anchor
offsetX: -60  ->  offsetX: -50
offsetY: -20  ->  offsetY: 75
```

### 2. Update tests that assert Texas overlay config

- Update `packages/runner/test/config/visual-config-files.test.ts` to match new overlay values.
- Add/strengthen assertions so the intent is explicit:
  - per-player bet overlay is below seats (`offsetY > 0`)
  - dealer marker remains left-biased (`offsetX < 0`) and below seats (`offsetY > 0`)

## Files to Touch

- `data/games/texas-holdem/visual-config.yaml` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)

## Out of Scope

- Changing `table-overlay-renderer.ts` behavior
- Adding new overlay item kinds
- Overlay positioning for non-Texas games
- Dynamic collision-avoidance logic

## Acceptance Criteria

### Tests That Must Pass

1. Texas bet overlay config uses a positive Y offset and renders below seat anchor.
2. Texas dealer marker config uses a positive Y offset and negative X offset (below-left anchor).
3. `pnpm -F @ludoforge/runner test` passes.
4. `pnpm -F @ludoforge/runner lint` and `pnpm -F @ludoforge/runner typecheck` pass.

### Invariants

1. `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` remains unchanged.
2. No engine/kernel files are modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts`
   - Update expected Texas `tableOverlays` values.
   - Add assertions for below-seat and left-bias overlay intent.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Updated Texas table overlay offsets in `data/games/texas-holdem/visual-config.yaml`:
    - `streetBet.offsetY` from `-40` to `75`
    - `dealerSeat.offsetX` from `-60` to `-50`
    - `dealerSeat.offsetY` from `-20` to `75`
  - Updated `packages/runner/test/config/visual-config-files.test.ts` expected Texas overlay values.
  - Added explicit overlay intent assertions (`offsetY > 0` for below-seat placement, `offsetX < 0` for dealer left-bias).
- Deviations from original plan:
  - The original ticket claimed no automated test changes were needed. This was corrected and implemented because runner config tests hard-code overlay values.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed (125 files, 983 tests).
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
