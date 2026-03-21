# 70ACTTOOSYN-007: Integration tests for actionSummaries tooltip pipeline end-to-end

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test files only
**Deps**: archive/tickets/70ACTTOOSYN-001.md, archive/tickets/70ACTTOOSYN-002.md, archive/tickets/70ACTTOOSYN-003.md, archive/tickets/70ACTTOOSYN-004.md, archive/tickets/70ACTTOOSYN-005.md, archive/tickets/70ACTTOOSYN-006.md

## Problem

The individual unit tests in tickets 001–004 validate each component in isolation. An integration test is needed to prove that the full pipeline — from YAML `actionSummaries` through compilation, normalization, content planning, and template realization — produces the correct synopsis text on the final `RuleCard`.

## Assumption Reassessment (2026-03-20)

1. Integration test file exists at `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — confirmed.
2. `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` exists for cross-game tests — confirmed.
3. E2E golden test exists at `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` — confirmed; may need updating if golden snapshots change.
4. `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` is the canonical way to compile FITL specs — confirmed per CLAUDE.md testing requirements.

## Architecture Check

1. Integration tests exercise the real pipeline with real game data — no mocks of core engine modules.
2. Tests are game-specific but live in the test directory, not engine source — consistent with existing pattern.
3. Both FITL and Texas Hold'em are tested to prove engine-agnosticism.

## What to Change

### 1. FITL integration test

Compile the FITL production spec. For a known action with an authored summary (e.g., an action whose `actionSummaries` entry was added in ticket 005), generate the tooltip `RuleCard` and assert that the synopsis contains the authored summary text, NOT raw AST content.

Suggested assertion:
```
RuleCard synopsis for action "X" contains "authored summary text"
RuleCard synopsis for action "X" does NOT contain "expr(scalarArray)"
```

### 2. Texas Hold'em integration test

Compile the Texas Hold'em production spec. For the `fold` action, generate the tooltip `RuleCard` and assert:
```
RuleCard synopsis contains "Surrender hand and forfeit current bets"
```

### 3. scalarArray integration verification

If any compiled FITL action tooltip previously showed `expr(scalarArray)`, verify it now shows the humanized form (e.g., `"City or Province"`). This may overlap with existing golden tests — check whether golden snapshots need updating.

## Files to Touch

- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify — add actionSummaries tests)
- `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` (modify — add cross-game synopsis test)
- `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` (modify — update golden snapshots if they change due to scalarArray fix or summary addition)

## Out of Scope

- Engine source code changes (all done in tickets 001–004)
- Game data changes (done in tickets 005–006)
- Runner/UI tests (tooltip rendering is already tested in runner tests)
- Adding new test helpers or fixtures
- Performance testing of the tooltip pipeline

## Acceptance Criteria

### Tests That Must Pass

1. FITL integration: compile FITL → generate tooltip for a summarized action → RuleCard synopsis equals `"ActionLabel — authored summary text"`.
2. Texas Hold'em integration: compile Texas Hold'em → generate tooltip for `fold` → RuleCard synopsis equals `"Fold — Surrender hand and forfeit current bets"` (exact label may vary — match against actual compiled label).
3. scalarArray integration: any FITL tooltip that previously showed `expr(scalarArray)` now shows the humanized alternative (e.g., `"City or Province"`).
4. All existing integration and E2E tests pass (golden snapshots updated if necessary).
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No engine source code is modified in this ticket — test files only.
2. Production spec compilation succeeds for both FITL and Texas Hold'em.
3. All existing tooltip tests continue to pass.
4. Golden snapshot updates (if any) are intentional improvements, not regressions — the diff should show `expr(scalarArray)` → `"City or Province"` or similar.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — FITL and Texas Hold'em actionSummaries end-to-end tests.
2. `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` — cross-game synopsis consistency test.
3. `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` — golden snapshot updates.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "synopsis|actionSummar"`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
