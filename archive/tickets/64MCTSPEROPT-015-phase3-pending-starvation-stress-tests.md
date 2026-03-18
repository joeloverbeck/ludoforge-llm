# 64MCTSPEROPT-015: Phase 3 Pending-Starvation Stress Tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: 64MCTSPEROPT-007, 64MCTSPEROPT-008, 64MCTSPEROPT-009

## Problem

The spec's central goal is that pending FITL operations (rally, march, attack) stop getting zero visits. Phase 3 work (family widening, pending coverage, budget profiles) should be validated with dedicated stress tests proving this. The spec (section 4 Phase 3, section 6.2) requires tests that pending families receive visits in FITL stress scenarios.

## Assumption Reassessment (2026-03-18)

1. FITL MCTS e2e tests exist at `packages/engine/test/e2e/mcts-fitl/` — **confirmed**.
2. Tests are organized by budget profile: `fitl-mcts-interactive.test.ts` (200 iters), `fitl-mcts-turn.test.ts` (1500 iters), `fitl-mcts-background.test.ts` (5000 iters). The old "fast/strong" preset names were renamed to budget profiles by ticket 014.
3. Diagnostics include `rootChildVisits` keyed by `moveKey` — **confirmed**.
4. After ticket 008, `pendingFamiliesWithVisits` diagnostic is available — **confirmed** in `MctsSearchDiagnostics`.
5. `runFitlMctsSearch` strips `timeLimitMs` for determinism — budget-competence tests need a variant that preserves it.

## Architecture Check

1. These are validation tests, not implementation — they assert outcomes of Phase 3 work.
2. Tests use diagnostics to inspect root child visit distributions.
3. No game-specific logic in test infrastructure — uses generic diagnostics.

## What to Change

### 1. Add pending-family visit assertions to FITL interactive-profile scenarios

For each FITL interactive-profile scenario (200 iterations):
- Assert `pendingFamiliesWithVisits > 0` in diagnostics.
- Assert at least one of: rally, march, attack, or train family has >0 root-level visits.

### 2. Add explicit pending-starvation regression test

Create a test that:
- Runs MCTS on a FITL state with known high-cardinality ready families AND pending operations.
- With `wideningMode: 'familyThenMove'` and `pendingFamilyQuotaRoot: 1`.
- Asserts that at least one pending operation family gets visits within 100 iterations.

### 3. Add budget profile competence tests

For `interactive` and `turn` profiles on FITL:
- Assert search completes within `timeLimitMs`.
- Assert a move is returned (not a crash or timeout).
- Assert the returned move is legal.

### 4. Verify human-facing profiles always return inside budget

With `interactive` profile (2s budget):
- Assert `totalTimeMs < timeLimitMs` in diagnostics.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-interactive.test.ts` (modify — add pending-family assertions)
- `packages/engine/test/e2e/mcts-fitl/fitl-pending-starvation.test.ts` (new — explicit regression test)
- `packages/engine/test/e2e/mcts-fitl/fitl-budget-competence.test.ts` (new — profile compliance test)

## Out of Scope

- Changing MCTS implementation (implementation is in tickets 007/008/009)
- Texas Hold'em tests (separate concern)
- Decision discovery tests (ticket 64MCTSPEROPT-011)
- Performance timing thresholds (spec says prefer call-count reductions over brittle timing)

## Acceptance Criteria

### Tests That Must Pass

1. In S1 scenario with ≥50 iterations: at least one pending family receives >0 visits.
2. In S3 scenario with ≥50 iterations: at least one pending family receives >0 visits.
3. Explicit pending-starvation test: with `pendingFamilyQuotaRoot: 1`, pending family gets visits within 100 iterations.
4. `interactive` profile on FITL: search completes within `timeLimitMs`.
5. `turn` profile on FITL: search completes and returns a legal move.
6. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. Tests validate behavior, not implementation details.
2. No production source code changes in this ticket.
3. Assertions use diagnostics, not internal tree inspection.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts` — add pending-visit assertions.
2. `packages/engine/test/e2e/mcts-fitl/fitl-pending-starvation.test.ts` — regression test.
3. `packages/engine/test/e2e/mcts-fitl/fitl-budget-competence.test.ts` — profile compliance.

### Commands

1. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test`

## Outcome

**Completion date**: 2026-03-18

### What changed

1. **`fitl-mcts-interactive.test.ts`** — added `pending-family coverage` describe block with 9 scenario tests asserting `pendingFamiliesWithVisits > 0` and at least one pending operation family (rally/march/attack/train) has root-level visits.
2. **`fitl-pending-starvation.test.ts`** (new) — regression test running S1/S3 with explicit `wideningMode: 'familyThenMove'`, `pendingFamilyQuotaRoot: 1`, 100 iterations. Asserts pending families get visits and quota is exercised.
3. **`fitl-budget-competence.test.ts`** (new) — profile competence tests for `interactive` and `turn` profiles: search completes, returns a legal move, stays within `timeLimitMs`. Strict timing test for interactive's 2s budget.
4. **`fitl-mcts-test-helpers.ts`** — added `runFitlMctsTimedSearch` helper that preserves `timeLimitMs` (unlike `runFitlMctsSearch` which strips it).
5. **`mcts-lane-isolation.test.ts`** — fixed stale references from old preset names (fast/default/strong) to budget profiles (interactive/turn/background). This was a leftover from ticket 014's rename.

### Deviations from original plan

- Ticket referenced `fitl-mcts-fast.test.ts` which doesn't exist — corrected to `fitl-mcts-interactive.test.ts` (files were renamed by ticket 014).
- Also fixed the pre-existing `mcts-lane-isolation.test.ts` failure (same root cause: stale preset names from 014).

### Verification

- `pnpm turbo build` — pass
- `pnpm turbo typecheck` — pass
- `pnpm -F @ludoforge/engine test` — 5157 pass, 0 fail
