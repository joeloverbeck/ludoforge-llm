# 124PHABESREP-002: FITL integration test for best-of-N Phase 1 differentiation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/124PHABESREP-001.md`

## Problem

The best-of-N selection logic (124PHABESREP-001) needs end-to-end validation against a real game (FITL) to confirm that opponent-aware candidate features produce meaningfully different values across action types when `phase1CompletionsPerAction > 1`. Unit tests prove the selection mechanic works; this integration test proves it achieves its stated purpose — enabling agent evolution to discriminate between action types at Phase 1.

## Assumption Reassessment (2026-04-10)

1. `phase1-preview-differentiation.test.ts` exists at `packages/engine/test/integration/` — confirmed.
2. The test already has `projectedSelfMarginContribution` helper (line 89) and `Phase1Witness` interface (line 30) — confirmed, reusable for best-of-3.
3. The test currently uses `phase1CompletionsPerAction: 1` (line 63) — confirmed, new test case will use `phase1CompletionsPerAction: 3`.
4. `compileProductionSpec()` helper exists at `test/helpers/production-spec-helpers.ts` — confirmed.
5. FITL production spec compiles successfully and exposes ARVN profile with preview config — confirmed by existing test.

## Architecture Check

1. Test-only change — no engine code modified. No agnosticism concerns.
2. Uses existing `compileProductionSpec()` infrastructure — no new test helpers needed.
3. Extends existing test file rather than creating a new one — follows existing test organization pattern.

## What to Change

### 1. Add best-of-3 test case to `phase1-preview-differentiation.test.ts`

Add a new `describe` block or `it` case alongside the existing Phase 1 preview tests:

1. Create a FITL GameDef with ARVN profile's `phase1CompletionsPerAction: 3`.
2. Run a `PolicyAgent.chooseMove()` call at an ARVN decision point with verbose tracing.
3. Extract `projectedSelfMarginContribution` per action type using the existing helper.
4. Assert that at least 2 action types produce different projected self-margin values at the same decision point.
5. Assert that the best-of-3 margin for each action type is >= the first-of-1 margin (selection never worsens quality).

### 2. Determinism sub-assertion

Run the same decision point twice with the same seed. Assert the projected margins are identical across both runs.

## Files to Touch

- `packages/engine/test/integration/phase1-preview-differentiation.test.ts` (modify — add best-of-3 test case)

## Out of Scope

- Testing other games (FITL is the primary integration test target)
- Testing N values other than 3
- Performance benchmarking (performance overhead is covered by spec's theoretical analysis and existing performance test infrastructure)
- Modifying any FITL profile YAML

## Acceptance Criteria

### Tests That Must Pass

1. With `phase1CompletionsPerAction: 3`, at least 2 FITL action types at the same ARVN decision point produce different `projectedSelfMarginContribution` values
2. Best-of-3 projected margins are >= corresponding first-of-1 margins for every action type tested
3. Same seed produces identical projected margins across two runs (determinism)
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Integration test does not modify production FITL YAML or compiled GameDef golden fixtures
2. Test is deterministic — no flaky assertions, seed-controlled RNG (Foundation 8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/phase1-preview-differentiation.test.ts` — best-of-3 differentiation and quality assertions

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "best-of-3|bestOf3|phase1.*differentiation"`
2. `pnpm turbo test`

## Outcome

- Completed: 2026-04-10
- What landed:
  - Extended `packages/engine/test/integration/phase1-preview-differentiation.test.ts` to exercise FITL ARVN with `phase1CompletionsPerAction: 3`.
  - Added a bounded comparable witness search proving a live ARVN decision point where best-of-3 both differentiates template actions and keeps every tested projected self-margin at least as strong as first-of-1 at the same seed/ply.
  - Kept the determinism replay assertion on the same witness surface so the integration proof remains seed-stable and non-flaky.
- Boundary notes:
  - The archived sibling `124PHABESREP-001` remained the engine-code owner; this ticket stayed test-only.
  - No schema or generated artifact changes were required; schema artifact sync was checked and remained clean through the package test lane.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node dist/test/integration/phase1-preview-differentiation.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
- Verification command substitution:
  - The ticket's focused `--test-name-pattern` example is stale for this package's Node test runner workflow. The live focused proof used the repo-approved built-test form instead of the Jest-style filter.
