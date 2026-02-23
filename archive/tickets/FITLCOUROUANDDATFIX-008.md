# FITLCOUROUANDDATFIX-008: Coup Reset Phase (Rule 6.6)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only YAML (actions/macros/triggers)
**Deps**: FITLCOUROUANDDATFIX-004, FITLCOUROUANDDATFIX-005, FITLCOUROUANDDATFIX-006, FITLCOUROUANDDATFIX-007

## Problem

Rule 6.6 Coup Reset must be fully automatic. In production data, `coupReset` exists but is currently wired through a no-op `coupResetProcess` action. That leaves Rule 6.6 behavior unimplemented and incorrectly modeled as player-actionable.

Reset must normalize Trail, clear Terror/Sabotage, flip guerrillas/SF underground, clear Momentum effects, and hand off cleanly into existing card lifecycle progression.

## Assumption Reassessment (2026-02-23)

1. `coupReset` phase is present in `turnStructure.phases`, and `coupResetProcess` currently has empty effects.
2. `trail` exists as global var with range `0..4`.
3. Terror/Sabotage are marker lattices in `40-content-data-assets.md`:
- `terror`: `none | terror`
- `sabotage`: `none | sabotage`
4. NVA/VC guerrillas and US irregulars/ARVN rangers use token `activity` (`active | underground`).
5. Momentum is represented by boolean `mom_*` global vars in `10-vocabulary.md`.
6. Coup sequencing is controlled by card-driven `coupPlan` runtime (`consecutiveCoupRounds`), not by FITL-specific globals like `isCoupRound`.
7. Existing production integration tests already cover coup phase structure, resources, support, redeploy, and commitment. There is no dedicated production integration test for Rule 6.6 reset behavior.
8. Card advance is already handled by existing turn-flow lifecycle (`promoteLookaheadToPlayed`, `revealLookahead`).

## Architecture Check

1. Rule 6.6 is deterministic and should remain automatic.
2. Existing automatic coup behavior uses `phaseEnter` triggers (`coupResources`, `coupRedeploy`); reset should follow the same pattern.
3. Implementing reset in a single macro keeps behavior DRY and testable.
4. No engine changes are required.

## What to Change

### 1. Add `coup-reset-markers` macro to `20-macros.md`

Execute in order:

**a. Trail normalization:**
- If `trail == 0`, set `trail = 1`.
- If `trail == 4`, set `trail = 3`.

**b. Remove all Terror and Sabotage markers:**
- Iterate map spaces and set `terror` marker to `none`.
- Iterate map spaces and set `sabotage` marker to `none`.
- Set `terrorSabotageMarkersPlaced = 0`.

**c. Flip all Guerrillas and SF underground:**
- Iterate all map spaces.
- For NVA/VC `guerrilla` and US `irregular` / ARVN `ranger` tokens, set `activity = underground`.

**d. Clear Momentum cards:**
- Set all `mom_*` vars to `false`:
  - `mom_wildWeasels`, `mom_adsid`, `mom_rollingThunder`, `mom_medevacUnshaded`, `mom_medevacShaded`, `mom_blowtorchKomer`, `mom_claymores`, `mom_daNang`, `mom_mcnamaraLine`, `mom_oriskany`, `mom_bombingPause`, `mom_559thTransportGrp`, `mom_bodyCount`, `mom_generalLansdale`, `mom_typhoonKate`

### 2. Wire reset as automatic phase-enter behavior in `30-rules-actions.md`

1. Add `on-coup-reset-enter` trigger (`phaseEnter: coupReset`) that executes `coup-reset-markers`.
2. Remove no-op `coupResetProcess` action wiring so reset is not player-actionable.
3. Keep card advance and eligibility lifecycle behavior in existing kernel turn-flow lifecycle (no custom reset-card logic).

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-reset-markers`)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add reset trigger and remove reset no-op action wiring)
- `packages/engine/test/integration/fitl-coup-reset-phase.test.ts` (new — production integration coverage for Rule 6.6)

## Out of Scope

- Resources phase logic (ticket 004)
- Support phase logic (ticket 005)
- Redeploy phase logic (ticket 006)
- Commitment phase logic (ticket 007)
- Engine/kernel code changes
- Changes to `10-vocabulary.md`, `40-content-data-assets.md`, `90-terminal.md`

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. Trail normalization test: `trail: 0 -> 1`, `trail: 4 -> 3`, `trail: 1/2/3` unchanged.
3. Terror/Sabotage reset test: all reset to `none`, and `terrorSabotageMarkersPlaced == 0`.
4. Guerrilla/SF flip test: NVA/VC guerrillas and US irregulars/ARVN rangers end `underground`.
5. Momentum clear test: all listed `mom_*` vars are `false` after reset.
6. Automatic reset test: reset executes on `phaseEnter(coupReset)` with no required reset move.
7. Card lifecycle test: after coup reset completion, next card promotion/reveal occurs via standard lifecycle.
8. Existing relevant test suite and `pnpm -F @ludoforge/engine test` pass.

### Invariants

1. After reset, game state is clean for the next event card cycle.
2. Trail is never `0` or `4` after reset.
3. No lingering momentum modifiers after reset.
4. No active guerrillas/SF remain due to pre-reset activity state.
5. Reset remains deterministic and automatic.
6. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-reset-phase.test.ts` (new)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup reset|coup-reset|coupReset"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-02-23
- Implemented:
  - Added `coup-reset-markers` macro in `data/games/fire-in-the-lake/20-macros.md`.
  - Added `on-coup-reset-enter` trigger (`phaseEnter: coupReset`) in `data/games/fire-in-the-lake/30-rules-actions.md`.
  - Removed no-op `coupResetProcess` action wiring so reset is fully automatic.
  - Added production integration coverage in `packages/engine/test/integration/fitl-coup-reset-phase.test.ts`.
- Deviations from original plan:
  - Reset was wired as a phase-enter trigger (matching existing automatic coup phase architecture) instead of a manual reset action.
  - Ticket assumptions were corrected to reflect current coup runtime architecture (no `isCoupRound`/coup-counter globals in production data).
- Verification:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern=\"coup reset|coup-reset|coupReset\"` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
