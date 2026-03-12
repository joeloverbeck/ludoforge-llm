# FREEOP-002: Reassess free-operation sequence batches for partial implementability

**Status**: COMPLETED
**Completed**: 2026-03-12
**Priority**: HIGH
**Effort**: Reassessment only
**Engine Changes**: No
**Deps**: `tickets/README.md`, `reports/fire-in-the-lake-rules-section-5.md`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/integration/fitl-events-macv.test.ts`, `packages/engine/test/unit/validate-gamedef.test.ts`, `archive/tickets/FREEOP/FREEOP-001-grant-scoped-action-context.md`

## Reassessment Summary

The original ticket assumed the kernel still modeled ordered free-operation batches as "earlier pending grant exists, therefore later step is blocked" and that the clean fix was a new explicit per-step runtime lifecycle with skip states.

That assumption is no longer true.

The current engine already has a deliberate generic architecture around `viabilityPolicy: requireUsableAtIssue` and `requireUsableForEventPlay`:

1. Event-issued grants are probed before emission in [`packages/engine/src/kernel/turn-flow-eligibility.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/turn-flow-eligibility.ts).
2. Effect-issued grants use the same viability contract in [`packages/engine/src/kernel/effects-turn-flow.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-turn-flow.ts).
3. Sequence probing in [`packages/engine/src/kernel/free-operation-viability.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-viability.ts) already distinguishes between:
   - earlier steps that are currently usable, which remain blockers
   - earlier steps that are currently unusable, which do not emit and are represented only as synthetic probe blockers during viability evaluation
4. Authorization, discovery, and legal-move generation consistently rely on the already-emitted pending-grant set plus sequence readiness checks, rather than on a missing explicit lifecycle table.
5. Existing tests already lock this contract for both event-issued and effect-issued grants.

## Corrected Assumptions

1. The kernel does not lack generic partial-viability probing. It already has it.
2. The current architectural boundary is intentional: issue only grants that satisfy the authored viability contract, then keep runtime state minimal by tracking only emitted pending grants.
3. The proposed per-step lifecycle rewrite would duplicate semantics that are already expressed by viability-policy-driven emission and would add new mutable batch state across authorization, apply-time consumption, discovery, and validation.
4. Existing tests explicitly codify the current behavior that later sequence steps are suppressed when earlier `requireUsableAtIssue` steps are currently unusable.

## Architecture Verdict

The original rewrite is not more beneficial than the current architecture.

Why:

1. The current model is cleaner. It keeps authored intent in the grant contract and keeps runtime state to emitted grants plus consumed sequence context.
2. An explicit skipped/terminal batch-step lifecycle would make the runtime more stateful without solving a general problem that the current contract cannot already represent for most cases.
3. It would also invert already-tested semantics across event-issued and effect-issued grants, forcing a broad, architecture-level behavior change rather than fixing a localized defect.

If a future rules case truly needs "ordered text, but skip unusable earlier steps and continue with later steps", the cleaner long-term direction is not an implicit runtime skip table. The cleaner direction would be a new explicit authoring-level contract that declares that progression policy directly in `GameSpecDoc`, so the compiler/runtime can remain generic and deterministic without hidden lifecycle inference.

## Updated Scope

This ticket is closed as a reassessment outcome, not an engine implementation ticket.

In scope:

1. Verify the current kernel and tests against the ticket's claims.
2. Record the corrected architectural understanding.
3. Archive the ticket because the proposed rewrite is not justified by the current codebase state.

Out of scope:

1. Rewriting free-operation runtime state around explicit batch-step lifecycle records.
2. Changing existing `requireUsableAtIssue` semantics.
3. Introducing MACV-specific exceptions.

## Validation Performed

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js packages/engine/dist/test/integration/fitl-events-macv.test.js packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test:integration`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

Notes:

1. The targeted test files passed.
2. The full engine integration lane passed.
3. `pnpm turbo lint` completed without errors but the repository still has pre-existing lint warnings in both `packages/engine` and `packages/runner`.

## Tests

### New/Modified Tests

None.

### Rationale

No production code change was justified after reassessment, and the current behavior is already covered by existing integration and validation tests.

## Outcome

Originally planned:

1. Rework the runtime around explicit batch progression state.
2. Update multiple kernel modules and validators to support batch-step skip states.
3. Add broad new regression coverage for that new lifecycle model.

Actually changed:

1. Reassessed the ticket against the current code and tests.
2. Determined that the ticket's core assumptions were stale.
3. Closed and archived the ticket without engine changes because the proposed rewrite is not a net architectural improvement over the current generic viability-policy model.
