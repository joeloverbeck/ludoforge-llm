# 70ACTTOOSYN-006: Verify Texas Hold'em actionSummaries coverage and archive stale implementation ticket

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None
**Deps**: archive/tickets/70ACTTOOSYN-002.md

## Problem

This ticket originally assumed Texas Hold'em still lacked authored `actionSummaries`. That assumption is no longer true in the current codebase: the verbalization data, generic compilation support, synopsis plumbing, and test coverage are already implemented.

The remaining work is to correct the ticket so it reflects reality, verify the existing implementation, and archive the ticket with an accurate outcome.

## Assumption Reassessment (2026-03-21)

1. `data/games/texas-holdem/05-verbalization.md` exists with labels, stages, and macros — confirmed.
2. Texas Hold'em action IDs are `fold`, `check`, `call`, `raise`, and `allIn` in `data/games/texas-holdem/30-rules-actions.md` — confirmed.
3. `data/games/texas-holdem/05-verbalization.md` already defines matching `actionSummaries` for all compiled Texas Hold'em action IDs — confirmed.
4. Generic `actionSummaries` support is already present in compiler/kernel code:
   - `packages/engine/src/kernel/verbalization-types.ts`
   - `packages/engine/src/cnl/compile-verbalization.ts`
   - `packages/engine/src/kernel/condition-annotator.ts`
5. Test coverage already exists for both compilation and authored synopsis behavior:
   - `packages/engine/test/unit/cnl/compile-verbalization.test.ts`
   - `packages/engine/test/unit/kernel/condition-annotator.test.ts`
   - `packages/engine/test/integration/compile-verbalization-integration.test.ts`
   - `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`

## Architecture Check

1. The current architecture is preferable to the original ticket's proposed implementation.
2. The ticket spec suggested threading action summaries through the tooltip normalizer as synthetic `SummaryMessage` nodes. The current implementation instead passes authored synopses directly into content planning from `condition-annotator.ts`.
3. That current approach is cleaner and more extensible because action summaries are synopsis-level metadata, not normalized effect messages. It keeps the normalizer focused on effect IR and avoids introducing special-case message injection.
4. The current cross-game compilation and tooltip tests already prove the engine-agnostic architecture more directly than the original ticket plan.

## What to Change

1. Correct this ticket's assumptions and scope.
2. Verify that Texas Hold'em `actionSummaries` still match all compiled action IDs and still drive RuleCard synopses.
3. Archive the ticket as already satisfied by prior implementation.

## Files to Touch

- `tickets/70ACTTOOSYN-006.md` (status/scope correction before archival)

## Out of Scope

- FITL actionSummaries (70ACTTOOSYN-005)
- Engine or data changes, because the implementation already exists
- Reworking the tooltip pipeline architecture without a new spec/ticket

## Acceptance Criteria

### Tests That Must Pass

1. Every key in Texas Hold'em `actionSummaries` matches an actual compiled action ID.
2. Every compiled Texas Hold'em action ID has a corresponding `actionSummaries` entry.
3. Texas Hold'em RuleCard synopses use authored action summaries.
4. Relevant engine tests, lint, and typecheck pass.

### Invariants

1. No code or game data changes are needed to satisfy this ticket.
2. The current implementation remains engine-agnostic and cross-game.
3. The ticket is archived with an accurate record of what actually happened.

## Test Plan

### New/Modified Tests

1. None. Existing tests already cover compilation, coverage, and authored synopsis behavior for `actionSummaries`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/cnl/compile-verbalization.test.js dist/test/unit/kernel/condition-annotator.test.js dist/test/integration/compile-verbalization-integration.test.js dist/test/integration/tooltip-pipeline-integration.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket against the current codebase and tests.
  - Confirmed Texas Hold'em `actionSummaries` and the generic action-summary architecture were already implemented.
  - Corrected the ticket to reflect verification-and-archive scope instead of planned implementation work.
- Deviations from original plan:
  - No engine or data files were modified.
  - No new tests were added because the required coverage already existed.
  - The current architecture uses authored synopsis input at content-planning time rather than injecting synthetic summary messages into tooltip normalization; this is the cleaner design and should remain the architecture of record.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/cnl/compile-verbalization.test.js dist/test/unit/kernel/condition-annotator.test.js dist/test/integration/compile-verbalization-integration.test.js dist/test/integration/tooltip-pipeline-integration.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
