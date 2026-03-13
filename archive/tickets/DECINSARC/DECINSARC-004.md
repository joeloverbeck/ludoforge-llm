# DECINSARC-004: Verify and close the DecisionKey migration for move resolution and legal-choice discovery

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Maybe — tests first, code only if verification exposes a real gap
**Deps**: DECINSARC-001, DECINSARC-002, DECINSARC-003
**Spec Reference**: `specs/60-decision-instance-architecture.md`

## Reassessed Problem

This ticket was originally written as if `move-decision-sequence.ts` and `legal-choices.ts` still depended on `DecisionOccurrence` reconstruction and alias-based move-param writes.

That assumption is no longer correct. The current code already reflects the desired `DecisionKey` architecture:

1. [`packages/engine/src/kernel/move-decision-sequence.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/move-decision-sequence.ts) already writes `move.params[request.decisionKey] = selected`.
2. [`packages/engine/src/kernel/legal-choices.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-choices.ts) already builds discovery contexts through the `effect-context.ts` factories and probe writes already use `request.decisionKey`.
3. [`packages/engine/src/kernel/effect-context.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effect-context.ts) already centers discovery/execution contexts on `decisionScope`, with `emptyScope()` as the default.

The real work for this ticket is therefore not another rewrite. It is to verify that this migration slice is complete, strengthen tests around the intended invariants, and close the ticket if no behavioral gap remains.

## Assumption Reassessment (2026-03-13)

1. The ticket claim that `resolveMoveDecisionSequence()` reconstructs `DecisionOccurrence` objects is stale. It does not.
2. The ticket claim that `legal-choices.ts` still needs to move from occurrence machinery to `decisionScope` is stale. It already has.
3. `decision-occurrence.ts` still exists and is still exported, but it is not used by the two files in this ticket. Its removal is a separate cleanup concern and should not be forced into this ticket unless verification proves a real dependency.
4. Existing unit coverage already exercises `decisionKey` behavior in both files, so the remaining question is whether there is an untested invariant around rejecting legacy alias keys or other stale lookup paths.

## Architecture Verdict

The architecture currently in code is better than the original ticket plan because it has already reached the cleaner end state that Spec 60 pushes toward for this slice:

1. `DecisionKey` is the only key used by these paths for move-param writes.
2. `decisionScope` is threaded via the effect-context factories instead of ad hoc per-call occurrence plumbing.
3. Rewriting these files again just to mirror the old ticket text would be churn, not improvement.

If verification reveals remaining alias fallback or stale occurrence coupling in this slice, fix that directly. Otherwise, prefer closing the ticket over forcing more edits.

## Scope

### In Scope

1. Re-verify the current behavior of `move-decision-sequence.ts` and `legal-choices.ts` against Spec 60.
2. Add or strengthen tests only where an invariant is under-covered.
3. Make minimal code changes only if verification exposes an actual discrepancy.
4. Mark the ticket complete and archive it with an outcome note once verification and tests pass.

### Out of Scope

1. Rewriting already-correct `DecisionKey` code just to match an outdated ticket description.
2. Deleting `decision-occurrence.ts` or removing its exports unless a verified dependency chain requires it.
3. Runner changes.
4. Game-specific logic.

## Concrete Verification Targets

1. `resolveMoveDecisionSequence()` must continue to resolve decisions exclusively through `request.decisionKey`.
2. `legalChoicesDiscover()` and legal-choice probing must continue to use `decisionScope`-backed effect contexts.
3. Legacy alias keys must not silently satisfy a `DecisionKey` decision in this slice.
4. Probe vs strict discovery semantics must remain unchanged.
5. Chooser-owned decision authority must remain unchanged.

## Files Expected To Change

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` only if a missing invariant needs a regression test.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` only if a missing invariant needs a regression test.
3. `tickets/DECINSARC-004.md`

Code files under `packages/engine/src/kernel/` should change only if verification exposes a real mismatch.

## Acceptance Criteria

1. The ticket text reflects the actual codebase state.
2. Relevant engine tests pass.
3. If alias rejection or another important invariant was under-tested, regression coverage is added.
4. No unnecessary architectural churn is introduced.
5. The ticket is marked complete and archived with a short outcome summary.

## Test Plan

### Relevant Suites

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test`

### Additional Expectation

If a missing invariant is found, add the narrowest regression test that captures it instead of broad speculative coverage.

## Outcome

- Completion date: 2026-03-13
- What actually changed: Rewrote the ticket to match the current codebase, confirmed that `move-decision-sequence.ts` and `legal-choices.ts` had already landed the intended `DecisionKey`/`decisionScope` architecture, and added narrow regressions proving that legacy bind-name alias params do not satisfy effect-choice discovery in this slice.
- Deviations from original plan: No engine production code changes were needed in the two files named by the original ticket because the migration work had already been completed. The ticket closed as a verification-and-regression pass instead of a rewrite task.
- Verification results: `pnpm -F @ludoforge/engine build`, `pnpm turbo test`, and `pnpm turbo lint` all completed successfully. `pnpm turbo lint` completed with pre-existing warnings only.
