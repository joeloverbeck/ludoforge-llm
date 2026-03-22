# TESTCONANN-001: Reassess contract annotations on behavioral integration tests

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None
**Deps**: None

## Problem

This ticket was opened under the assumption that the outcome-policy behavioral contract for required free-operation grants was still under-documented and that the clean fix was to add ad hoc contract annotation comments to the integration tests in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`.

That assumption is no longer correct.

The current codebase already documents the contract at the actual enforcement sites:

1. [packages/engine/src/kernel/legal-moves.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts#L604) states that required grants must remain visible during enumeration.
2. [packages/engine/src/kernel/apply-move.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts#L123) and [packages/engine/src/kernel/apply-move.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts#L1263) document the apply-time enforcement half and cross-reference the enumeration half.
3. The relevant integration tests already have precise behavioral names:
   - [packages/engine/test/integration/fitl-event-free-operation-grants.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts#L2231)
   - [packages/engine/test/integration/fitl-event-free-operation-grants.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts#L3500)
   - [packages/engine/test/integration/fitl-event-free-operation-grants.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts#L3549)

The real work here is to correct the ticket so it matches the present architecture and does not request a redundant documentation layer.

## Assumption Reassessment (2026-03-22)

1. The three tests named in the original ticket still exist at lines 2231, 3500, and 3549 of `fitl-event-free-operation-grants.test.ts`.
2. The original ticket was wrong to frame the contract as undocumented in the codebase. `OUTPOLCON-001` already added bidirectional source-level documentation at the kernel enforcement sites.
3. The original ticket was also wrong to treat test comments as the best architectural home for this invariant. The stable contract belongs at the generic kernel enforcement points, not primarily in FITL-flavored integration-test prose.
4. There is still no general `@contract` annotation convention in the test suite. Creating one here would establish a new pattern without a broader need or extraction mechanism.
5. The existing test names already communicate the behavioral split adequately:
   - required grants surface at enumeration time
   - required grant windows suppress pass
   - apply-time enforcement rejects free operations that fail `mustChangeGameplayState`
   - overlap ordering does not bypass enforcement
6. Therefore the remaining gap is not code, tests, or test comments. The gap was the stale ticket itself.

## Architecture Check

1. The current architecture is better than the ticket's proposed change.
2. The free-operation outcome-policy contract is generic kernel behavior. Its authoritative documentation should live beside `isFreeOperationCandidateAdmitted` and `validateFreeOperationOutcomePolicy`, where future refactors must confront it directly.
3. Adding FITL integration-test annotation blocks would duplicate the same contract in a weaker location, add drift risk, and bias discoverability toward one scenario file instead of the generic enforcement path.
4. The existing integration tests should remain behavior-first. Their job is to prove observable semantics, not become the primary registry for engine contracts.
5. No backwards-compatibility or aliasing concerns apply. No code or test changes are warranted.

## What to Change

### 1. Correct this ticket

Update the ticket so it reflects current truth:

- the source-level contract documentation already exists
- the named tests already cover the behavior
- no new test-comment annotation pattern should be introduced here

### 2. Do not modify engine code or tests

No implementation change is justified. The proposed test-comment layer is less clean and less robust than the architecture already in place.

## Files to Touch

- `tickets/TESTCONANN-001-contract-annotations-behavioral-tests.md` (modify)

## Out of Scope

- Adding `@contract` comments to `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
- Creating a test annotation convention or contract registry
- Any kernel, compiler, agent, or runner code changes
- Any test changes

## Acceptance Criteria

### Tests That Must Pass

1. Relevant regression coverage for the outcome-policy contract still passes.
2. Existing suite: `pnpm turbo lint`
3. Existing suite: `pnpm turbo typecheck`
4. Existing suite: `pnpm turbo test`

### Invariants

1. No code or test files change.
2. The ticket must explicitly record that the proposed test-comment implementation is architecturally redundant and should not be pursued.

## Test Plan

### New/Modified Tests

1. None

### Commands

1. `pnpm turbo build`
2. `node --test --test-name-pattern "surfaces required non-executionContext grants immediately after event issuance" packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test --test-name-pattern "blocks pass during required grant windows and rejects free operations that fail outcome policy" packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node --test --test-name-pattern "rejects overlapping free operations that fail required outcome policy even when pending grants are reordered" packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
6. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`
9. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Reassessed the ticket against the current repository state and corrected its assumptions.
  - Confirmed that the relevant outcome-policy contract is already documented in the kernel source and already covered by existing unit and integration tests.
  - Re-scoped the ticket so no engine or test change is performed.
- Deviations from original plan:
  - The original ticket proposed adding test-level contract annotations. That implementation was intentionally rejected because it is less robust than the current architecture and would duplicate contract knowledge away from the generic enforcement points.
- Verification results:
  - `pnpm turbo build` ✅
  - `node --test --test-name-pattern "surfaces required non-executionContext grants immediately after event issuance" packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `node --test --test-name-pattern "blocks pass during required grant windows and rejects free operations that fail outcome policy" packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `node --test --test-name-pattern "rejects overlapping free operations that fail required outcome policy even when pending grants are reordered" packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test` ✅
