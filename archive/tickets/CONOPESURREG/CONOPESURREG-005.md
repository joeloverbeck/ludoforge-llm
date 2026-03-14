# CONOPESURREG-005: Reassess condition validation metadata refactor scope

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — verification/doc-only
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

This ticket originally assumed `packages/engine/src/kernel/validate-conditions.ts` still duplicated condition structural field walking in a per-operator switch. That assumption is now stale. The file already uses metadata-driven traversal via `getConditionOperatorMeta(condition.op)` and `validateConditionStructure(...)`.

The remaining need is to keep the ticket set accurate: this ticket no longer owns a missing traversal refactor, and it should not be mistaken for ownership of work that has already landed elsewhere in the series.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/validate-conditions.ts` already performs metadata-driven structural traversal for condition validation.
2. The remaining explicit branches in that file are already the intended operator-specific checks: boolean arity, marker lattice validation, map-space property validation, and comparison-operator marker-state literal handling.
3. There is no remaining duplicate structural traversal refactor to land here unless a defect is discovered.
4. The earlier typing-precision weakness has already been resolved by the archived `CONOPESURREG-006` work: `condition-operator-meta.ts` now exposes typed field descriptors and typed traversal helpers instead of plain string lists.
5. This means there is no remaining architecture-positive implementation work owned by this ticket. The correct action is to close and archive it accurately.

## Architecture Check

1. Correcting stale ticket ownership is cleaner than leaving misleading refactor instructions in the active queue.
2. The current production architecture already goes slightly beyond the original Spec 62 direction in a good way: metadata owns structural shape through typed descriptors, while consumer files keep their semantic checks local.
3. No additional registry or abstraction layer would improve this area today. The current split is already the cleaner, more extensible design.

## What to Change

### 1. Close this ticket as documentation-state cleanup

Do not re-refactor `validate-conditions.ts` just to satisfy the original wording. No kernel changes are warranted from this ticket because the intended architecture already exists and the typed follow-up has already landed.

### 2. Align ticket/spec ownership with the implemented architecture

Record that:
- Spec 62 has been implemented and can be archived.
- `CONOPESURREG-006` already completed the typed-metadata refinement.
- This ticket is purely a stale-scope correction and archival step.

## Files to Touch

- `tickets/CONOPESURREG-005.md` (modify, then archive)
- `specs/62-condition-operator-surface-registry.md` (modify, then archive)

## Out of Scope

- Re-implementing metadata-driven validation traversal that already exists
- Re-opening typed metadata work that already shipped under archived `CONOPESURREG-006`
- Modifying `types-ast.ts`
- Refactoring unrelated condition evaluation, display, or lowering logic

## Acceptance Criteria

### Tests That Must Pass

1. No code changes are required unless a real defect is found.
2. The condition metadata and validation test surface must still pass unchanged.
3. `pnpm -F @ludoforge/engine test` passes.
4. `pnpm turbo typecheck` passes.
5. `pnpm turbo lint` passes.

### Invariants

1. Active tickets must match the current codebase rather than stale pre-refactor assumptions.
2. Condition structural metadata remains centralized in `condition-operator-meta.ts`.
3. Condition semantic checks remain local to consumers rather than being folded into a broader registry abstraction.

## Test Plan

### New/Modified Tests

1. No new or modified tests are required for this ticket; the reassessment confirmed the existing condition metadata, alias traversal, and validation tests already cover the implemented architecture.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Reassessed the ticket against the live code, tests, archived follow-up tickets, and Spec 62.
  - Corrected the ticket scope to reflect that `validate-conditions.ts` already uses metadata-driven traversal and that the typed-metadata refinement already landed under archived `CONOPESURREG-006`.
  - Determined that no engine-code change was justified because the current architecture is already the cleaner long-term design for this surface.
  - Marked the ticket complete for archival and paired it with archival of Spec 62.
- Deviations from original plan:
  - No kernel refactor or test changes were needed because both the original traversal refactor and the later typing hardening had already been implemented.
  - The ticket closed as documentation-state cleanup rather than implementation work.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/condition-operator-meta.test.js packages/engine/dist/test/unit/kernel/zone-selector-aliases.test.js packages/engine/dist/test/unit/compile-conditions.test.js packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm run check:ticket-deps` passed.
