# FITLCOUROUANDDATFIX-007: Coup Commitment Phase (Rule 6.5)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only YAML (actions, macros, effects)
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

Rule 6.5 Commitment is not fully wired into the Coup Round path. Today, `coupCommitment` exists as a phase, but production wiring exposes only `coupCommitmentPass` in that phase, so the Rule 6.5 casualty processing and US movement are not executed as part of Coup rounds.

## Assumption Reassessment (2026-02-23)

### Verified Current State

1. `turnStructure.phases` includes `coupCommitment` and `turnOrder.config.coupPlan` includes a `resolve-commitment` symbolic step.
2. `coupCommitment` currently has `coupCommitmentPass` only; no Rule 6.5 execution action is available in that phase.
3. Rule 6.5 implementation exists today as `resolveCommitment` on interrupt phase `[commitment]` and is used by card-73 via `pushInterruptPhase`.
4. `casualties-US:none`, `out-of-play-US:none`, and `available-US:none` zones exist and are correctly used elsewhere.
5. `coupUsTroopsMoved` and `coupUsBasesMoved` global vars do **not** exist in `10-vocabulary.md`.
6. Final-coup handling for standard Coup phases is governed by card-driven coup-plan logic (`finalRoundOmitPhases: [coupCommitment, coupReset]`) rather than per-action preconditions.
7. The `commitment` interrupt phase and `coupCommitment` phase are distinct flows and should stay distinct: event-card interrupt vs coup-round phase.

### Discrepancies vs Previous Ticket Draft

1. Counter-var assumptions (`coupUsTroopsMoved`, `coupUsBasesMoved`) were incorrect.
2. “Zero legal moves on final coup” is not the canonical behavior; the phase is omitted from effective phase progression.
3. The existing architecture already has Rule 6.5 logic in one place (`resolveCommitment`) but not reused for coup rounds.

## Architecture Decision

Use a **single reusable macro** for Rule 6.5 commitment resolution, and call it from both:

1. interrupt action `resolveCommitment` (`phase: [commitment]`) for card-73 compatibility.
2. new coup action (or equivalent resolver) in `phase: [coupCommitment]`.

This is preferred over introducing new counters because:

1. It keeps the model DRY and avoids duplicated commitment logic.
2. It preserves game-agnostic engine behavior (data/YAML-only change).
3. It aligns with existing architecture where coup-phase behavior is data-driven and phase-scoped.

## What to Change

### 1. Add reusable commitment macro in `20-macros.md`

Create a macro that performs full Rule 6.5 resolution:

1. Casualty processing:
- US troop casualties: `floor(count / 3)` to `out-of-play-US:none`.
- All US base casualties to `out-of-play-US:none`.
- Remaining US casualties to `available-US:none`.
2. US movement:
- Up to 10 US troops among `available-US:none` and legal map destinations.
- Up to 2 US bases among `available-US:none` and legal map destinations.
- Legal destinations: LoCs, Saigon, COIN-controlled cities/provinces, and `available-US:none` for withdrawals from map.

### 2. Wire coup commitment phase execution in `30-rules-actions.md`

Add a Rule 6.5 action in `phase: [coupCommitment]` that executes the shared macro and has `limits: [{ scope: phase, max: 1 }]`.

### 3. Refactor interrupt commitment action to shared macro

Update existing `resolveCommitment` (`phase: [commitment]`) to call the same shared macro, then keep `popInterruptPhase` there only.

### 4. Keep pass action

Retain `coupCommitmentPass` so the US can end the phase early if desired.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add shared Rule 6.5 commitment macro)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add coup commitment resolver action, refactor interrupt action to shared macro)
- `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts` (new)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify only if needed for shared-macro coverage)

## Out of Scope

- Resources phase (ticket 004)
- Support phase (ticket 005)
- Redeploy phase (ticket 006)
- Reset phase (ticket 008)
- Engine/kernel code changes
- Changes to `10-vocabulary.md`, `40-content-data-assets.md`, `90-terminal.md`

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. Coup commitment phase exposes Rule 6.5 execution action (not pass-only).
3. Final-coup omission behavior: `coupCommitment` is omitted from effective coup progression on final coup rounds.
4. Casualty processing rounding test: 7 US troop casualties -> 2 out of play, 5 to available.
5. Casualty processing bases test: all US base casualties go to out of play.
6. Casualty processing zero test: no-op with empty casualties.
7. Movement caps test: at most 10 US troops and 2 US bases are moved in one commitment resolution.
8. Destination legality test: movement destinations constrained to Rule 6.5 legal set.
9. Existing event-card interrupt commitment behavior (card-73) remains valid after refactor.
10. Existing test suite: `pnpm -F @ludoforge/engine test` passes.

### Invariants

1. Rule 6.5 logic is not duplicated across interrupt and coup-phase paths.
2. Final coup does not execute commitment phase logic.
3. Casualty rounding always uses floor division.
4. US base casualties never route to available.
5. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts` (new)
- Covers coup-phase resolver availability, casualty processing, movement limits, destination constraints, and final-coup omission semantics.
2. `packages/engine/test/integration/fitl-commitment-phase.test.ts` (existing)
- Validates card-73 interrupt path remains functional with shared macro extraction.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup commitment|commitment phase"`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-02-23
- What changed:
  - Added shared macro `coup-process-commitment` in `data/games/fire-in-the-lake/20-macros.md` implementing Rule 6.5 casualty routing and capped US commitment movement.
  - Added `coupCommitmentResolve` action in `data/games/fire-in-the-lake/30-rules-actions.md` for `coupCommitment` phase, plus `actionClassByActionId` wiring.
  - Refactored interrupt `resolveCommitment` action to reuse the shared macro and retain interrupt-only `popInterruptPhase`.
  - Added `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts` with coup-phase casualty, movement-cap, and destination-validation coverage.
- Deviations from original plan:
  - Did not introduce `coupUsTroopsMoved` / `coupUsBasesMoved` counter vars; used existing `chooseN` max contracts for cleaner DRY architecture.
  - Final-coup behavior validated via existing coup-plan phase omission model rather than per-action precondition flags.
- Verification:
  - `pnpm -F @ludoforge/engine test` passed (262/262).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
