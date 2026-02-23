# FITLCOUROUANDDATFIX-006: Coup Redeploy Phase (Rule 6.4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data-only YAML (actions, macros, effects)
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

The Coup Redeploy phase (Rule 6.4) combines automatic piece removal with interactive redeployment choices. It has multiple sub-steps with different actors: automatic Laos/Cambodia removal (6.4.1), ARVN mandatory and optional troop/police redeployment (6.4.2), NVA troop redeployment (6.4.3), automatic control adjustment (6.4.4), and a game-end check on the final coup (6.4.5).

## Assumption Reassessment (2026-02-23)

1. `coupRedeploy` phase stub exists from FITLCOUROUANDDATFIX-002.
2. Laos and Cambodia spaces are identifiable by zone properties (country tag or space category).
3. `out-of-play-US` zone exists in `10-vocabulary.md` for US Troops removed from Laos/Cambodia.
4. `available-US`, `available-ARVN` zones exist for non-troop US/ARVN pieces.
5. COIN Bases = US Bases + ARVN Bases. Provinces/LoCs "without COIN Bases" means no US or ARVN base tokens present.
6. NVA Bases are identifiable by faction+type token properties.
7. Control recalculation may be automatic (derived values) or may need explicit effects — depends on kernel implementation.
8. `final-coup-ranking` in `90-terminal.md` fires after Redeploy on the final coup — this is wired in ticket 003.

## Architecture Check

1. The sub-step sequence (auto removal → ARVN redeploy → NVA redeploy → control adjust → game-end check) maps naturally to a sequence of effects and actions within the `coupRedeploy` phase.
2. Automatic sub-steps (6.4.1, 6.4.4) are modeled as auto-resolved effects.
3. Interactive sub-steps (6.4.2, 6.4.3) are modeled as player choice actions.
4. The `coup-laos-cambodia-removal` macro keeps the automatic removal logic DRY.
5. No engine changes needed.

## What to Change

### 1. Add coup-laos-cambodia-removal macro to 20-macros.md

Iterate all Laos and Cambodia map spaces. For each:
- Move US Troops to `out-of-play-US:none`
- Move all other US pieces (bases, irregulars) to `available-US:none`
- Move all ARVN pieces (troops, police, bases, rangers) to `available-ARVN:none`

### 2. Add ARVN mandatory redeploy action to 30-rules-actions.md

- **Phase**: `[coupRedeploy]`
- **Actor**: seat `'1'` (ARVN)
- **Mandatory**: ARVN Troops on LoCs and Provinces without COIN Bases MUST move.
- **Destinations**: Any Cities without NVA Control, any spaces with US or ARVN Bases, or Saigon.
- **Implementation**: This may need to be a forEach-style mandatory action that presents each mandatory troop with its valid destination choices.

### 3. Add ARVN optional troop redeploy action

ARVN may also move any other ARVN Troops to the same destinations. This is an optional player choice action that runs after mandatory moves are complete.

### 4. Add ARVN police redeploy action

ARVN may move any Police to any LoCs or COIN-Controlled spaces within South Vietnam. Separate action after troop redeployment.

### 5. Add NVA troop redeploy action

- **Phase**: `[coupRedeploy]`
- **Actor**: seat `'2'` (NVA)
- NVA may move NVA Troops (only — not guerrillas or bases) from any map spaces to any NVA Bases (even if COIN-Controlled).
- Optional — NVA can decline.

### 6. Wire automatic sub-steps as phase effects

- Auto-resolved action at start of `coupRedeploy` executes `coup-laos-cambodia-removal` macro.
- After all interactive redeployment actions complete, trigger control recalculation.
- If this is the final coup round, trigger game-end evaluation after control adjustment.

### 7. Add pass/done actions for coupRedeploy phase

ARVN and NVA each need pass/done actions.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-laos-cambodia-removal` macro)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add ARVN redeploy actions, NVA redeploy action, auto effects, pass actions)

## Out of Scope

- Resources phase (ticket 004)
- Support phase (ticket 005)
- Commitment phase (ticket 007)
- Reset phase (ticket 008)
- Engine/kernel code changes
- Changes to `10-vocabulary.md`, `40-content-data-assets.md`
- The `final-coup-ranking` terminal wiring itself (ticket 003)

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. Laos/Cambodia removal test: all US/ARVN pieces removed from Laos/Cambodia spaces; US Troops go to `out-of-play-US`, others to their Available boxes.
3. Mandatory ARVN redeploy test: ARVN Troops on LoCs/Provinces without COIN Bases must be moved; they cannot remain.
4. ARVN destination constraint test: redeployed troops go only to Cities without NVA Control, spaces with US/ARVN Bases, or Saigon.
5. ARVN police redeploy test: Police can move to LoCs or COIN-Controlled spaces within South Vietnam.
6. NVA redeploy test: NVA Troops can move to any NVA Base (including COIN-Controlled ones).
7. NVA constraint test: NVA guerrillas and bases cannot be redeployed (only troops).
8. Control recalculation test: after redeploy, control markers reflect new piece positions.
9. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.

### Invariants

1. After Laos/Cambodia removal, zero US or ARVN pieces remain in Laos/Cambodia spaces.
2. US Troops from Laos/Cambodia go to out-of-play (not available).
3. ARVN mandatory moves are enforced — troops on LoCs/Provinces without COIN Bases cannot stay.
4. NVA redeployment is optional and limited to troops only.
5. Control is correctly recalculated after all moves.
6. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts` (new) — test Laos/Cambodia removal, mandatory ARVN redeploy, optional ARVN redeploy, ARVN police redeploy, NVA redeploy, control recalculation.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-redeploy"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`
