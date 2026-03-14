# CONOPESURREG-004: Verify metadata-driven zone-selector alias traversal and close remaining coverage gaps

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Maybe — tests/verification first, kernel changes only if a real gap is found
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

This ticket originally assumed `packages/engine/src/kernel/zone-selector-aliases.ts` still contained a per-operator condition switch duplicating structural field-path knowledge. That assumption is now stale. The source already uses `getConditionOperatorMeta(condition.op)` to walk `zoneSelectorFields`, `valueFields`, `numericValueFields`, and `nestedConditionFields`.

The remaining work is to verify that the shipped implementation is architecturally sound, aligned with `specs/62-condition-operator-surface-registry.md`, and covered by sufficiently strong tests so future operator changes cannot silently break alias collection.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/zone-selector-aliases.ts` already performs metadata-driven traversal for conditions. There is no remaining per-operator condition switch to replace in that file.
2. `packages/engine/src/kernel/condition-operator-meta.ts` already declares the canonical condition operator set and the structural traversal metadata required by Spec 62.
3. `packages/engine/src/kernel/validate-conditions.ts` also already consumes the same metadata for structural traversal, which confirms the intended architectural consolidation has already happened.
4. The current alias collector handles array-vs-scalar nested condition fields at runtime, which is acceptable here and keeps the metadata surface simple.
5. Existing tests cover representative recursion paths, but they do not explicitly guarantee that every condition operator's declared metadata shape is exercised by alias-collection behavior. That is the main likely gap.

## Architecture Check

1. The current architecture is better than the original ticket proposed because the duplication has already been removed in both alias collection and validation traversal, matching the narrow metadata-only direction in Spec 62.
2. Keeping traversal generic but local to the consumer files is the right tradeoff here. A broader registry or handler abstraction would add indirection without improving semantics.
3. The main architectural weakness still present is typing precision: metadata field names are plain strings and consumers cast through `Record<string, unknown>`. This is tolerable for now because tests enforce coverage, but if this area evolves further, a per-operator typed metadata helper would be a cleaner long-term refinement.

## What to Change

### 1. Reassess and verify the existing implementation

Confirm that `zone-selector-aliases.ts` and `validate-conditions.ts` are already aligned with `condition-operator-meta.ts` and with Spec 62's intended architecture. Do not rewrite the traversal unless verification exposes a real defect.

### 2. Strengthen tests where behavior invariants are under-specified

If current tests do not sufficiently protect the invariant that alias collection honors metadata-declared condition fields across the full operator surface, add targeted tests in the existing zone-selector alias test suite.

### 3. Only change kernel code if verification finds a defect

If tests or manual inspection reveal a missing metadata field, traversal bug, or mismatch between metadata and consumer behavior, fix the smallest correct piece of kernel code rather than expanding scope.

## Files to Touch

- `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` (likely modify)
- `packages/engine/src/kernel/zone-selector-aliases.ts` (only if a defect is found)
- `packages/engine/src/kernel/condition-operator-meta.ts` (only if a defect is found)

## Out of Scope

- Re-implementing the already-shipped metadata-driven traversal just to match the original ticket wording
- Expanding the metadata module into a semantic registry or handler-dispatch system
- Modifying `types-ast.ts`
- Refactoring unrelated condition evaluation, display, or lowering switches
- Broad cleanup outside the condition metadata / alias traversal surface

## Acceptance Criteria

### Tests That Must Pass

1. `zone-selector-aliases.ts` remains metadata-driven for condition traversal; no regression to duplicated per-operator field walking is introduced.
2. Tests explicitly protect the invariant that metadata-declared condition fields are traversed correctly for alias collection, including zone-selector, value, numeric-value, and nested-condition paths.
3. Existing suite: `pnpm -F @ludoforge/engine test` passes.
4. `pnpm turbo typecheck` passes.
5. `pnpm turbo lint` passes.

### Invariants

1. Zone-selector alias expansion behavior stays generic and metadata-driven.
2. `ConditionAST` union remains unchanged.
3. No game-specific logic is introduced.
4. The shared architecture remains aligned with `specs/62-condition-operator-surface-registry.md`.

## Test Plan

### New/Modified Tests

1. Strengthen `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` if needed so it proves alias collection follows metadata across the full condition-operator surface rather than only a few representative operators.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Reassessed the ticket against the live code and Spec 62.
  - Confirmed `zone-selector-aliases.ts` already uses metadata-driven condition traversal via `getConditionOperatorMeta(...)`.
  - Confirmed `validate-conditions.ts` already shares the same metadata-driven structural traversal pattern.
  - Strengthened `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` with an operator-surface regression test covering every condition operator's alias-bearing paths.
- Deviations from original plan:
  - No kernel refactor was needed because the refactor described by the original ticket had already landed.
  - The ticket scope was corrected from "implement metadata-driven traversal" to "verify the existing architecture, close test gaps, and archive accurately."
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/zone-selector-aliases.test.js packages/engine/dist/test/unit/kernel/condition-operator-meta.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
