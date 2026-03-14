# CONOPESURREG-003: Verify compile-conditions uses canonical condition operator metadata

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No engine-source change expected unless verification exposes a regression
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

This ticket originally assumed `packages/engine/src/cnl/compile-conditions.ts` still owned a local `SUPPORTED_CONDITION_OPS` constant that needed to be replaced with an import from the condition-operator metadata module described by [specs/62-condition-operator-surface-registry.md](/home/joeloverbeck/projects/ludoforge-llm/specs/62-condition-operator-surface-registry.md).

That assumption is no longer true in the current tree. The code already uses the canonical registry, and the relevant tests already exist. The ticket must therefore be corrected before any implementation work proceeds.

## Assumption Reassessment (2026-03-14)

1. `compile-conditions.ts` already imports `CONDITION_OPERATORS` from `../kernel/condition-operator-meta.js` at [packages/engine/src/cnl/compile-conditions.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-conditions.ts#L29).
2. There is no local `SUPPORTED_CONDITION_OPS` constant in `compile-conditions.ts`. The constant at the old approximate location is now `SUPPORTED_QUERY_KINDS`, not a condition-operator list, at [packages/engine/src/cnl/compile-conditions.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-conditions.ts#L87).
3. The condition-lowering diagnostic paths already use `CONDITION_OPERATORS` for unsupported condition shapes and unsupported condition operators at [packages/engine/src/cnl/compile-conditions.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-conditions.ts#L141) and [packages/engine/src/cnl/compile-conditions.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-conditions.ts#L330).
4. The metadata module already exists and is broader than the original ticket assumed: it exposes `CONDITION_OPERATORS`, `CONDITION_OPERATOR_META`, `getConditionOperatorMeta()`, and `isConditionOperator()` in [packages/engine/src/kernel/condition-operator-meta.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/condition-operator-meta.ts).
5. The metadata module is already integrated beyond CNL. `validate-conditions.ts` and `zone-selector-aliases.ts` both consume it, matching the broader direction in Spec 62.
6. Targeted tests already cover both the registry itself and the CNL unsupported-operator diagnostic:
   - [packages/engine/test/unit/compile-conditions.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/compile-conditions.test.ts#L692)
   - [packages/engine/test/unit/kernel/condition-operator-meta.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/condition-operator-meta.test.ts#L50)

## Architecture Reassessment

1. The architectural direction from Spec 62 is sound, and the repository already reflects it: operator identity lives in a metadata module, while the semantic lowering switch stays in `compile-conditions.ts`.
2. This is better than the original duplicated-list architecture because it removes drift risk without collapsing unrelated concerns into a centralized mega-registry.
3. The current architecture is preferable to any backwards-compatible aliasing approach. A second operator list in CNL would be strictly worse because it reintroduces split ownership for operator identity.
4. The only notable architecture smell nearby is that [packages/engine/src/cnl/compile-conditions.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-conditions.ts) remains very large. That concern is already tracked separately by Spec 59 and is out of scope for this ticket.

## Corrected Scope

This ticket is now limited to:

1. Verifying that the current implementation fully satisfies the original intent of this ticket and remains aligned with [specs/62-condition-operator-surface-registry.md](/home/joeloverbeck/projects/ludoforge-llm/specs/62-condition-operator-surface-registry.md).
2. Running the relevant tests plus lint/typecheck coverage required for finalization.
3. Updating this ticket to reflect the actual implementation state, then marking it completed and archiving it if verification passes.

## What to Change

### 1. Do not re-implement the registry import swap

No engine-source change is required for the originally proposed import replacement unless verification finds a regression.

### 2. Verify test coverage and invariants

Confirm that:

1. No `SUPPORTED_CONDITION_OPS` condition-operator list exists in engine source.
2. Unsupported condition operators still surface canonical alternatives from `CONDITION_OPERATORS`.
3. Condition metadata remains aligned with `ConditionAST` discriminants.

### 3. Complete and archive the ticket

If verification passes, mark this ticket completed, add an `Outcome` section, and archive it under `archive/tickets/CONOPESURREG/`.

## Files to Touch

- `tickets/CONOPESURREG-003.md` (modify, then archive)
- `archive/tickets/CONOPESURREG/CONOPESURREG-003.md` (via archival move)

## Out of Scope

- Rewriting `compile-conditions.ts`
- Changing the condition-lowering switch semantics
- Altering `ConditionAST`
- Refactoring other condition-consumer switches into registry-owned handlers
- Any additional architecture work from Spec 59 beyond acknowledging the large-file concern

## Acceptance Criteria

### Tests That Must Pass

1. `rg "SUPPORTED_CONDITION_OPS" packages/engine/src` returns zero matches.
2. The unsupported operator diagnostic test in [packages/engine/test/unit/compile-conditions.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/compile-conditions.test.ts#L692) passes and still asserts canonical alternatives from `CONDITION_OPERATORS`.
3. The metadata coverage tests in [packages/engine/test/unit/kernel/condition-operator-meta.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/condition-operator-meta.test.ts#L50) pass.
4. `pnpm -F @ludoforge/engine test` passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. Condition operator identity remains owned by `condition-operator-meta.ts`.
2. `compile-conditions.ts` continues to use the canonical registry for diagnostics.
3. No backwards-compatibility aliases or duplicate operator identity lists are introduced.
4. The semantic lowering switch remains local to CNL rather than being folded into metadata.

## Test Plan

### New/Modified Tests

1. No new tests are planned up front because the relevant coverage already exists. Add or strengthen tests only if verification exposes a missing invariant.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Reassessed the ticket against the live codebase and corrected its assumptions and scope.
  - Confirmed the original implementation work was already present: `compile-conditions.ts` already consumes `CONDITION_OPERATORS`, and the metadata module plus its consumers and tests already exist.
  - Completed verification and archival work instead of making redundant engine-source edits.
- Deviations from original plan:
  - No engine code changes were required.
  - No new tests were added because the relevant invariant coverage was already in place.
  - The ticket was converted from an implementation task into a verification-and-archive task.
- Verification results:
  - `rg -n "SUPPORTED_CONDITION_OPS" packages/engine/src` returned no matches.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
