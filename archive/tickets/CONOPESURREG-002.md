# CONOPESURREG-002: Reassess condition-operator metadata coverage and close any remaining test gaps

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test-only verification/hardening if any residual gap remains
**Deps**: CONOPESURREG-001

## Problem

`CONOPESURREG-001` already introduced the condition-operator metadata module, migrated the intended consumers, and added initial test coverage. This ticket was written as if those pieces were still pending. It must first be corrected to match the current codebase, then limited to any residual verification or test-hardening work that is still justified by the actual implementation and [Spec 62](../specs/62-condition-operator-surface-registry.md).

## Assumption Reassessment (2026-03-14)

1. [`packages/engine/src/kernel/condition-operator-meta.ts`](../packages/engine/src/kernel/condition-operator-meta.ts) already exists and exports `CONDITION_OPERATORS`, `ConditionOperator`, `ConditionOperatorMeta`, `CONDITION_OPERATOR_META`, `isConditionOperator`, and `getConditionOperatorMeta`.
2. [`packages/engine/src/cnl/compile-conditions.ts`](../packages/engine/src/cnl/compile-conditions.ts) already imports `CONDITION_OPERATORS`; there is no remaining local `SUPPORTED_CONDITION_OPS` list to replace.
3. [`packages/engine/src/kernel/zone-selector-aliases.ts`](../packages/engine/src/kernel/zone-selector-aliases.ts) and [`packages/engine/src/kernel/validate-conditions.ts`](../packages/engine/src/kernel/validate-conditions.ts) already use metadata-driven structural traversal.
4. [`packages/engine/test/unit/kernel/condition-operator-meta.test.ts`](../packages/engine/test/unit/kernel/condition-operator-meta.test.ts), [`packages/engine/test/unit/kernel/zone-selector-aliases.test.ts`](../packages/engine/test/unit/kernel/zone-selector-aliases.test.ts), [`packages/engine/test/unit/compile-conditions.test.ts`](../packages/engine/test/unit/compile-conditions.test.ts), and [`packages/engine/test/unit/validate-gamedef.test.ts`](../packages/engine/test/unit/validate-gamedef.test.ts) already cover most of the behavior this ticket originally proposed.
5. `ConditionAST` in [`packages/engine/src/kernel/types-ast.ts`](../packages/engine/src/kernel/types-ast.ts) remains a discriminated union over object members with `op`, plus bare `boolean` literals that are not operators and must remain excluded from metadata identity.

## Architecture Check

1. The current metadata-only architecture is more beneficial than the pre-registry architecture. It centralizes duplicated structural facts without collapsing semantically different condition behavior into registry-owned runtime handlers.
2. This remains the right long-term direction for this surface: metadata for shared structure, explicit local switches for lowering, evaluation, display, and tooltip semantics.
3. Reopening the production architecture here would be a regression unless verification exposes a concrete defect. Preferred outcome is either no code change or a very small test-only hardening diff.
4. No compatibility aliases, no shims, and no speculative abstraction beyond the current metadata boundary.

## What to Change

### 1. Reassess existing implementation and coverage first

Verify the current implementation against Spec 62 before changing code:
- operator identity is canonicalized in `condition-operator-meta.ts`
- CNL unsupported-operator diagnostics use `CONDITION_OPERATORS`
- alias extraction and validation still derive shared structural traversal from metadata
- current tests already cover the intended invariants

### 2. Only close real residual gaps

If reassessment finds a real missing invariant or edge case, add the smallest possible tests to close it. Prefer strengthening existing targeted test files over introducing new fixtures, new helpers, or any production refactor.

## Files to Touch

- `tickets/CONOPESURREG-002.md`
- `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` only if a real gap remains
- Possibly one or more existing targeted test files already covering this surface, if strengthening there is the cleaner fit

## Out of Scope

- Re-implementing work already completed by `CONOPESURREG-001`
- Reopening the metadata architecture without a concrete failing test or demonstrable defect
- Modifying `types-ast.ts`
- Adding compatibility aliases, shims, or speculative abstractions
- Broad refactors of unrelated tests or helpers

## Acceptance Criteria

### Tests That Must Pass

1. The ticket documents current code reality accurately before implementation proceeds.
2. Reassessment confirms whether any meaningful coverage gap remains after `CONOPESURREG-001`.
3. If a gap exists, it is closed with minimal targeted tests.
4. If no gap exists, no production refactor is performed just to satisfy the obsolete original wording.
5. Relevant targeted tests pass.
6. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
7. `pnpm turbo typecheck` passes.
8. `pnpm turbo lint` passes.

### Invariants

1. `ConditionAST` remains unchanged.
2. Metadata remains the single source of truth for duplicated structural condition knowledge.
3. Tests stay deterministic and local.
4. No production code changes unless verification proves they are necessary.

## Test Plan

### New/Modified Tests

1. Reassess and, only if warranted, strengthen `packages/engine/test/unit/kernel/condition-operator-meta.test.ts`.
2. Reuse existing coverage in `packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts`, and `packages/engine/test/unit/validate-gamedef.test.ts` rather than duplicating it.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-14
- What changed:
  - Corrected the ticket to match current code reality: `CONOPESURREG-001` had already delivered the metadata module, consumer refactors, and the core coverage this ticket originally described as pending.
  - Reassessed the architecture against Spec 62 and kept it unchanged because the current metadata-only registry cleanly centralizes shared structure without over-centralizing semantic behavior.
  - Strengthened the existing metadata test with one additional invalid-input assertion for `isConditionOperator('')`.
- Deviations from original plan:
  - No production code changes were made because the ticket’s original assumptions were obsolete and the current architecture was already the cleaner, more robust design.
  - No new test file was added; the only justified change was a small extension to existing coverage.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
