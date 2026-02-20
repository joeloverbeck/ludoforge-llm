# VISFIX-003: Reposition Bet/Dealer Overlays Below Player Zones

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data-only
**Deps**: None

## Problem

The per-player "Bet" value and "D" (dealer) marker overlay labels render above/on top of player zones, visually colliding with card tokens in the zone. Moving them below the zone avoids overlap and improves readability.

## Assumption Reassessment (2026-02-20)

1. `data/games/texas-holdem/visual-config.yaml` lines 113–127 define the overlay items:
   - `perPlayerVar` (streetBet): `offsetY: -40` (above zone)
   - `marker` (dealerSeat): `offsetX: -60`, `offsetY: -20` (above-left of zone)
2. `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` reads these offset values from the visual config and positions labels accordingly — no code changes needed, just YAML data changes.
3. The table-overlay-renderer resolves `position: playerSeat` to the zone center and applies `offsetX`/`offsetY` as pixel deltas. Positive Y moves downward in PixiJS coordinate space.

## Architecture Check

1. This is a config-driven approach — the renderer is already designed to read offset values from YAML. Changing data is cleaner than hardcoding positional overrides in renderer code.
2. Only game-specific data files change. No engine, kernel, or runtime code is modified.
3. No backwards-compatibility concerns — visual config values are game-specific and not versioned.

## What to Change

### 1. Update overlay offsets in visual-config.yaml

In `data/games/texas-holdem/visual-config.yaml`:

```yaml
# perPlayerVar (streetBet) — move from above zone to below
offsetY: -40  →  offsetY: 75

# marker (dealerSeat) — move from above-left to below-left
offsetX: -60  →  offsetX: -50
offsetY: -20  →  offsetY: 75
```

## Files to Touch

- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Changing the table-overlay-renderer code
- Adding new overlay item types
- Overlay positioning for FITL or other games
- Dynamic collision avoidance for overlays

## Acceptance Criteria

### Tests That Must Pass

1. Bet labels render below their respective player zones, not overlapping cards
2. Dealer marker ("D") renders below-left of the player zone
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `table-overlay-renderer.ts` code remains unchanged
2. Other visual-config sections (cardTemplates, boardLayout, factionColors) are unmodified

## Test Plan

### New/Modified Tests

1. No new automated tests — this is a data-only YAML change validated by visual inspection

### Commands

1. `pnpm -F @ludoforge/runner dev` — visual inspection with Texas Hold'em
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
