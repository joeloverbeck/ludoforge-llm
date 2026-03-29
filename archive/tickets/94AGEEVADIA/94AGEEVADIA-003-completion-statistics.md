# 94AGEEVADIA-003: Reassess and verify completion statistics in `preparePlayableMoves`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Maybe — tests first, source only if verification exposes a real gap
**Deps**: 94AGEEVADIA-001

## Problem

This ticket originally proposed adding completion statistics to `preparePlayableMoves`, but that assumption is no longer true. The codebase already computes completion statistics, threads them into policy evaluation metadata, and exposes them in verbose policy traces. The ticket must be corrected before any further implementation work so it reflects actual repo state and focuses only on remaining value: validating architecture and tightening proof through tests.

## Assumption Reassessment (2026-03-29)

1. `PreparedPlayableMoves.statistics` already exists and is currently required, not optional.
2. `preparePlayableMoves` already counts:
   - `completedCount`
   - `stochasticCount`
   - `rejectedNotViable`
   - `templateCompletionAttempts`
   - `templateCompletionSuccesses`
   - `templateCompletionUnsatisfiable`
   - `totalClassifiedMoves`
3. `PolicyAgent` already passes `prepared.statistics` into `evaluatePolicyMove`.
4. `policy-eval.ts`, `policy-diagnostics.ts`, `types-core.ts`, and `schemas-core.ts` already include completion-statistics plumbing.
5. Existing tests already cover:
   - direct complete and direct stochastic classified moves
   - mixed complete / rejected / template-success / template-unsatisfiable accounting
   - verbose policy traces including `completionStatistics`
6. The original ticket scope is therefore stale. The remaining meaningful work is verification and any missing edge-case coverage, not first-time implementation.

## Architecture Reassessment

### Keep

1. Keeping `statistics` required on `PreparedPlayableMoves` is better than the original optional-field proposal.
   Every `preparePlayableMoves` call produces a complete classification pass, so making statistics mandatory at that boundary is cleaner and removes pointless optional handling inside the agent layer.
2. Threading completion statistics only into verbose policy traces remains the correct external boundary.
   Internal agent code can rely on the data, while summary traces stay lightweight.
3. The implementation remains generic and aligned with `docs/FOUNDATIONS.md`.
   The counters describe engine-level classification behavior, not game-specific concepts.

### Potential Future Cleanup

1. `prepare-playable-moves.ts` currently imports `PolicyCompletionStatisticsTrace` from kernel trace types.
   That works, but the `*Trace` suffix leaks serialized-trace naming into an internal agent-preparation boundary.
2. A cleaner long-term architecture would rename this shared shape to a layer-neutral `PolicyCompletionStatistics` and reserve `PolicyCompletionStatisticsTrace` for actual trace/wire contracts only.
3. That cleanup is not required for this ticket unless verification exposes confusion or duplication that materially hurts maintainability.

## Updated Scope

### In Scope

1. Verify that the existing completion-statistics implementation matches Spec 94 intent.
2. Reassess whether the current implementation is architecturally cleaner than the ticket's original proposal.
3. Add or strengthen tests for any uncovered invariant or edge path found during review.
4. If verification reveals a real defect, fix the code with targeted changes only.

### Out of Scope

1. Re-implementing completion statistics from scratch.
2. Broad type renames or agent-trace refactors that are not required to fix a verified defect.
3. Any backward-compatibility aliasing or shims.

## Acceptance Criteria

1. The ticket text reflects the actual codebase state before code changes are made.
2. Relevant engine tests pass after verification work.
3. If a coverage gap is found, tests are added or strengthened to prove the invariant.
4. If no production defect is found, no production code is changed unnecessarily.
5. The completed ticket is archived with an Outcome section describing what was actually verified or changed versus the original plan.

## Verification Targets

1. `packages/engine/src/agents/prepare-playable-moves.ts`
2. `packages/engine/src/agents/policy-agent.ts`
3. `packages/engine/src/agents/policy-eval.ts`
4. `packages/engine/src/agents/policy-diagnostics.ts`
5. `packages/engine/src/kernel/types-core.ts`
6. `packages/engine/src/kernel/schemas-core.ts`
7. Existing tests under:
   - `packages/engine/test/unit/prepare-playable-moves.test.ts`
   - `packages/engine/test/unit/agents/policy-agent.test.ts`
   - `packages/engine/test/unit/trace/policy-trace-events.test.ts`

## Planned Test Work

1. Re-run the targeted prepare-playable-moves and policy trace suites.
2. Add a focused regression test if the current suite misses a classification path or invariant, especially around template completion that resolves to a stochastic move rather than a completed or unsatisfiable one.

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Corrected the ticket to reflect that completion statistics were already implemented across `preparePlayableMoves`, policy evaluation metadata, trace types, schemas, and existing tests.
  - Added one direct unit test proving that `pendingTemplateCompletions` is counted correctly when a single template move is completed multiple times.
  - Verified the broader architecture and kept production code unchanged because the existing implementation already matched the intended design better than the original ticket proposal.
- Deviations from original plan:
  - No source implementation was needed in `packages/engine/src/agents/prepare-playable-moves.ts`; the ticket had been rendered stale by already-landed work.
  - The original optional-statistics proposal was not adopted; the current required `PreparedPlayableMoves.statistics` boundary is cleaner internally and was retained.
- Verification results:
  - `node packages/engine/dist/test/unit/prepare-playable-moves.test.js`
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern="preparePlayableMoves|policy trace|completion statistics"`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `pnpm run check:ticket-deps`
