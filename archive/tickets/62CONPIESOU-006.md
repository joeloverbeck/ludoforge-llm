# 62CONPIESOU-006: Unit tests for `evalQuery` prioritized variant

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — ticket correction and archival only
**Deps**: archive/tickets/62CONPIESOU-004.md, specs/62-conditional-piece-sourcing.md

## Problem

This ticket assumed the spec-required `evalQuery` coverage for `prioritized` was still missing. That assumption is stale. The requested coverage was already delivered in the current unit suite, so the real work here is to correct the ticket and verify that the existing architecture and tests already satisfy the spec.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/test/unit/eval-query.test.ts` already contains the spec-aligned `prioritized` query-evaluation coverage. Confirmed.
2. The current suite already covers:
   - 3-tier left-to-right concatenation
   - empty-tier passthrough behavior
   - single-tier passthrough behavior
   - `qualifierKey` being ignored by `evalQuery`
   - mixed runtime-shape rejection
   - combined `maxQueryResults` enforcement on flattened results
3. Archived ticket [`archive/tickets/62CONPIESOU-004.md`](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/62CONPIESOU-004.md) already recorded the delivery of those tests. Confirmed.
4. The engine test runner remains `node --test` via the package test scripts. Confirmed.

## Architecture Check

1. The current architecture is the correct long-term shape. `evalQuery` handles `prioritized` via the shared `evalHomogeneousRecursiveQuery(...)` helper in [`packages/engine/src/kernel/eval-query.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/eval-query.ts), which keeps query evaluation deterministic and generic.
2. Moving tier semantics into `evalQuery` metadata or alias helpers would be worse than the current design. Tier legality belongs downstream in `chooseN`/prioritized-legality logic, not in query-result payloads.
3. Creating another dedicated test file now would add duplication rather than architectural value. The existing `eval-query` suite already owns this contract.

## Corrected Scope

### 1. Verify that the current suite already satisfies Spec 62

Verification target:
- `prioritized` with 2 or more tiers concatenates left-to-right
- empty tiers are skipped without changing overall order
- single-tier `prioritized` behaves like a passthrough
- `qualifierKey` does not affect `evalQuery` output
- mixed runtime shapes still throw
- combined `maxQueryResults` enforcement applies to the flattened result

### 2. Do not add duplicate implementation

No code or test changes are needed unless verification finds a real gap. In the current codebase, it did not.

## Files Touched

- `tickets/62CONPIESOU-006.md`
- `tickets/62CONPIESOU-007.md`
- `tickets/62CONPIESOU-008.md`
- `tickets/62CONPIESOU-009.md`

## Out of Scope

- Any kernel source changes
- Any new unit tests for `evalQuery`
- Card 87 authored-data changes
- Additional legality or integration coverage beyond the already-active tickets

## Acceptance Criteria

1. Existing `prioritized` `evalQuery` tests are present and still pass.
2. Full engine lint and test suites pass without requiring new runtime changes.
3. Ticket dependency integrity is restored for the remaining active 62CONPIESOU tickets.

## Test Plan

### New/Modified Tests

None. Existing coverage in [`packages/engine/test/unit/eval-query.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/eval-query.test.ts) already satisfies this ticket's intended scope.

### Commands

1. `pnpm -F @ludoforge/engine test -- eval-query.test.ts`
2. `pnpm turbo lint --filter=@ludoforge/engine`
3. `pnpm turbo test --filter=@ludoforge/engine`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Rewrote the ticket to match the current codebase instead of its stale assumptions.
  - Verified that the required `prioritized` `evalQuery` coverage already exists in the unit suite.
  - Repaired stale dependency references in active follow-up tickets so archival integrity checks pass.
- Deviations from original plan:
  - Did not add or modify engine tests, because the requested cases were already present.
  - Did not change production code, because the current architecture is already the cleaner design for this layer.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- eval-query.test.ts`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `pnpm turbo test --filter=@ludoforge/engine`
  - `pnpm run check:ticket-deps`
