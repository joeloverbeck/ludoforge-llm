# FITLCOUROUANDDATFIX-009: Coup Round Integration Verification and Fixture Sync

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — verification and fixture regeneration only
**Deps**: FITLCOUROUANDDATFIX-003, FITLCOUROUANDDATFIX-004, FITLCOUROUANDDATFIX-005, FITLCOUROUANDDATFIX-006, FITLCOUROUANDDATFIX-007, FITLCOUROUANDDATFIX-008

## Problem

After all coup phase tickets (001-008) are implemented, the complete coup round flow needs end-to-end integration verification: a full simulation from coup card entry through all 6 phases and back to normal event card play. The runner bootstrap fixture also needs to be regenerated to include all coup phase actions and variables.

## Assumption Reassessment (2026-02-23)

1. All individual phase tickets (003-008) have their own targeted tests.
2. The runner bootstrap fixture (`packages/runner/src/bootstrap/fitl-game-def.json`) must be regenerated after all data changes.
3. `CLAUDE.md` needs updating to reflect the new ticket series and completed work.
4. Spec 43 status should be updated from Draft to COMPLETED once all tickets pass.

## Architecture Check

1. Integration testing validates that the full phase sequence works correctly end-to-end.
2. No new code — this is verification, fixture sync, and documentation.
3. No backwards-compatibility concerns.

## What to Change

### 1. Full coup round integration test

Create an E2E-style integration test that:
1. Compiles the production FITL spec.
2. Sets up a game state with a coup card about to be played.
3. Plays through the complete coup round: Victory → Resources → Support → Redeploy → Commitment → Reset.
4. Verifies the game returns to normal event card play after the coup round.
5. Verifies a non-coup turn after the reset correctly skips all coup phases.

### 2. Consecutive coup guard integration test

Test the Rule 6.0 exception:
1. Set up a state where two coup cards are played consecutively.
2. Verify the second coup card does NOT trigger a coup round (phases auto-skipped).
3. Verify immediate coup card effects (RVN Leader change) still apply.

### 3. Regenerate runner bootstrap fixture

```bash
pnpm -F @ludoforge/runner bootstrap:fixtures:generate
```

### 4. Update CLAUDE.md

- Add FITLCOUROUANDDATFIX to "Completed ticket series" when all tickets are done.
- Update active tickets list.
- Update Spec 43 references if applicable.

### 5. Mark Spec 43 as COMPLETED

Update `specs/43-fitl-coup-round-and-data-fixes.md` status from Draft to COMPLETED.

## Files to Touch

- `packages/runner/src/bootstrap/fitl-game-def.json` (modify — regenerate)
- `CLAUDE.md` (modify — update ticket series and status)
- `specs/43-fitl-coup-round-and-data-fixes.md` (modify — mark COMPLETED, then archive)

## Out of Scope

- Any further coup phase logic changes (all handled in tickets 001-008)
- Engine/kernel code changes
- New game features beyond Spec 43 scope
- Changes to FITL data files (those are done in tickets 001-008)

## Acceptance Criteria

### Tests That Must Pass

1. Full coup round simulation: coup card → Victory → Resources → Support → Redeploy → Commitment → Reset → next card plays normally.
2. Consecutive coup guard: second consecutive coup card skips the coup round.
3. Non-coup turn after reset: all coup phases auto-skipped, normal `main` phase plays.
4. All 3 scenarios compile without errors.
5. All `totalEcon` initial values are 15.
6. Full engine test suite: `pnpm -F @ludoforge/engine test` — all pass.
7. Full runner test suite: `pnpm -F @ludoforge/runner test` — all pass.
8. Runner fixture check: `pnpm -F @ludoforge/runner bootstrap:fixtures:check` — passes.
9. Typecheck: `pnpm turbo typecheck` — passes.
10. Lint: `pnpm turbo lint` — passes.

### Invariants

1. The complete coup phase sequence is: main → coupVictory → coupResources → coupSupport → coupRedeploy → coupCommitment → coupReset.
2. All coup phases are auto-skipped during non-coup turns.
3. The consecutive coup exception correctly prevents back-to-back coup rounds.
4. The game correctly transitions from coup round back to event card play.
5. Runner bootstrap fixture is synchronized with the production spec.
6. No engine code was modified across the entire ticket series.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-round-integration.test.ts` (new) — full coup round E2E, consecutive coup guard, post-reset normal play.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup-round-integration"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm -F @ludoforge/runner test` (full runner suite)
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
