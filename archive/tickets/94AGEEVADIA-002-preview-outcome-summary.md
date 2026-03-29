# 94AGEEVADIA-002: Reassess preview outcome diagnostics scope

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No additional engine changes expected
**Deps**: [94AGEEVADIA-001](/home/joeloverbeck/projects/ludoforge-llm/.claude/worktrees/94ageevadia/archive/tickets/94AGEEVADIA-001-trace-diagnostic-types.md)

## Problem

This ticket originally assumed `policy-preview.ts` still needed two new runtime-facing exports:

1. a standalone preview-outcome summarizer over the preview cache
2. a cache accessor exposing the runtime's internal `Map<string, PreviewOutcome>`

Those assumptions are now stale. The current codebase already ships preview outcome breakdowns, completion statistics, schema wiring, and per-candidate preview outcomes through the policy evaluation path. The remaining work for this ticket is to correct the record, verify that the existing implementation is architecturally preferable to the original plan, and archive the ticket accordingly.

## Assumption Reassessment (2026-03-29)

### Confirmed current implementation

1. `packages/engine/src/agents/policy-preview.ts` exposes a narrow `PolicyPreviewRuntime` contract with `resolveSurface()` and `getOutcome()` only.
2. `packages/engine/src/agents/policy-eval.ts` already computes `previewUsage.outcomeBreakdown` and threads `previewOutcome` into candidate metadata.
3. `packages/engine/src/agents/prepare-playable-moves.ts` already returns `statistics` with completion counters.
4. `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` already include the trace and schema shapes for:
   - `PolicyPreviewOutcomeBreakdownTrace`
   - `PolicyCompletionStatisticsTrace`
   - `PolicyCandidateDecisionTrace.previewOutcome`
   - `PolicyPreviewUsageTrace.outcomeBreakdown`
5. Existing tests already exercise the shipped diagnostics in unit and integration coverage.

### Original ticket assumptions that are now incorrect

1. `policy-preview.ts` does **not** need to export `PreviewOutcome` or expose its internal cache.
2. A cache-level `summarizePreviewOutcomes(cache)` helper is **not** the current architecture. Outcome breakdown is summarized at the evaluation layer from evaluated candidate metadata, not by leaking preview-runtime internals.
3. `PolicyPreviewRuntime` is not merely missing an accessor; the better architecture is to keep preview caching private and expose only the semantic query `getOutcome(candidate)`.
4. The ticket is no longer an implementation ticket for `policy-preview.ts`; it is now a verification-and-archive ticket documenting that later work already satisfied the underlying requirement.

## Architecture Reassessment

The current architecture is better than the original plan.

1. Keeping the preview cache private is cleaner than adding `getOutcomeCache()`.
   The cache is an implementation detail of preview evaluation. Exposing it would widen the surface area, couple callers to storage shape, and make future refactors harder.
2. `getOutcome(candidate)` is the right abstraction boundary.
   Callers need semantic outcome classification for a candidate, not direct access to mutable cache state.
3. Summarizing at the evaluation layer is more extensible than summarizing raw runtime cache state.
   `policy-eval.ts` already has candidate metadata, deduplicated preview refs, and trace assembly context. That is the correct place to aggregate diagnostics.
4. The implemented design aligns with `docs/FOUNDATIONS.md`.
   It preserves immutability boundaries, avoids unnecessary compatibility shims, and keeps the architecture focused on durable contracts rather than convenience accessors.

## Updated Scope

### In Scope

1. Verify that the current implementation already satisfies the diagnostic intent behind Spec 94 and this ticket.
2. Run the relevant tests and lint for the affected engine paths.
3. Mark the ticket completed and archive it with an `Outcome` section describing what was actually implemented versus the original plan.

### Out of Scope

1. Adding `getOutcomeCache()` to `createPolicyPreviewRuntime`
2. Exporting `PreviewOutcome`
3. Moving outcome aggregation back into `policy-preview.ts`
4. Reworking already-implemented diagnostics solely to match the obsolete original ticket text

## Acceptance Criteria

1. The ticket text accurately reflects the current codebase and supersedes the obsolete cache-accessor plan.
2. Relevant engine tests covering preview outcome diagnostics and completion statistics pass.
3. Relevant lint checks pass.
4. The ticket is archived with an `Outcome` section documenting the divergence from the original proposal.

## Verification Plan

1. Run targeted engine tests covering:
   - `policy-preview`
   - `policy-agent` diagnostics
   - policy trace event diagnostics
   - FITL policy-agent diagnostic integration
2. Run `pnpm -F @ludoforge/engine lint`

## Notes For Archive Outcome

When archiving, record that the codebase solved the underlying problem via `getOutcome(candidate)` plus evaluation-layer aggregation, rather than by exporting the preview cache or adding a cache summarizer to `policy-preview.ts`.

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Reassessed the ticket against the live codebase and corrected the ticket scope.
  - Confirmed the diagnostics requirement had already been implemented through `getOutcome(candidate)`, evaluation-layer aggregation in `policy-eval.ts`, completion statistics in `prepare-playable-moves.ts`, and trace/schema wiring.
  - Verified the implementation with targeted engine tests and engine lint.
- Deviations from original plan:
  - Did not add `getOutcomeCache()` to `createPolicyPreviewRuntime`.
  - Did not export `PreviewOutcome`.
  - Did not add a cache summarizer to `policy-preview.ts`.
  - Retained the cleaner architecture that keeps preview-runtime cache state private and summarizes diagnostics from evaluated candidate metadata.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/agents/policy-preview.test.ts`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/agents/policy-agent.test.ts`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/trace/policy-trace-events.test.ts`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-policy-agent.test.ts`
  - `pnpm -F @ludoforge/engine lint`
