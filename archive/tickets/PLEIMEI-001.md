# PLEIMEI-001: Plei Mei shaded zone filter no longer rejects South Vietnam march origins

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only (FITL GameSpecDoc YAML zone filter)
**Deps**: `archive/tickets/126FREOPEBIN-004.md`

## Problem

After spec 126 restructured NVA March trail-chain continuation from a flat `$chainSpaces` to per-origin `$chainSpaces@{$trailOrigin}`, the Plei Mei (card 59) shaded event's zone filter was rewritten to incorporate the new binding shape. The rewrite broke the "outside South Vietnam only" origin constraint.

The physical game card text reads: **"NVA free March from any spaces outside South Vietnam, then free Attack or Ambush any 1 space."** The zone filter must reject any march that moves pieces from South Vietnam origins.

Two tests fail:
1. `shaded rejects a free March that tries to move any piece from South Vietnam` — expects the march to throw, but it now succeeds
2. `suppresses shaded play when no legal free March origin exists outside South Vietnam` — expects the shaded event to be unviable when only South Vietnam NVA pieces exist, but it reports viable

The zone filter in `data/games/fire-in-the-lake/41-events/033-064.md` (starting ~line 4340) uses the `fitl-space-outside-south` condition macro to check piece origins, but the current formulation does not correctly reject marches where all pieces originate from South Vietnam. The equality constraint (total movers == movers from outside South Vietnam) appears structurally correct, but the `$continuingGuerrillas@{origin}->{dest}` / `$continuingTroops@{origin}->{dest}` terms in the chain component may be inflating or masking the count when no chain destinations exist.

## Assumption Reassessment (2026-04-12)

1. `data/games/fire-in-the-lake/41-events/033-064.md` contains card 59 Plei Mei at ~line 4223 — confirmed.
2. The zone filter uses `fitl-space-outside-south` condition macro — confirmed present in the YAML.
3. `packages/engine/test/integration/fitl-events-plei-mei.test.ts` tests 6 and 7 are the failing tests — confirmed by CI output.
4. The tests were already failing before the `$chainSpaces` test migration (confirmed by git stash comparison against HEAD) — these are spec 126 regressions, not introduced by the test fixes.
5. FITL Rules Section 5.1.1 confirms events override normal rules (e.g., march during Monsoon), but the origin restriction "from any spaces outside South Vietnam" is part of the event text and must be enforced.

## Architecture Check

1. This is a data-only fix in the FITL GameSpecDoc YAML zone filter — no engine code changes needed.
2. The zone filter logic lives entirely in the GameSpecDoc, preserving engine agnosticism (Foundation 1).
3. No backwards-compatibility shims — the zone filter will be corrected in place.

## What to Change

### 1. Debug and fix Plei Mei shaded zone filter

In `data/games/fire-in-the-lake/41-events/033-064.md`, the zone filter for the card-59 shaded March grant (~line 4340) must enforce that ALL pieces being moved originate from spaces outside South Vietnam. The equality check (total movers == movers from outside) must work correctly even when `$chainSpaces@{origin}` bindings are empty (no trail continuation).

Investigate whether:
- The `$continuingGuerrillas@{origin}->{dest}` aggregate sums produce non-zero when they should be zero (empty chain spaces)
- The `tokenZones` query correctly traces piece origins for the outside-South condition
- The overall equality `(movers + chain_movers) == (outside_movers + outside_chain_movers)` holds when chain terms are all zero

### 2. Verify the fix against both failing and passing test scenarios

The fix must:
- Reject a march moving `plei-inside-t1` from Quang Nam (South Vietnam) to Quang Tri
- Report shaded as unviable when only South Vietnam NVA pieces exist
- Continue to allow marches from Central Laos (outside South Vietnam) during Monsoon

## Files to Touch

- `data/games/fire-in-the-lake/41-events/033-064.md` (modify — card 59 shaded zone filter)

## Out of Scope

- Engine code changes
- Other event card zone filters
- Trail continuation binding restructure (already completed in spec 126)
- Plei Mei unshaded event

## Acceptance Criteria

### Tests That Must Pass

1. `shaded rejects a free March that tries to move any piece from South Vietnam` — must throw on South Vietnam origin
2. `suppresses shaded play when no legal free March origin exists outside South Vietnam` — must report unviable
3. `shaded grants a free Monsoon March from outside South Vietnam only, at zero cost, then a free exact-one-space Attack` — must continue passing
4. Existing suite: `pnpm -F @ludoforge/engine test:integration:fitl-events`

### Invariants

1. Zone filter must enforce the card text: "NVA free March from any spaces outside South Vietnam"
2. Engine agnosticism preserved — all logic in GameSpecDoc YAML

## Test Plan

### New/Modified Tests

1. No new tests needed — existing tests in `packages/engine/test/integration/fitl-events-plei-mei.test.ts` already cover the required behavior

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:integration:fitl-events`
2. `pnpm turbo typecheck`

## Outcome

- Completed: 2026-04-12
- Simplified the Plei Mei shaded March `zoneFilter` in `data/games/fire-in-the-lake/41-events/033-064.md` to validate only the initial mover-origin bindings. This removes the stale dependency on optional per-origin trail-continuation bindings that were deferring zone-filter evaluation when no chain continuation existed.
- The resulting filter now rejects any free March that includes South Vietnam origins, suppresses shaded play when no outside-South origin exists, and preserves the existing Monsoon-from-Central-Laos happy path.
- No engine, schema, or generated-artifact changes were required.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/integration/fitl-events-plei-mei.test.js`
  - `pnpm -F @ludoforge/engine test:integration:fitl-events`
  - `pnpm turbo typecheck`
