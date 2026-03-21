# 70ACTTOOSYN-007: Reassess and complete tooltip pipeline coverage for action summaries

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test files only unless reassessment exposes a real regression
**Deps**: archive/tickets/70ACTTOOSYN-001.md, archive/tickets/70ACTTOOSYN-002.md, archive/tickets/70ACTTOOSYN-003.md, archive/tickets/70ACTTOOSYN-004.md, archive/tickets/70ACTTOOSYN-005.md, archive/tickets/70ACTTOOSYN-006.md

## Problem

The ticket originally assumed that tickets 001–006 had left only an integration-test gap. That assumption is inaccurate. The codebase already contains the implementation and broad test coverage for:

- compiling `actionSummaries` from verbalization YAML,
- carrying authored action summaries through tooltip generation,
- preferring authored summaries in final synopsis realization,
- humanizing `scalarArray` values,
- and asserting FITL/Texas synopsis output end-to-end.

What remains is to verify the current architecture, correct the stale assumptions in this ticket, and add any narrow missing integration assertion if a real coverage hole still exists.

## Assumption Reassessment (2026-03-20)

1. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` already contains FITL and Texas authored-synopsis assertions — confirmed.
2. `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` exists, but it is not the right place for action-summary-specific behavior unless a truly cross-game invariant is missing — confirmed.
3. `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` exists, but this ticket does not require golden updates unless reassessment finds a real output gap — confirmed.
4. `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` remains the canonical FITL production compilation helper — confirmed.
5. Source and data changes previously described in Spec 70 are already present in the codebase:
   - `actionSummaries` compile support exists.
   - FITL and Texas verbalization data already define action summaries.
   - synopsis priority and authored synopsis realization already exist.
   - `scalarArray` stringification and humanization support already exist.

## Architecture Check

1. Integration tests must exercise the real production compilation and `describeAction()` pipeline with no mocks of compiler/kernel tooltip modules.
2. The current shipped architecture is better than the earlier spec draft:
   - action-level authored synopses are passed as explicit `ContentPlan.authoredSynopsis` metadata from `condition-annotator`,
   - macro-derived summaries remain normalized `summary` messages,
   - and the realizer gives authored action metadata precedence over normalized messages.
3. This separation is cleaner and more extensible than injecting action summaries into the normalizer as synthetic `SummaryMessage` entries, because authored action synopsis is action metadata, not effect-derived content.
4. No backwards-compatibility aliases or alternate paths should be introduced. If the current architecture is correct, tests should lock it in rather than duplicate it through a second path.

## What to Change

### 1. Reassess and tighten current integration coverage

Review existing tooltip/verbalization tests and confirm whether they already prove:

- FITL authored synopsis reaches final `RuleCard.synopsis`,
- Texas authored synopsis reaches final `RuleCard.synopsis`,
- `scalarArray` humanization is exercised in the real pipeline rather than only unit tests.

Only add tests where proof is still missing.

### 2. Add the missing end-to-end `scalarArray` assertion if needed

If coverage does not already prove the integration path, add one focused FITL assertion against a stable real action (for example `train`) that:

- produces tooltip step text containing the humanized form (`"City or Province"`),
- and does not contain the debug fallback `expr(scalarArray)`.

### 3. Do not widen scope unless reassessment proves it is necessary

Do not rework source architecture, cross-game property tests, or goldens unless the focused verification uncovers a real failing invariant.

## Files to Touch

- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify only if the reassessment finds a genuine missing integration assertion)
- `packages/engine/test/integration/tooltip-cross-game-properties.test.ts` (leave unchanged unless a real cross-game invariant is missing)
- `packages/engine/test/e2e/fitl-tooltip-golden.test.ts` (leave unchanged unless a real output regression requires a golden update)

## Out of Scope

- Re-implementing already-landed engine or game-data work
- Refactoring the tooltip architecture to match an older spec draft when the current implementation is cleaner
- Runner/UI tests (tooltip rendering is already tested in runner tests)
- Adding new helpers or fixtures unless absolutely required
- Performance testing of the tooltip pipeline

## Acceptance Criteria

### Tests That Must Pass

1. The ticket accurately describes the current implementation and no longer claims that only tickets 001–004 matter or that source work is still pending if it already landed.
2. Existing FITL and Texas integration tests prove authored action summaries reach final tooltip synopses.
3. The real tooltip pipeline is proven to humanize `scalarArray` output for at least one stable FITL action, with an explicit assertion that `expr(scalarArray)` does not appear.
4. Relevant engine tests pass after any ticket/test updates.
5. `pnpm turbo test`, `pnpm turbo typecheck`, and `pnpm turbo lint` pass before archival.

### Invariants

1. No source changes are made unless reassessment finds an actual failing invariant not already implemented.
2. If no source regression is found, this ticket should complete through ticket correction plus test strengthening only.
3. Production spec compilation continues to succeed for both FITL and Texas Hold'em.
4. Existing tooltip tests continue to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — keep existing synopsis assertions and add one focused `scalarArray` pipeline assertion only if missing.
2. Ticket document itself — corrected assumptions, scope, and architecture notes before implementation finalization.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "tooltip|verbalization|actionSummar|scalarArray|synopsis"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket against the current codebase and corrected stale assumptions about missing implementation work.
  - Confirmed the code already supports compiled `actionSummaries`, authored synopsis precedence, and `scalarArray` humanization.
  - Added one focused integration assertion in `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` proving a real FITL tooltip (`train`) renders `City or Province` and never regresses to `expr(scalarArray)`.
- Deviations from original plan:
  - No engine-source or game-data changes were needed.
  - No `tooltip-cross-game-properties` or FITL golden updates were needed.
  - The shipped architecture differs from the earlier spec draft and is better: action-level authored synopses flow through `ContentPlan.authoredSynopsis` rather than being injected into the normalizer as synthetic summary messages.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "tooltip pipeline integration|verbalization compilation integration|tooltip cross-game property tests|tooltip-value-stringifier|tooltip-template-realizer|tooltip-content-planner"` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
