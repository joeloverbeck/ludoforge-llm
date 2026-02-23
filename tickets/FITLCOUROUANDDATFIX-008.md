# FITLCOUROUANDDATFIX-008: Coup Reset Phase (Rule 6.6)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only YAML (actions, macros, effects)
**Deps**: FITLCOUROUANDDATFIX-004, FITLCOUROUANDDATFIX-005, FITLCOUROUANDDATFIX-006, FITLCOUROUANDDATFIX-007

## Problem

The Coup Reset phase (Rule 6.6) is fully automatic — no player choices. It resets game state after the coup round: normalizes the Trail, removes all Terror and Sabotage markers, flips all Guerrillas and SF to Underground, clears all Momentum cards, resets all Factions to Eligible, clears the `isCoupRound` flag and coup-phase counters, and advances to the next card.

This is the last phase of the coup round and must leave the game in a clean state for the next event card cycle.

## Assumption Reassessment (2026-02-23)

1. `coupReset` phase stub exists from FITLCOUROUANDDATFIX-002.
2. `trail` is a global track (0-4).
3. Terror and sabotage markers are tracked on map spaces (zone marker lattice states or token-based).
4. Guerrilla tokens have an `active`/`underground` state (marker lattice on token or zone-level property).
5. US Irregulars and ARVN Rangers also have active/underground state ("SF" = Special Forces).
6. Momentum variables are all named `mom_*` in `globalVars` (lines 298-345 of `10-vocabulary.md`) — all are booleans.
7. Eligibility is tracked by the `turnFlow.eligibility` mechanism.
8. `isCoupRound`, `consecutiveCoupSkip`, `coupSupportSpacesUsed`, `coupAgitationSpacesUsed`, `coupUsTroopsMoved`, `coupUsBasesMoved` all need to be reset to their init values.
9. Card advance (next card) is handled by the kernel's card lifecycle mechanism.

## Architecture Check

1. All steps are deterministic — single auto-resolved action with a sequence of effects.
2. The `coup-reset-markers` macro keeps the reset logic DRY and testable.
3. Card advance after reset uses the existing card lifecycle mechanism (move from deck to played/lookahead).
4. No engine changes needed.

## What to Change

### 1. Add coup-reset-markers macro to 20-macros.md

Execute the following steps in order:

**a. Trail normalization:**
- If `trail == 0`, set `trail = 1`.
- If `trail == 4`, set `trail = 3`.

**b. Remove all Terror and Sabotage markers:**
- Iterate all map spaces; for each, reset terror marker state to `none`/`inactive` and sabotage marker state to `unsabotaged`.
- Reset `terrorSabotageMarkersPlaced` to 0 (if this global var exists).

**c. Flip all Guerrillas and SF Underground:**
- Iterate all NVA Guerrillas, VC Guerrillas, US Irregulars, and ARVN Rangers on all map spaces.
- Set each to `underground` state.

**d. Clear Momentum cards:**
- Set all `mom_*` boolean variables to `false`:
  - `mom_wildWeasels`, `mom_adsid`, `mom_rollingThunder`, `mom_medevacUnshaded`, `mom_medevacShaded`, `mom_blowtorchKomer`, `mom_claymores`, `mom_daNang`, `mom_mcnamaraLine`, `mom_oriskany`, `mom_bombingPause`, `mom_559thTransportGrp`, `mom_bodyCount`, `mom_generalLansdale`, `mom_typhoonKate`

**e. Reset all Factions to Eligible:**
- Clear all eligibility override windows for all seats.
- Mark all seats as eligible for the next turn.

**f. Clear coup flag and counters:**
- Set `isCoupRound = false`
- Set `consecutiveCoupSkip = false`
- Set `coupSupportSpacesUsed = 0`
- Set `coupAgitationSpacesUsed = 0`
- Set `coupUsTroopsMoved = 0`
- Set `coupUsBasesMoved = 0`

### 2. Wire effects into coupReset phase action in 30-rules-actions.md

Replace the stub `coupResetProcess` action with a real auto-resolved action that:
1. Executes the `coup-reset-markers` macro.
2. Advances to the next card (triggers card lifecycle: draw from deck, reveal lookahead).

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-reset-markers` macro)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — wire `coupReset` phase action with effects)

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
2. Trail normalization test: `trail: 0` → becomes 1; `trail: 4` → becomes 3; `trail: 1/2/3` → unchanged.
3. Terror/Sabotage removal test: all map spaces have terror and sabotage markers cleared after reset.
4. Guerrilla flip test: all NVA Guerrillas, VC Guerrillas on map are `underground` after reset.
5. SF flip test: all US Irregulars, ARVN Rangers on map are `underground` after reset.
6. Momentum clear test: all `mom_*` variables are `false` after reset.
7. Eligibility reset test: all 4 factions are eligible after reset.
8. Coup flag clear test: `isCoupRound == false`, all coup counters == 0 after reset.
9. Card advance test: after reset, the next card is drawn and a new lookahead is revealed.
10. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.

### Invariants

1. After reset, game state is clean for the next event card cycle.
2. Trail is always in range 1-3 after reset (never 0 or 4).
3. All momentum effects are cleared — no lingering modifiers.
4. All guerrillas and SF are underground — no active guerrillas remain.
5. All factions are eligible — no faction is ineligible from the previous coup round.
6. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-reset-phase.test.ts` (new) — test trail normalization, marker removal, guerrilla flip, momentum clear, eligibility reset, coup flag clear, card advance.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-reset"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`
