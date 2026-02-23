# FITLCOUROUANDDATFIX-004: Coup Resources Phase — Automatic Effects (Rule 6.2)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data-only YAML (actions, macros, effects) + production integration tests
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

The Coup Resources phase (Rule 6.2) is entirely automatic — no player choices (except VC ordering when sabotage markers are scarce). It computes sabotage spreading, trail degradation, ARVN earnings, insurgent earnings, and casualties/aid reduction. None of this logic exists in the current spec.

## Assumption Reassessment (2026-02-23)

1. `coupResources` phase stub action exists from FITLCOUROUANDDATFIX-002 (`coupResourcesProcess` in `30-rules-actions.md`) and is currently empty.
2. LoC zones have `econ` properties defined in `fitl-map-production` data asset.
3. Sabotage is tracked via zone marker lattice states (sabotaged/unsabotaged on LoCs).
4. `terrorSabotageMarkersPlaced` already exists as a map track (`fitl-map-production.tracks`) and is initialized by scenario projections; no new vocabulary variable is required.
5. `aid`, `trail`, `totalEcon`, `arvnResources`, `nvaResources`, `vcResources` are defined as map tracks in `40-content-data-assets.md` (compiled into global vars at runtime), not in `10-vocabulary.md`.
6. `casualties-US:none` zone holds US casualties.
7. Laos/Cambodia spaces expose `country` attributes (`laos` / `cambodia`) queryable via `zoneProp`.
8. Existing `fitl-coup-resources-phase` integration test is fixture-only and does not exercise production FITL data.

## Architecture Check

1. All logic is expressed as `GameSpecDoc` effects and macros — no engine changes.
2. Reusable macros keep the coup phase logic DRY and testable in isolation.
3. The automatic nature of this phase fits a single auto-resolved action with ordered effects/macros.
4. For this ticket, sabotage placement remains deterministic when markers are scarce (stable map iteration order) to keep the action auto-resolved and avoid cross-seat choice plumbing in an automatic phase.

## What to Change

### 1. Add coup-auto-sabotage macro to 20-macros.md

Iterate all LoC zones. For each unsabotaged LoC where:
- Insurgent guerrillas (NVA + VC) > COIN pieces (US + ARVN), OR
- LoC is adjacent to a City without COIN Control

Set the LoC's sabotage marker to `sabotaged`. Respect the 15-marker cap (total terror + sabotage markers placed).

### 2. Add coup-trail-degradation effect

Simple conditional: if any Laos or Cambodia space has COIN Control (US + ARVN pieces > NVA + VC pieces), decrease `trail` by 1 (min 0).

### 3. Add coup-arvn-earnings macro to 20-macros.md

1. Calculate unSabotaged Econ = sum of `econ` property for all non-sabotaged LoCs.
2. Add `aid` + unSabotaged Econ to `arvnResources` (cap at 75).
3. Update `totalEcon` global variable to the unSabotaged Econ value.

### 4. Add coup-insurgent-earnings macro to 20-macros.md

- **VC**: Count VC bases on all map spaces. Add count to `vcResources`.
- **NVA**: Count NVA bases in Laos/Cambodia spaces. Add (count + 2 * `trail`) to `nvaResources`.

### 5. Add coup-casualties-aid effect

Subtract from `aid`: 3 * (count of pieces in `casualties-US:none`).

**Note**: Only the aid reduction happens here. Actual piece movement from casualties to out-of-play happens in the Commitment phase (ticket 007).

### 6. Wire effects to auto-resolve on coupResources phase enter in 30-rules-actions.md

Implement the `coupResources` sequence as `phaseEnter` trigger effects (automatic, no manual move required), in order:
1. Sabotage spreading
2. Trail degradation
3. ARVN earnings
4. Insurgent earnings
5. Casualties/Aid reduction

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-auto-sabotage`, `coup-arvn-earnings`, `coup-insurgent-earnings` macros)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — wire `coupResources` auto-resolution trigger and turn-flow action-class mapping)
- `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` (modify — replace fixture-only assertions with production FITL coup-resources coverage)

## Out of Scope

- Support phase (ticket 005)
- Redeploy phase (ticket 006)
- Commitment phase — piece movement from casualties (ticket 007)
- Reset phase (ticket 008)
- Engine/kernel code changes
- Changes to `40-content-data-assets.md` or `90-terminal.md`
- VC seat-driven marker ordering choice UX under scarcity (follow-up ticket if required)

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. Sabotage spreading test: given a state with insurgent guerrillas outnumbering COIN on specific LoCs, those LoCs become sabotaged after `coupResources` phase.
3. Sabotage 15-marker cap: when 15 terror+sabotage markers are already placed, no new sabotage occurs.
4. Trail degradation test: given COIN Control in a Laos/Cambodia space, trail decreases by 1.
5. Trail degradation no-op: given no COIN Control in Laos/Cambodia, trail unchanged.
6. ARVN earnings test: `arvnResources` increases by `aid` + unSabotaged Econ.
7. VC earnings test: `vcResources` increases by count of VC bases on map.
8. NVA earnings test: `nvaResources` increases by (NVA bases in Laos/Cambodia + 2 * trail).
9. Casualties/Aid test: `aid` decreases by 3 * count of pieces in `casualties-US:none`.
10. ARVN cap test: `arvnResources` remains capped at 75.
11. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.

### Invariants

1. Sabotage marker total (terror + sabotage) never exceeds 15.
2. `arvnResources` never exceeds 75 (max cap).
3. `trail` never goes below 0 from degradation.
4. `aid` is clamped at 0 by current numeric track bounds.
5. Resource additions use correct formulas matching Rules Section 6.2.
6. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` (modify) — production FITL tests for sabotage spreading, cap behavior, trail degradation, ARVN/insurgent earnings, casualties/aid, and ARVN cap.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-resources"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-02-23
- **What was changed**:
  - Added new coup resources macros in `20-macros.md`: `coup-auto-sabotage`, `coup-trail-degradation`, `coup-arvn-earnings`, `coup-insurgent-earnings`, `coup-casualties-aid`.
  - Wired Rule 6.2 execution as an automatic `phaseEnter` trigger on `coupResources` in `30-rules-actions.md`.
  - Kept coup phase turn-flow accounting stable by mapping coup pass/check actions in `actionClassByActionId`.
  - Replaced fixture-only resources test coverage with production FITL integration coverage in `fitl-coup-resources-phase.test.ts`.
  - Updated coup victory gating expectations to reflect auto-resolved resources progression (`coupVictory -> coupSupport`).
- **Deviations from original plan**:
  - Instead of implementing Rule 6.2 via a manual `coupResourcesProcess` action, implementation uses `phaseEnter` trigger auto-resolution for cleaner automatic-phase architecture.
  - `10-vocabulary.md` was not modified; resource/sabotage tracks already live in map track definitions.
  - Marker-scarcity VC ordering remains deterministic in this ticket.
- **Verification**:
  - `pnpm -F @ludoforge/engine clean && pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/integration/fitl-coup-resources-phase.test.js`
  - `node packages/engine/dist/test/integration/fitl-coup-victory-phase-gating.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
