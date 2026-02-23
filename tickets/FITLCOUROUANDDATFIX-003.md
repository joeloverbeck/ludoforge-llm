# FITLCOUROUANDDATFIX-003: Coup Victory Phase Gate (Rule 6.1)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only YAML wiring
**Deps**: FITLCOUROUANDDATFIX-002

## Problem

Victory conditions in `90-terminal.md` have `timing: duringCoup`, but there is no mechanism to ensure the kernel evaluates terminal conditions specifically at the start of the `coupVictory` phase. The kernel's `terminalResult` check may already run between phases via `advanceToDecisionPoint`, but this needs verification and potentially explicit wiring to guarantee the victory check fires at the correct point in the coup sequence.

Additionally, the `final-coup-ranking` terminal condition (Rule 6.4.5 / 2.4.2) must fire after the `coupRedeploy` phase of the final coup round — not at `coupVictory` time. This timing needs verification against the existing `finalCoup` timing in `90-terminal.md`.

## Assumption Reassessment (2026-02-23)

1. `90-terminal.md` defines 4 victory checkpoints with `timing: duringCoup` and 1 `final-coup-ranking` with `timing: finalCoup`.
2. Each victory checkpoint's `when` condition includes a check for `isCoup == true` on the played card (count of coup cards in `played:none` == 1).
3. The kernel's `advanceToDecisionPoint` calls `terminalResult` — need to verify it does so at phase transitions.
4. `final-coup-ranking` checks both `isCoup == true` AND `deck:none` count == 0 AND `lookahead:none` count == 0 (i.e., last coup card).

## Architecture Check

1. Terminal condition evaluation is an engine-level feature — the data just needs correct timing annotations.
2. If the kernel already evaluates terminal conditions between phases, the `duringCoup` timing may already work. The ticket's job is to verify this and add any missing phase-enter effects if needed.
3. No backwards-compatibility concerns — terminal conditions already exist.

## What to Change

### 1. Verify kernel terminal check timing

Inspect `packages/engine/src/kernel/phase-advance.ts` to confirm `terminalResult` is evaluated between phase transitions. Document findings.

### 2. Wire coupVictory phase action (if needed)

If the kernel does NOT automatically check terminal conditions at phase transitions, add an `onPhaseEnter` effect or auto-resolved action on the `coupVictory` phase that triggers terminal evaluation. The stub action from FITLCOUROUANDDATFIX-002 may need to be promoted to a real auto-resolved action that evaluates `isCoupRound == true` and triggers terminal check.

### 3. Verify finalCoup timing for final-coup-ranking

Confirm that `final-coup-ranking` (timing: `finalCoup`) fires after `coupRedeploy` completes on the last coup card. If the current timing mechanism doesn't support this, add a trigger on `coupRedeploy` phase exit that checks for final coup and fires terminal evaluation.

### 4. Update 90-terminal.md if needed

If timing annotations need adjustment (e.g., changing `duringCoup` to reference the specific `coupVictory` phase), make those changes.

## Files to Touch

- `data/games/fire-in-the-lake/90-terminal.md` (modify — if timing annotations need adjustment)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — if phase-enter effects or action wiring needed)

## Out of Scope

- Resources phase logic (ticket 004)
- Support, Redeploy, Commitment, Reset phases (tickets 005-008)
- Engine/kernel code changes — if terminal check timing requires engine changes, flag it as a blocker and apply 1-3-1 rule
- Changes to `10-vocabulary.md`, `20-macros.md`, `40-content-data-assets.md`

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. In a coup-round simulation: when a faction meets its victory condition, the game terminates during the `coupVictory` phase (before Resources phase runs).
3. In a non-final coup round: if no victory condition is met, the game continues to `coupResources` phase.
4. `final-coup-ranking` fires after `coupRedeploy` on the last coup card (deck and lookahead empty).
5. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.
6. Existing terminal victory tests: `fitl-production-terminal-victory.test.ts` — still green.

### Invariants

1. All 4 faction victory conditions retain their `duringCoup` semantics — checked only during coup rounds.
2. `final-coup-ranking` only fires when deck AND lookahead are empty (last coup card).
3. Non-coup turns never trigger victory or final-coup evaluation.
4. No engine code is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-victory-phase.test.ts` (new) — set up a coup round state where a faction meets victory, assert game terminates at `coupVictory` phase. Set up a state where no faction meets victory, assert game proceeds past `coupVictory`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-victory"` (targeted)
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="terminal"` (regression)
3. `pnpm -F @ludoforge/engine test` (full suite)
