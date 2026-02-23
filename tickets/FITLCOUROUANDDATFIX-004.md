# FITLCOUROUANDDATFIX-004: Coup Resources Phase — Automatic Effects (Rule 6.2)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data-only YAML (actions, macros, effects)
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

The Coup Resources phase (Rule 6.2) is entirely automatic — no player choices (except VC ordering when sabotage markers are scarce). It computes sabotage spreading, trail degradation, ARVN earnings, insurgent earnings, and casualties/aid reduction. None of this logic exists in the current spec.

## Assumption Reassessment (2026-02-23)

1. `coupResources` phase stub exists from FITLCOUROUANDDATFIX-002 with `isCoupRound == true` precondition.
2. LoC zones have `econ` properties defined in `fitl-map-production` data asset.
3. Sabotage is tracked via zone marker lattice states (sabotaged/unsabotaged on LoCs).
4. `terrorSabotageMarkersPlaced` is not yet a global variable — terror and sabotage share a pool of 15 markers. This variable may need to be added or the current marker tracking mechanism verified.
5. `aid` is a global track defined in scenarios' `initialTrackValues`.
6. `arvnResources`, `nvaResources`, `vcResources` are global tracks.
7. `trail` is a global track (0-4).
8. `casualties-US:none` zone holds US casualties.
9. Laos/Cambodia spaces have a distinguishing property (country or tag) that can be queried.

## Architecture Check

1. All logic is expressed as `GameSpecDoc` effects and macros — no engine changes.
2. Reusable macros keep the coup phase logic DRY and testable in isolation.
3. The automatic nature of this phase means it can be a single auto-resolved action with a sequence of effects.

## What to Change

### 1. Add coup-auto-sabotage macro to 20-macros.md

Iterates all LoC zones. For each unsabotaged LoC where:
- Insurgent guerrillas (NVA + VC) > COIN pieces (US + ARVN), OR
- LoC is adjacent to a City without COIN Control

Set the LoC's sabotage marker to `sabotaged`. Respect the 15-marker cap (total terror + sabotage markers placed).

**VC choice on marker scarcity**: If eligible LoCs exceed remaining markers, this becomes a VC player choice. Implement as a conditional: if `remainingMarkers >= eligibleLocCount`, auto-sabotage all; otherwise, present VC with a choice action to select which LoCs to sabotage.

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

### 6. Wire effects into coupResources phase action in 30-rules-actions.md

Replace the stub `coupResourcesProcess` action with a real auto-resolved action that executes the above effects in order:
1. Sabotage spreading
2. Trail degradation
3. ARVN earnings
4. Insurgent earnings
5. Casualties/Aid reduction

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-auto-sabotage`, `coup-arvn-earnings`, `coup-insurgent-earnings` macros)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — wire `coupResources` phase action with effects)
- `data/games/fire-in-the-lake/10-vocabulary.md` (modify — add `terrorSabotageMarkersPlaced` global var if not already present, verify marker tracking)

## Out of Scope

- Support phase (ticket 005)
- Redeploy phase (ticket 006)
- Commitment phase — piece movement from casualties (ticket 007)
- Reset phase (ticket 008)
- Engine/kernel code changes
- Changes to `40-content-data-assets.md` or `90-terminal.md`

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
10. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.

### Invariants

1. Sabotage marker total (terror + sabotage) never exceeds 15.
2. `arvnResources` never exceeds 75 (max cap).
3. `trail` never goes below 0 from degradation.
4. `aid` can go negative (per rules — no floor specified for aid subtraction).
5. Resource additions use correct formulas matching Rules Section 6.2.
6. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-resources-phase.test.ts` (new) — test each sub-step: sabotage spreading, trail degradation, ARVN earnings, insurgent earnings, casualties/aid.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-resources"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`
