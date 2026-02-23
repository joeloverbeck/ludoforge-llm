# FITLCOUROUANDDATFIX-007: Coup Commitment Phase (Rule 6.5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only YAML (actions, macros, effects)
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

The Coup Commitment phase (Rule 6.5) handles US casualty processing and voluntary US troop/base movement. It is skipped on the final coup round. This phase combines automatic casualty processing (1/3 troops out of play, all bases out of play, rest to available) with interactive US movement choices (up to 10 troops and 2 bases).

## Assumption Reassessment (2026-02-23)

1. `coupCommitment` phase stub exists from FITLCOUROUANDDATFIX-002.
2. `casualties-US:none` zone holds US casualties (defined in `10-vocabulary.md:33-36`).
3. `out-of-play-US:none` zone exists for pieces going permanently out of play.
4. `available-US:none` zone exists for pieces returning to available.
5. `coupUsTroopsMoved` and `coupUsBasesMoved` global vars exist from FITLCOUROUANDDATFIX-002.
6. Final coup detection: deck empty + lookahead empty, or a flag set by the coup card trigger.
7. The existing `commitment` interrupt in `turnStructure.interrupts` is a separate concept from `coupCommitment` phase — they serve different purposes.

## Architecture Check

1. Casualty processing is automatic — no player choice — modeled as an auto-resolved effect sequence.
2. US troop/base movement is interactive — modeled as player choice actions with per-piece movement limits tracked via `coupUsTroopsMoved` and `coupUsBasesMoved`.
3. The "skip on final coup" precondition can be expressed as a precondition on the phase's actions: `NOT (deck empty AND lookahead empty)`.
4. The `coup-process-casualties` macro keeps casualty processing logic DRY.
5. No engine changes needed.

## What to Change

### 1. Add coup-process-casualties macro to 20-macros.md

Process US casualties:
1. Count US Troop tokens in `casualties-US:none`.
2. Calculate `floor(count / 3)` → these troops go to `out-of-play-US:none`.
3. Move all US Base tokens in `casualties-US:none` to `out-of-play-US:none`.
4. Move remaining US Troop tokens in `casualties-US:none` to `available-US:none`.
5. Move any other US piece types in `casualties-US:none` to `available-US:none`.

### 2. Add coupCommitmentMove action to 30-rules-actions.md

- **Phase**: `[coupCommitment]`
- **Actor**: seat `'0'` (US)
- **Preconditions**:
  - `isCoupRound == true`
  - NOT final coup round (deck has cards OR lookahead has cards)
  - `coupUsTroopsMoved < 10` OR `coupUsBasesMoved < 2` (at least one movement type still available)
- **Params**:
  - `pieceType`: enum `[troops, base]`
  - `sourceZone`: available-US or any map space
  - `destZone`: COIN-Controlled spaces, LoCs, Saigon, or available-US
- **Constraints per pieceType**:
  - Troops: `coupUsTroopsMoved < 10`; increment after each troop move
  - Bases: `coupUsBasesMoved < 2`; increment after each base move
- **Effects**:
  - Move selected piece from source to destination
  - Increment appropriate counter

### 3. Wire automatic casualty processing

Auto-resolved action at the start of `coupCommitment` phase that executes `coup-process-casualties` macro before interactive movement begins. Gated by same non-final-coup precondition.

### 4. Add control/victory marker adjustment

After all commitment moves are complete, trigger control recalculation (same as in Redeploy phase).

### 5. Add pass/done action for coupCommitment phase

US needs a pass/done action to complete the phase after desired moves.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify — add `coup-process-casualties` macro)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add `coupCommitmentMove` action, auto casualty processing, pass action)

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
2. Final coup skip test: on the final coup round (deck + lookahead empty), the entire `coupCommitment` phase is skipped (zero legal moves).
3. Casualty processing — rounding test: given 7 US Troop casualties, `floor(7/3) = 2` go to out-of-play, 5 go to available.
4. Casualty processing — bases test: all US Base casualties go to out-of-play regardless of count.
5. Casualty processing — zero test: given 0 casualties, no pieces moved.
6. US troop movement limit test: after moving 10 troops, no more troop moves allowed.
7. US base movement limit test: after moving 2 bases, no more base moves allowed.
8. Destination constraint test: troops/bases can only move to COIN-Controlled spaces, LoCs, Saigon, or available-US.
9. Control recalculation test: control markers updated after commitment moves.
10. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.

### Invariants

1. On the final coup round, `coupCommitment` phase is completely skipped.
2. Casualty rounding always uses `floor()` (round down).
3. All US Base casualties go to out-of-play (none survive to available).
4. US troop movement never exceeds 10 per commitment phase.
5. US base movement never exceeds 2 per commitment phase.
6. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts` (new) — test casualty processing (rounding, bases, edge cases), US movement limits, destination constraints, final-coup skip, control recalculation.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-commitment"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo typecheck`
