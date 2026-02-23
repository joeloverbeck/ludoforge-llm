# FITLCOUROUANDDATFIX-006: Coup Redeploy Phase (Rule 6.4)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — data-only YAML (actions, macros, effects)
**Deps**: `archive/tickets/FITLCOUROUANDDATFIX-002.md`, `archive/tickets/FITLCOUROUANDDATFIX-003.md`

## Problem

Rule 6.4 Redeploy is still missing in production FITL behavior.

Current code already has coup phase routing, resources/support phase behavior, and final-coup terminal wiring, but `coupRedeploy` remains a pass-only phase. This leaves Rule 6.4.1-6.4.3 unimplemented and untested in production data.

## Assumption Reassessment (2026-02-23)

1. `coupRedeploy` phase exists in `turnStructure` and `turnOrder.config.coupPlan` (from ticket 002), but currently exposes only `coupRedeployPass`.
2. `actionClassByActionId` currently has no Rule 6.4 redeploy actions.
3. `out-of-play-US:none`, `available-US:none`, and `available-ARVN:none` zones exist.
4. Laos/Cambodia identification is available via map space `country` attributes (`laos`, `cambodia`) in `40-content-data-assets.md`.
5. COIN base checks can be expressed generically as presence of `US`/`ARVN` `base` pieces.
6. `final-coup-ranking` terminal checkpoint is already wired and covered by integration tests; Rule 6.4.5 does not require new terminal logic here.
7. Control in current architecture is derived from current piece counts in predicates/checkpoints; there is no explicit control marker recalculation effect to add for Rule 6.4.4.
8. Existing tests cover coup structure/resources/support/victory boundaries, but there is no production integration test covering Rule 6.4 redeploy behavior.

## Architecture Check

1. Keep implementation data-driven in FITL YAML only (engine-agnostic).
2. Model 6.4.1 as phase-enter automatic effect (`trigger` + macro).
3. Model 6.4.2 and 6.4.3 as explicit per-move player actions with legality predicates; no aliases/shims.
4. Keep destination/control logic predicate-based and generic (piece-count derived), not hardcoded runtime branches.
5. Do not add synthetic control-recalc effects when control is already derived at evaluation time.

Why this is better than current state:
- Closes the remaining Rule 6.4 gameplay gap without engine coupling.
- Keeps the architecture consistent with existing coup resources/support data-driven implementation.
- Preserves extensibility: rules remain in declarative spec, kernel remains generic.

## What to Change

### 1. Add `coup-laos-cambodia-removal` macro to `20-macros.md`

For each map space in Laos/Cambodia:
- Move US Troops to `out-of-play-US:none`.
- Move all other US pieces to `available-US:none`.
- Move all ARVN pieces to `available-ARVN:none`.

### 2. Add Rule 6.4 redeploy actions to `30-rules-actions.md`

Add production actions in phase `[coupRedeploy]`:

- `coupArvnRedeployMandatory` (ARVN):
  - Move one ARVN Troop from LoCs/Provinces without COIN Bases.
  - Valid destinations: Cities without NVA Control, spaces with US/ARVN Bases, or Saigon.

- `coupArvnRedeployOptionalTroops` (ARVN):
  - Same destination constraints.
  - Legal only after no mandatory ARVN troop sources remain.

- `coupArvnRedeployPolice` (ARVN):
  - Move one ARVN Police to any LoC or any COIN-Controlled space within South Vietnam.

- `coupNvaRedeployTroops` (NVA):
  - Move one NVA Troop from any map space to any space containing an NVA Base.

### 3. Wire automatic Rule 6.4.1 step as phase-enter trigger

Add `phaseEnter` trigger for `coupRedeploy` that executes `coup-laos-cambodia-removal`.

### 4. Keep pass action, update action-class wiring

- Keep existing `coupRedeployPass`.
- Add new redeploy action IDs to `turnOrder.config.turnFlow.actionClassByActionId`.

### 5. Explicitly no control-marker side effects

Do not add explicit control-recalculation effects for 6.4.4 because current FITL production control checks are derived from live piece counts.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-laos-cambodia-removal`)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add redeploy actions, trigger, action-class wiring)
- `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts` (new)

## Out of Scope

- Resources phase (ticket 004)
- Support phase (ticket 005)
- Commitment phase (ticket 007)
- Reset phase (ticket 008)
- Engine/kernel code changes
- Changes to `10-vocabulary.md`, `40-content-data-assets.md`, `90-terminal.md`
- Reworking final-coup terminal formulas (already covered)

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. Laos/Cambodia removal: US/ARVN pieces are removed from Laos/Cambodia; US Troops -> out-of-play, other US/ARVN pieces -> available.
3. ARVN mandatory redeploy enforcement: ARVN optional troop redeploy is blocked while mandatory troop sources remain.
4. ARVN troop destination constraints enforced.
5. ARVN police destination constraints enforced.
6. NVA redeploy allows troops only and only to spaces with NVA bases.
7. Existing coup structure/resources/support/victory tests remain green.
8. `pnpm -F @ludoforge/engine test` passes.

### Invariants

1. After Rule 6.4.1 resolution, no US/ARVN pieces remain in Laos/Cambodia spaces.
2. US Troops removed by Rule 6.4.1 always go to out-of-play, never available.
3. ARVN mandatory troop redeploy must be exhaustible before optional troop redeploy is legal.
4. NVA redeploy remains optional and troop-only.
5. Rule 6.4 implementation is data-only and engine-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts` (new)
   - Covers 6.4.1 automatic removal, ARVN mandatory/optional troop redeploy constraints, ARVN police redeploy constraints, NVA troop-only redeploy constraints.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup redeploy|coup-redeploy|Redeploy"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-02-23
- What was actually changed:
  - Added `coup-laos-cambodia-removal` macro in `20-macros.md` and wired it to `coupRedeploy` `phaseEnter`.
  - Added Rule 6.4 redeploy actions in `30-rules-actions.md`:
    - `coupArvnRedeployMandatory`
    - `coupArvnRedeployOptionalTroops`
    - `coupArvnRedeployPolice`
    - `coupNvaRedeployTroops`
  - Updated `turnFlow.actionClassByActionId` with the new redeploy action IDs.
  - Added integration coverage in `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts`.
- Deviations from original plan:
  - Did not add explicit control-recalculation side effects; control remains derived from live piece counts in existing architecture.
  - Kept existing `coupRedeployPass` rather than replacing it with multiple pass actions.
- Verification:
  - `pnpm -F @ludoforge/engine test` passed (`261/261`).
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
