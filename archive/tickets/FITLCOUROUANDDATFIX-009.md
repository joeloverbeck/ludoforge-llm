# FITLCOUROUANDDATFIX-009: Coup Round Integration Verification and Fixture Sync

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None expected — verification, fixture sync, and documentation/archive hygiene
**Deps**: FITLCOUROUANDDATFIX-003, FITLCOUROUANDDATFIX-004, FITLCOUROUANDDATFIX-005, FITLCOUROUANDDATFIX-006, FITLCOUROUANDDATFIX-007, FITLCOUROUANDDATFIX-008

## Problem

The coup phase implementation tickets (001-008) are already delivered and archived, but this final ticket still assumes missing integration coverage and includes stale command/docs expectations. This ticket now focuses on verifying the implemented architecture, syncing runner bootstrap fixtures, and closing/archiving the spec + ticket cleanly.

## Assumption Reassessment (2026-02-23)

1. Coup phase coverage already exists across production integration tests:
   - `fitl-coup-phase-structure.test.ts`
   - `fitl-coup-victory-phase-gating.test.ts`
   - `fitl-coup-resources-phase.test.ts`
   - `fitl-coup-support-production.test.ts`
   - `fitl-coup-redeploy-phase.test.ts`
   - `fitl-coup-commitment-phase.test.ts`
   - `fitl-coup-reset-phase.test.ts`
2. The runner fixture generation command is `pnpm -F @ludoforge/runner bootstrap:fixtures` (not `bootstrap:fixtures:generate`).
3. `totalEcon = 15` is already encoded in production FITL scenario data; this ticket verifies it rather than re-implementing it.
4. `CLAUDE.md` status lists are stale relative to FITLCOUROUANDDATFIX completion and should be updated as part of closeout.
5. Spec 43 (`specs/43-fitl-coup-round-and-data-fixes.md`) is still Draft and should be marked COMPLETED then archived once verification passes.

## Architecture Check

1. Current architecture (generic card-driven `coupPlan` + phase auto-advance + phase-specific production tests) is clean, robust, and extensible.
2. A single monolithic coup E2E test is not required if it only duplicates phase-level production coverage; prefer focused invariants with low brittleness.
3. Add or strengthen tests only if verification exposes an uncovered edge/invariant.
4. No backwards-compatibility/aliasing constraints for this closeout; correctness and architecture quality take priority.

## What to Change

### 1. Validate existing coup integration coverage and fill only real gaps

1. Audit existing production tests for:
   - coup phase ordering and entry rules
   - consecutive coup suppression
   - resources/support/redeploy/commitment/reset behavior
   - return to normal event-card lifecycle
2. Only if a real gap is found, add one narrowly scoped integration test (do not duplicate existing phase suites).

### 2. Regenerate runner bootstrap fixture

```bash
pnpm -F @ludoforge/runner bootstrap:fixtures
```

### 3. Verify fixture consistency and full regression suite

Run the required checks and ensure all pass:
- targeted coup integration tests
- full engine tests
- full runner tests
- bootstrap fixture check
- workspace typecheck + lint

### 4. Update CLAUDE.md

- Add FITLCOUROUANDDATFIX to completed ticket series.
- Remove it from active-ticket context if referenced as active.
- Keep references consistent with archived locations.

### 5. Mark Spec 43 as COMPLETED and archive spec/ticket

Update `specs/43-fitl-coup-round-and-data-fixes.md` status from Draft to COMPLETED.
Then archive:
- `specs/43-fitl-coup-round-and-data-fixes.md` → `archive/specs/43-fitl-coup-round-and-data-fixes.md`
- `tickets/FITLCOUROUANDDATFIX-009.md` → `archive/tickets/FITLCOUROUANDDATFIX-009.md`

Both archived files must include an Outcome section summarizing actual delivered work vs original plan.

## Files to Touch

- `tickets/FITLCOUROUANDDATFIX-009.md` (modify — reassessed assumptions/scope, then archive)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify if regeneration changes output)
- `CLAUDE.md` (modify — update ticket series and status)
- `specs/43-fitl-coup-round-and-data-fixes.md` (modify — mark COMPLETED, add Outcome, then archive)
- Optional: one new engine integration test only if a verified gap is found

## Out of Scope

- Any new coup feature work beyond Spec 43
- Refactoring already-stable coup architecture without a demonstrated correctness gap
- New game features beyond Spec 43 scope
- Unnecessary test rewrites that duplicate existing production coverage

## Acceptance Criteria

### Tests That Must Pass

1. Coup regression coverage is confirmed sufficient, or exactly one additional targeted test is added to cover a proven gap.
2. Consecutive coup guard (Rule 6.0 exception) remains verified by tests.
3. Non-coup progression skips coup phases as expected.
4. All 3 FITL scenarios compile without errors.
5. All scenario `totalEcon` initial values are 15.
6. Full engine test suite: `pnpm -F @ludoforge/engine test` — passes.
7. Full runner test suite: `pnpm -F @ludoforge/runner test` — passes.
8. Runner fixture check: `pnpm -F @ludoforge/runner bootstrap:fixtures:check` — passes.
9. Typecheck: `pnpm turbo typecheck` — passes.
10. Lint: `pnpm turbo lint` — passes.

### Invariants

1. The complete coup phase sequence is: main → coupVictory → coupResources → coupSupport → coupRedeploy → coupCommitment → coupReset.
2. All coup phases are auto-skipped during non-coup turns.
3. The consecutive coup exception correctly prevents back-to-back coup rounds.
4. The game correctly transitions from coup round back to event card play.
5. Runner bootstrap fixture is synchronized with the production spec.
6. No unnecessary engine architecture changes are introduced in this closeout ticket.

## Test Plan

### New/Modified Tests

- Existing:
  - `packages/engine/test/integration/fitl-coup-phase-structure.test.ts`
  - `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts`
  - `packages/engine/test/integration/fitl-coup-resources-phase.test.ts`
  - `packages/engine/test/integration/fitl-coup-support-production.test.ts`
  - `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts`
  - `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts`
  - `packages/engine/test/integration/fitl-coup-reset-phase.test.ts`
- Optional new test only if a concrete uncovered invariant is found during reassessment.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="FITL coup"` (targeted sweep)
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm -F @ludoforge/runner test` (full runner suite)
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm -F @ludoforge/runner bootstrap:fixtures`
7. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`

## Outcome

- Completion date: 2026-02-23
- Implemented:
  - Reassessed and corrected ticket assumptions/scope to match the actual codebase and test reality.
  - Regenerated runner bootstrap fixtures (`packages/runner/src/bootstrap/fitl-game-def.json`) and verified fixture sync.
  - Verified existing coup architecture and production test coverage without introducing redundant monolithic tests.
  - Updated repository status documentation and archived closeout artifacts (this ticket + Spec 43).
- Deviations from original plan:
  - Did not add a new `fitl-coup-round-integration.test.ts`; existing production integration tests already provide robust phase-by-phase coverage for the required invariants.
  - Corrected fixture command usage from `bootstrap:fixtures:generate` to `bootstrap:fixtures`.
- Verification:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern="FITL coup"` passed (full engine suite executed and passed in this run).
  - `pnpm -F @ludoforge/runner bootstrap:fixtures` passed.
  - `pnpm -F @ludoforge/runner bootstrap:fixtures:check` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
