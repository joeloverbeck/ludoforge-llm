# CONOPESURREG-006: Type condition-operator metadata field access

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel metadata and consumer typing
**Deps**: specs/62-condition-operator-surface-registry.md, archive/tickets/CONOPESURREG-004.md

## Problem

Condition structural metadata is already centralized in `packages/engine/src/kernel/condition-operator-meta.ts`, and both `zone-selector-aliases.ts` and `validate-conditions.ts` already consume it successfully. The remaining architectural weakness is type precision: metadata field names are still plain strings, and direct consumers access operator-specific fields through `Record<string, unknown>` casts.

That weakens compile-time guarantees in the exact area Spec 62 was meant to make safer. If an operator field name drifts or metadata is declared incorrectly, tests may catch it, but TypeScript cannot. The recommended follow-up is to make metadata field access typed per operator so consumers can traverse condition structures without opaque record casting.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/condition-operator-meta.ts` currently exposes `valueFields`, `numericValueFields`, `zoneSelectorFields`, and `nestedConditionFields` as `readonly string[]`, even though those lists are conceptually tied to specific `ConditionAST` operator shapes.
2. `packages/engine/src/kernel/zone-selector-aliases.ts` and `packages/engine/src/kernel/validate-conditions.ts` currently cast condition nodes through `Record<string, unknown>` to index into those metadata-declared field lists.
3. The duplicate traversal problem from Spec 62 is already solved. This ticket is not about introducing metadata-driven traversal; it is about typing the existing metadata-driven traversal more precisely.
4. Strengthening the metadata contract is architecture-positive if it remains narrow: compile-time field validity plus typed helper boundaries is better than keeping broad string indexing in each consumer.
5. This work should remain scoped to condition metadata and the two direct condition consumers. It should not expand into a general descriptor framework or semantic dispatch registry.

## Architecture Check

1. The current architecture is already better than the original Spec 62 baseline because structural traversal knowledge is centralized and shared between consumers.
2. The proposed change is beneficial only if it stays metadata-only. A typed metadata builder and typed traversal helpers improve correctness without creating a heavier abstraction layer.
3. A broader registry or handler-dispatch system would be worse than the current architecture here because conditions still have distinct semantic switches elsewhere, and centralizing those would add indirection without reducing real duplication.
4. This preserves the engine-agnostic boundary: it strengthens generic AST contracts and does not encode any game-specific identifiers or rules.

## What to Change

### 1. Strengthen `condition-operator-meta.ts` typing

Refine `ConditionOperatorMeta` so each operator's field lists are typed against the actual shape of that operator's `ConditionAST` node rather than generic `string[]`.

Possible acceptable approaches include:
- a generic `ConditionOperatorMeta<TCondition>` helper keyed by operator shape
- a typed metadata-builder function that infers valid field names from a sample operator-specific type
- an equivalent design that gives consumers strongly typed field access without broad record casting

### 2. Update direct consumers to use typed helper access

Refactor:
- `packages/engine/src/kernel/zone-selector-aliases.ts`
- `packages/engine/src/kernel/validate-conditions.ts`

so they can traverse metadata-declared fields without broad `Record<string, unknown>` indexing for condition nodes.

Small, localized typing machinery inside `condition-operator-meta.ts` is acceptable if it materially improves the overall contract, but broad per-consumer record casting should be removed.

### 3. Strengthen metadata contract tests

Extend the existing condition metadata tests so they prove the new typing contract is enforced and that all condition operators remain covered. If the refactor exposes a traversal edge case, add or strengthen the narrowest runtime regression test that protects it.

## Files to Touch

- `packages/engine/src/kernel/condition-operator-meta.ts` (modify)
- `packages/engine/src/kernel/zone-selector-aliases.ts` (modify)
- `packages/engine/src/kernel/validate-conditions.ts` (modify)
- `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` (modify)
- `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` (modify only if behavior/invariants need stronger coverage)
- `packages/engine/test/unit/validate-gamedef.test.ts` or the relevant condition-validation test file (modify only if needed)

## Out of Scope

- Changing condition runtime semantics
- Refactoring evaluation, display, or lowering switches into metadata-driven dispatch
- Changing `ConditionAST` runtime shape
- Introducing aliases, shims, or game-specific branches

## Acceptance Criteria

### Tests That Must Pass

1. Condition metadata field declarations are constrained by TypeScript to valid fields of the corresponding operator node shape.
2. `zone-selector-aliases.ts` and `validate-conditions.ts` no longer rely on broad `Record<string, unknown>` casts for condition-node metadata traversal.
3. Existing metadata, alias-traversal, and condition-validation behavior remains unchanged.
4. Existing suite: `pnpm -F @ludoforge/engine test` passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. Structural knowledge about condition operators remains centralized in `condition-operator-meta.ts`.
2. Consumer code stays generic and engine-agnostic.
3. No backwards-compatibility aliasing or duplicate operator registries are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` — strengthen metadata contract coverage so typed field declarations and operator coverage are guarded together.
2. `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` — keep alias traversal protected if consumer refactoring changes how metadata is iterated.
3. `packages/engine/test/unit/validate-gamedef.test.ts` or the relevant condition-validation test file — add or adjust targeted regression tests only if the refactor exposes an edge case around validation traversal.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Corrected the ticket assumptions and scope before implementation so it reflected the live metadata-driven architecture and the real remaining problem: typing precision, not traversal consolidation.
  - Reworked `packages/engine/src/kernel/condition-operator-meta.ts` from plain string field lists to typed field descriptors plus typed traversal helpers.
  - Removed the broad `Record<string, unknown>` condition-node casts from `zone-selector-aliases.ts` and `validate-conditions.ts` by routing traversal through the new helper boundary.
  - Strengthened metadata tests to verify helper-exposed field names and values across the full condition operator surface.
  - Added a validation regression test that proves zone-selector, value, numeric-value, and nested-condition traversal still reaches the correct diagnostics.
- Deviations from original plan:
  - `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` did not need further changes because the existing coverage there was already strong enough once the metadata contract test and validation regression test were added.
  - The implementation used typed field descriptors and helper iteration rather than raw typed field-name arrays because that produced a cleaner compile-time contract for this codebase's grouped `ConditionAST` union.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/condition-operator-meta.test.js packages/engine/dist/test/unit/kernel/zone-selector-aliases.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
