# 70ACTTOOSYN-003: Reassess actionSummaries tooltip wiring and harden authored synopsis coverage

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No architectural change expected; test hardening only unless reassessment finds a real gap
**Deps**: tickets/70ACTTOOSYN-002.md

## Problem

This ticket originally assumed that authored action summaries were missing from the action-tooltip pipeline and needed to be emitted by `tooltip-normalizer.ts` as `SummaryMessage` IR nodes. That assumption must be reassessed against the actual code before any implementation work proceeds.

## Assumption Reassessment (2026-03-21)

1. `actionSummaries` is already part of the verbalization contract.
   - Confirmed in [`packages/engine/src/kernel/verbalization-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/verbalization-types.ts).
   - Confirmed in [`packages/engine/src/cnl/compile-verbalization.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-verbalization.ts), which preserves `raw.actionSummaries`.
   - Confirmed in schema support via [`packages/engine/src/kernel/schemas-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/schemas-core.ts).
2. Production verbalization data already contains authored action summaries.
   - Confirmed in [`data/games/fire-in-the-lake/05-verbalization.md`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/05-verbalization.md).
   - Confirmed in [`data/games/texas-holdem/05-verbalization.md`](/home/joeloverbeck/projects/ludoforge-llm/data/games/texas-holdem/05-verbalization.md).
3. The action-tooltip pipeline already consumes `actionSummaries` at the correct architectural seam.
   - [`buildRuleCard()` in `condition-annotator.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/condition-annotator.ts#L421) reads `def.verbalization?.actionSummaries?.[String(action.id)]`.
   - It passes that string to `planContent(..., { authoredSynopsis })`, so synopsis generation already happens above the normalizer.
4. `tooltip-normalizer.ts` does not receive `actionId`, and that is appropriate.
   - The normalizer converts effect AST to effect-level `TooltipMessage[]`.
   - Action synopsis is action-level metadata and is cleaner at the rule-card builder layer than inside effect normalization.
5. Existing tests already prove major parts of this flow.
   - Compilation tests cover `actionSummaries`.
   - Integration tooltip tests already verify real FITL and Texas authored synopses.
   - The main missing coverage is a focused unit test at the action-tooltip builder seam to lock in precedence and avoid regressions.

## Architecture Check

1. The current architecture is better than the original proposal.
   - `actionSummaries` is action-level metadata, so consuming it in `buildRuleCard()` keeps responsibilities clean.
   - Threading `actionId` into `normalizeEffect()` would couple an effect-normalization layer to action identity for no real benefit.
2. The existing split is robust and extensible.
   - Effect-derived summaries remain represented as `SummaryMessage` IR when they come from macro/effect structure.
   - Authored action synopsis remains a dedicated top-level `authoredSynopsis` input to the content planner and template realizer.
3. No backwards-compatibility shims are needed.
   - The correct action is to preserve the current architecture and strengthen tests around it.

## What to Change

### 1. Correct the stale ticket scope

Replace the obsolete normalizer-focused implementation plan with the actual code reality:

- no `tooltip-normalizer.ts` change unless testing proves a real missing behavior
- no `actionId` threading into `NormalizerContext`
- no extra alias path between authored synopsis and effect-derived summary messages

### 2. Harden tests at the real seam

Add or strengthen tests that prove:

- `describeAction()` uses `verbalization.actionSummaries[action.id]` as the rule-card synopsis source
- authored action synopsis wins over auto-generated `select` / `choose` synopsis text
- actions without authored summaries still fall back to current generated synopsis behavior unchanged

## Files to Touch

- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify)
- `tickets/70ACTTOOSYN-003.md` (modify)

## Out of Scope

- Refactoring `tooltip-normalizer.ts`
- Threading `actionId` through the normalization pipeline
- Emitting action-level `SummaryMessage` nodes solely to duplicate existing `authoredSynopsis` behavior
- Changing verbalization YAML or schema contracts already in place
- Changing macro-originated `SummaryMessage` behavior

## Acceptance Criteria

### Tests That Must Pass

1. A focused unit test proves `describeAction()` produces an authored synopsis when `verbalization.actionSummaries[action.id]` exists.
2. A focused unit test proves authored synopsis takes precedence over auto-generated synopsis text for the same action.
3. Existing integration coverage for FITL and Texas authored synopses still passes.
4. Engine tests, lint, and typecheck pass.

### Invariants

1. `normalizeEffect()` remains pure and action-agnostic.
2. Action-level synopsis stays outside the effect normalizer.
3. Existing macro-originated `SummaryMessage` behavior remains untouched.
4. No compatibility layer or duplicate summary path is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts`
   - add a unit test proving `describeAction()` uses `actionSummaries[action.id]` as synopsis
   - add a unit test proving authored synopsis overrides generated `select` synopsis text

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket against the live code and corrected its assumptions.
  - Confirmed that `actionSummaries` was already implemented end-to-end in schema, compilation, production data, and the action tooltip pipeline.
  - Added focused unit coverage in `packages/engine/test/unit/kernel/condition-annotator.test.ts` to lock in the real architecture: `describeAction()` uses authored action summaries for synopsis generation and those authored summaries take precedence over generated choose/select synopsis text.
- Deviations from original plan:
  - No `tooltip-normalizer.ts` changes were made.
  - No `actionId` threading or action-level `SummaryMessage` injection was added.
  - The original proposal would have duplicated responsibility in the wrong layer; the current architecture in `condition-annotator.ts` is cleaner and was preserved.
- Verification results:
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
