# FITLCOUROUANDDATFIX-001: Fix totalEcon Data Error (10 → 15)

**Status**: ✅ COMPLETED
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
3. Existing production integration tests already assert `totalEcon = 10` in compiled scenario setup (`packages/engine/test/integration/fitl-production-data-compilation.test.ts`), so this ticket requires test updates, not only data changes.
4. `packages/runner/src/bootstrap/fitl-game-def.json` currently embeds the same scenario values and must be regenerated after YAML edits.
5. Engine code does reference `totalEcon` via generic mechanisms (for example derived metric computation and formula references), but there is no FITL-specific hardcoded branch tied to the incorrect value.
6. The `rvn-leader-pacification-cost` macro and US ARVN resource spend constraint already reference `totalEcon`; correcting scenario initialization improves correctness for those rules.

## Architecture Check

1. The preferred architecture remains data-driven: correct scenario truth in YAML, then regenerate derived fixture artifacts.
2. No engine/kernel/schema refactor is required for this ticket; changing architecture here would add complexity without improving extensibility.
3. Test expectations are part of the contract and must be updated where they encoded the old incorrect value.
4. No backward-compatibility preservation is required; the new canonical value is `15`.

## What to Change

### 1. Fix totalEcon initial values in all three scenarios (source of truth)

In `data/games/fire-in-the-lake/40-content-data-assets.md`, change `totalEcon` from 10 to 15 in the `initialTrackValues` of:

- `fitl-scenario-short` (~line 1091): `value: 10` → `value: 15`
- `fitl-scenario-medium` (~line 1429): `value: 10` → `value: 15`
- `fitl-scenario-full` (~line 1813): `value: 10` → `value: 15`

### 2. Regenerate runner bootstrap fixture

After the data fix, regenerate `packages/runner/src/bootstrap/fitl-game-def.json` so the runner stays synchronized with the production spec.

### 3. Update integration tests that encode the old value

- Update `packages/engine/test/integration/fitl-production-data-compilation.test.ts` to assert `['totalEcon', 15]`.
- Add/strengthen scenario-level assertion coverage in `packages/engine/test/integration/fitl-scenario-setup-projection.test.ts` so setup projection verifies `totalEcon` is initialized from scenario data.

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — 3 line changes)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify — regenerate)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify — expected value update)
- `packages/engine/test/integration/fitl-scenario-setup-projection.test.ts` (modify — strengthen assertion)

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
3. No FITL-specific engine logic is introduced; behavior remains driven by scenario/map content and existing generic formula handling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — update expected compiled track global var `totalEcon` from `10` to `15`.
2. `packages/engine/test/integration/fitl-scenario-setup-projection.test.ts` — add assertion that projected initial global var `totalEcon` equals `15`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern=\"FITL scenario setup projection|FITL production data compilation\"` (targeted regression tests)
2. `pnpm -F @ludoforge/runner bootstrap:fixtures` (regenerate fixture)
3. `pnpm -F @ludoforge/runner bootstrap:fixtures:check` (fixture parity check)
4. `pnpm -F @ludoforge/engine test` (full engine suite)
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-02-23
- What changed:
  - Updated `totalEcon` initial values from `10` to `15` in all three FITL scenarios in `40-content-data-assets.md`.
  - Regenerated `packages/runner/src/bootstrap/fitl-game-def.json` to keep runner bootstrap fixtures aligned with source YAML.
  - Updated integration expectations to reflect canonical `totalEcon = 15`:
    - `fitl-production-data-compilation.test.ts`
    - `fitl-scenario-setup-projection.test.ts`
  - Updated adjacent integration coverage impacted by the corrected invariant:
    - `fitl-joint-operations.test.ts` boundary values shifted to the new `totalEcon` threshold.
    - `fitl-pass-rewards-production.test.ts` non-pass-path setup hardened so the test remains valid under the stricter threshold.
- Deviations from original plan:
  - The ticket originally claimed no test logic exercised `totalEcon`; in practice, several integration tests encoded `10` assumptions and were updated.
  - Added one additional test adjustment (`fitl-pass-rewards-production`) to remove a brittle setup assumption exposed by the corrected data value.
- Verification results:
  - `pnpm -F @ludoforge/runner bootstrap:fixtures:check` passed.
  - `pnpm -F @ludoforge/engine test` passed (257/257).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
