# 70ACTTOOSYN-005: Complete FITL actionSummaries coverage in verbalization YAML

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None planned in this ticket
**Deps**: archive/tickets/70ACTTOOSYN-002.md

## Problem

This ticket originally assumed FITL had no authored `actionSummaries` yet and that engine support still needed to be wired. That assumption is now incorrect. The generic tooltip architecture already supports authored `actionSummaries`, and both FITL and Texas Hold'em already compile them. The remaining FITL gap is narrower: the current `actionSummaries` block covers the main operations and special activities, but it does not yet cover the full compiled FITL action surface.

As of reassessment on 2026-03-21, the compiled FITL GameDef exposes 45 actions while `data/games/fire-in-the-lake/05-verbalization.md` authors 21 FITL action summaries. The missing summaries are concentrated in coup-round, pacification, resource-transfer, and event-related actions.

## Assumption Reassessment (2026-03-21)

1. `actionSummaries` support already exists in the generic engine/compiler/test architecture.
2. `data/games/fire-in-the-lake/05-verbalization.md` already contains a partial `actionSummaries` block.
3. `data/games/texas-holdem/05-verbalization.md` already contains complete action summaries and is out of scope for implementation here.
4. The current FITL delta is data completeness, not engine plumbing.
5. Acceptance must be based on the compiled FITL `GameDef.actions` list, not on a hand-maintained action list in the ticket.

## Architecture Check

1. The current architecture is sounder than the original ticket assumed: authored action synopses are injected at the rule-card planning/annotation layer, while AST normalization remains focused on effect-derived messages.
2. This separation is preferable to pushing game-authored action summaries down into the AST normalizer. It keeps authored synopsis data as a presentation-layer concern and preserves a cleaner pipeline boundary.
3. This ticket therefore remains a data-authoring and verification task. No engine refactor is justified here.

## What to Change

### 1. Audit the compiled FITL action set

Use the compiled FITL `GameDef.actions` as the authoritative set of action IDs. Verify that every authored `actionSummaries` key matches a real action ID and identify all missing FITL action IDs.

### 2. Complete FITL actionSummaries coverage

**File**: `data/games/fire-in-the-lake/05-verbalization.md`

Add concise, imperative, one-line summaries for the currently missing compiled FITL actions, including the event/coup/resource-transfer/pacification actions that are already labeled but not yet summarized.

### 3. Prove coverage with tests

Strengthen production verbalization tests so they assert both of the following against the compiled action list:

1. No orphan `actionSummaries` keys exist.
2. No compiled FITL action ID is missing a summary.

This ticket should not rely only on spot checks like `train` or `rally`.

## Files to Touch

- `data/games/fire-in-the-lake/05-verbalization.md`
- `packages/engine/test/integration/compile-verbalization-integration.test.ts`
- `tickets/70ACTTOOSYN-005.md`

## Out of Scope

- Texas Hold'em action summary authoring changes
- Engine/compiler refactors for verbalization support
- Tooltip UI or visual changes
- Changing FITL rules/action behavior
- Adding summaries for non-action macros, triggers, or event card prose

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

### Behavioral Checks

1. Every FITL `actionSummaries` key matches a compiled FITL action ID.
2. Every compiled FITL action ID has an authored summary.
3. Existing authored summaries for already-covered actions remain intact unless wording needs minor cleanup for consistency.

## Test Plan

### New/Modified Tests

1. Extend production verbalization integration coverage to compare compiled action IDs against `verbalization.actionSummaries` for FITL.
2. Keep Texas Hold'em coverage as a regression guard for the generic architecture.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-21
- What actually changed: FITL `actionSummaries` was completed for the full compiled action set in `data/games/fire-in-the-lake/05-verbalization.md`, and production verbalization integration tests were strengthened to assert exact action-summary coverage for both FITL and Texas Hold'em.
- Deviation from original plan: the ticket was corrected first because its original assumptions were stale. Engine/compiler support for `actionSummaries`, synopsis planning, and Texas coverage already existed; the real remaining work was FITL data completion plus coverage-proof tests.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
