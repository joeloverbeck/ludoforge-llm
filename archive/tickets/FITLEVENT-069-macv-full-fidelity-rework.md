# FITLEVENT-069: Reassess MACV full-fidelity follow-up

**Status**: COMPLETED
**Completed**: 2026-03-12
**Priority**: HIGH
**Effort**: Reassessment only
**Engine Changes**: No
**Deps**: `tickets/README.md`, `archive/tickets/FREEOP/FREEOP-002-partially-implementable-sequence-batches.md`, `reports/fire-in-the-lake-rules-section-5.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-macv.test.ts`, `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`, `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts`

## Reassessment Summary

The original follow-up ticket assumed MACV should become fully rule-5.1.3-faithful immediately after a generic free-operation batch redesign landed.

That path is no longer valid.

`FREEOP-002` was archived after reassessment because the proposed kernel rewrite was not a net architectural improvement over the current generic viability-policy model. MACV therefore cannot be "finished" through the originally assumed dependency chain.

## Corrected Assumptions

1. Current MACV data already uses the cleanest authoring surface available in today's architecture: two explicit branches, ordered `specialActivity` grants, and an active-seat stay-eligible override. Confirmed in [`data/games/fire-in-the-lake/41-events/065-096.md`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-events/065-096.md).
2. Current regression coverage already proves:
   - compile shape for card 69
   - `US -> ARVN` normal path
   - `NVA -> VC` normal path
   Confirmed in [`packages/engine/test/integration/fitl-events-macv.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-macv.test.ts), [`packages/engine/test/integration/fitl-events-1965-arvn.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-1965-arvn.test.ts), and [`packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts).
3. The unresolved edge case is specific and real: rules section 5.1.3 says implemented event text that can be carried out must be carried out, but current `requireUsableAtIssue` ordered-grant semantics do not allow "first faction unusable, later faction still proceeds" within one ordered batch.
4. That gap cannot be solved cleanly inside MACV data alone under the current generic contract.

## Architecture Verdict

Implementing the originally proposed MACV follow-up is not more beneficial than the current architecture.

Why:

1. A MACV-only workaround would violate the agnostic-engine boundary.
2. Re-encoding MACV with branches or aliases that simulate "skip earlier unusable step" would make authoring less honest and less reusable.
3. The real missing capability, if we choose to support it, is a new explicit generic progression contract in `GameSpecDoc`, not a FITL event patch.

The ideal architecture is:

1. Keep MACV authored as plain game data.
2. If partial ordered progression is required, add a new explicit generic authoring contract for that progression policy.
3. Let compiler/runtime interpret that contract generically, with no MACV-specific branches in kernel code.

## Updated Scope

This ticket is closed as a reassessment, not an implementation ticket.

In scope:

1. Verify whether current MACV data or tests were stale.
2. Decide whether a clean implementation exists within the current architecture.
3. Archive the ticket if the only remaining path would require a new generic contract rather than a MACV change.

Out of scope:

1. Adding FITL-specific kernel behavior.
2. Distorting MACV authoring to simulate unsupported progression semantics.
3. Designing and implementing a new generic progression contract. That would require a separate ticket.

## Validation Performed

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-macv.test.js packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js packages/engine/dist/test/integration/fitl-events-text-only-behavior-backfill.test.js`
3. `pnpm -F @ludoforge/engine test:integration`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

Notes:

1. The targeted MACV-related integration tests passed.
2. The full engine integration lane passed.
3. `pnpm turbo lint` completed without errors but the repository still has pre-existing lint warnings in `packages/engine` and `packages/runner`.

## Tests

### New/Modified Tests

None.

### Rationale

No production change was justified. The reassessment concluded that the remaining rules gap cannot be solved cleanly from this ticket without introducing a new generic contract.

## Outcome

Originally planned:

1. Revisit MACV after a generic free-operation redesign.
2. Add full edge-case tests for partial ordered implementability.
3. Bring MACV to full rule-5.1.3 fidelity.

Actually changed:

1. Reassessed the ticket against the current kernel, authoring, tests, and archived `FREEOP-002` conclusion.
2. Determined that current MACV authoring is already the cleanest expression supported by the existing architecture.
3. Closed and archived the ticket because the remaining gap requires a new explicit generic progression contract, not a MACV-local implementation.
