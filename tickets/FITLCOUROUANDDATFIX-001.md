# FITLCOUROUANDDATFIX-001: Fix totalEcon Data Error (10 → 15)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only YAML fix
**Deps**: None

## Problem

All three FITL scenarios (`fitl-scenario-full`, `fitl-scenario-short`, `fitl-scenario-medium`) set `totalEcon: 10` in their `initialTrackValues`. The rules (Section 2.1, Section 6.2.3) specify Total Econ = 15 for all scenarios. Counting econ values across all 17 LoCs in `fitl-map-production` confirms the correct total is 15.

This is a data error that will cause incorrect ARVN earnings calculations once the Coup Round Resources phase is implemented.

## Assumption Reassessment (2026-02-23)

1. `totalEcon` is defined as a global track in `40-content-data-assets.md:791` with `scope: global`, `min: 0`, `max: 75`.
2. The `initialTrackValues` for all 3 scenarios set `totalEcon: 10` (lines ~1091, ~1429, ~1813).
3. The `rvn-leader-pacification-cost` macro in `20-macros.md` and the US ARVN resource spend constraint already reference `totalEcon` — both will benefit from the corrected value.
4. No engine code references `totalEcon` directly — it's purely a game-data variable.

## Architecture Check

1. This is a simple data value correction — no structural changes.
2. The fix is entirely within `GameSpecDoc` YAML data. No engine/kernel changes needed.
3. No backwards-compatibility concerns.

## What to Change

### 1. Fix totalEcon initial values in all three scenarios

In `data/games/fire-in-the-lake/40-content-data-assets.md`, change `totalEcon` from 10 to 15 in the `initialTrackValues` of:

- `fitl-scenario-short` (~line 1091): `value: 10` → `value: 15`
- `fitl-scenario-medium` (~line 1429): `value: 10` → `value: 15`
- `fitl-scenario-full` (~line 1813): `value: 10` → `value: 15`

### 2. Regenerate runner bootstrap fixture

After the data fix, regenerate `packages/runner/src/bootstrap/fitl-game-def.json` so the runner stays synchronized with the production spec.

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — 3 line changes)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify — regenerate)

## Out of Scope

- Coup Round phase implementation (later tickets)
- Any engine/kernel code changes
- Changes to `10-vocabulary.md`, `20-macros.md`, `30-rules-actions.md`, or `90-terminal.md`
- Adding new global variables

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compilation succeeds for all 3 scenarios without errors.
2. Compiled GameDef for each scenario has `totalEcon` initial value = 15 in its track data.
3. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass, zero regressions.
4. Runner fixture check: `pnpm -F @ludoforge/runner bootstrap:fixtures:check` — passes after regeneration.
5. `pnpm turbo typecheck` — passes.

### Invariants

1. Only the `initialTrackValues` entries for `totalEcon` change — no other scenario data is modified.
2. The `totalEcon` track definition (`scope: global`, `min: 0`, `max: 75`) remains unchanged.
3. All existing FITL tests remain green — this fix should not affect any current test logic since no test currently exercises totalEcon-dependent calculations.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-scenario-setup-projection.test.ts` — add or verify assertion that compiled `totalEcon` initial value equals 15 for all 3 scenarios.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="scenario"` (targeted scenario tests)
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm turbo typecheck`
4. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
