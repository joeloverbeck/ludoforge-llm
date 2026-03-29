# 94AGEEVADIA-004: Reassess eval diagnostics wiring and harden coverage

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Maybe — tests only unless reassessment exposes a real wiring gap
**Deps**: 94AGEEVADIA-005

## Problem

This ticket originally assumed the eval/diagnostics wiring had not yet been implemented. That assumption is no longer true in the current worktree: the policy evaluation and diagnostics pipeline already threads preview outcome breakdowns, completion statistics, and per-candidate preview outcomes through to trace consumers.

The real task is to:

1. verify that the implemented architecture is the right one,
2. correct the ticket so it reflects current code and tests,
3. add only any missing direct coverage needed to lock the behavior down.

## Assumption Reassessment (2026-03-29)

1. `PolicyEvaluationPreviewUsage` already includes `outcomeBreakdown` in [`packages/engine/src/agents/policy-eval.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/src/agents/policy-eval.ts).
2. `PolicyEvaluationCandidateMetadata` already includes `previewOutcome` in [`packages/engine/src/agents/policy-eval.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/src/agents/policy-eval.ts).
3. `PolicyEvaluationMetadata` already includes `completionStatistics` in [`packages/engine/src/agents/policy-eval.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/src/agents/policy-eval.ts).
4. `buildPolicyAgentDecisionTrace` already gates verbose-only fields and always includes `previewUsage` in [`packages/engine/src/agents/policy-diagnostics.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/src/agents/policy-diagnostics.ts).
5. Trace types and schema entries for `outcomeBreakdown`, `completionStatistics`, and `previewOutcome` already exist in [`packages/engine/src/kernel/types-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/src/kernel/types-core.ts), [`packages/engine/src/kernel/schemas-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/src/kernel/schemas-core.ts), and [`packages/engine/schemas/Trace.schema.json`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/schemas/Trace.schema.json).
6. Existing tests already cover large parts of the behavior in:
   - [`packages/engine/test/unit/agents/policy-agent.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/test/unit/agents/policy-agent.test.ts)
   - [`packages/engine/test/unit/trace/policy-trace-events.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/test/unit/trace/policy-trace-events.test.ts)
   - [`packages/engine/test/integration/fitl-policy-agent.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/test/integration/fitl-policy-agent.test.ts)
7. The ticket's original focused test commands were wrong for this repo. Engine tests use Node's test runner over built files, and `pnpm -F @ludoforge/engine test -- --test-name-pattern=...` is not a supported workflow here.

## Architecture Reassessment

The current architecture is better than the original ticket proposal in one key respect:

1. The original ticket wanted eval to read the preview runtime's internal outcome cache through a new accessor. The implemented code instead derives diagnostics from candidate-level evaluation metadata inside `policy-eval.ts`.
2. That keeps preview-runtime internals encapsulated. `policy-preview.ts` remains responsible for preview resolution, while `policy-eval.ts` owns evaluation-facing diagnostics.
3. This is cleaner, more robust, and more extensible than exposing internal cache state across module boundaries. It avoids widening the preview runtime API only to satisfy diagnostics.

Ideal direction from here:

1. Keep preview-runtime APIs focused on preview semantics, not tracing concerns.
2. Keep diagnostic aggregation at the evaluation/trace boundary, where candidate context already exists.
3. Add tests at the lowest level that protects the contract without duplicating higher-level end-to-end coverage.

## Updated Scope

This ticket is now limited to:

1. verifying that existing eval/diagnostics wiring behaves as intended,
2. adding missing direct tests only where current coverage is too indirect,
3. correcting and archiving the ticket once verification is complete.

Out of scope:

1. reworking `policy-preview.ts` to expose internal cache accessors,
2. refactoring working diagnostics plumbing just to match the superseded ticket design,
3. schema work already covered by 94AGEEVADIA-005.

## Acceptance Criteria

1. Ticket assumptions and scope accurately match the current codebase.
2. Relevant unit/integration tests covering diagnostic wiring pass.
3. Any missing direct test coverage identified during reassessment is added.
4. No unnecessary production refactor is performed if current architecture is already stronger than the ticket's original proposal.

## Test Plan

### New/Modified Tests

1. Strengthen direct diagnostics coverage only if current tests do not explicitly protect summary/verbose gating or metadata-to-trace mapping.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/agents/policy-eval.test.js`
3. `node --test dist/test/unit/agents/policy-preview.test.js`
4. `node --test dist/test/unit/prepare-playable-moves.test.js`
5. `node --test dist/test/unit/trace/policy-trace-events.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`
8. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-29
- What actually changed: corrected the ticket to match the implemented architecture, added a direct diagnostics-layer unit test in [`packages/engine/test/unit/agents/policy-diagnostics.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/packages/engine/test/unit/agents/policy-diagnostics.test.ts), and verified the existing eval/preview/prepare/trace coverage plus the full engine test lane.
- Deviations from original plan: no production wiring changes were needed. The original proposal to expose preview-runtime cache internals was intentionally not implemented because the current eval-owned aggregation is cleaner and better encapsulated.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/agents/policy-diagnostics.test.js`
  - `node --test dist/test/unit/agents/policy-eval.test.js`
  - `node --test dist/test/unit/agents/policy-preview.test.js`
  - `node --test dist/test/unit/prepare-playable-moves.test.js`
  - `node --test dist/test/unit/trace/policy-trace-events.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm turbo typecheck`
