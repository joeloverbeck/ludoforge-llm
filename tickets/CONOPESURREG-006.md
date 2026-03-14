# CONOPESURREG-006: Type condition-operator metadata field access

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel metadata and consumer typing
**Deps**: specs/62-condition-operator-surface-registry.md, archive/tickets/CONOPESURREG-004.md

## Problem

Condition structural metadata is already centralized in `packages/engine/src/kernel/condition-operator-meta.ts`, and both `zone-selector-aliases.ts` and `validate-conditions.ts` consume it successfully. The remaining architectural weakness is type precision: metadata field names are still plain strings, and consumers access operator-specific fields through `Record<string, unknown>` casts.

That weakens compile-time guarantees in the exact area Spec 62 was meant to make safer. If an operator field name drifts or metadata is declared incorrectly, tests may catch it, but TypeScript cannot. The recommended follow-up is to make metadata field access typed per operator so consumers can traverse condition structures without opaque record casting.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/condition-operator-meta.ts` currently exposes `valueFields`, `numericValueFields`, `zoneSelectorFields`, and `nestedConditionFields` as `readonly string[]`.
2. `packages/engine/src/kernel/zone-selector-aliases.ts` and `packages/engine/src/kernel/validate-conditions.ts` currently cast condition nodes through `Record<string, unknown>` to index into those field lists.
3. The duplicate traversal problem from Spec 62 is already solved, so this is not another traversal-refactor ticket.
4. Strengthening type contracts here is architecture-positive because it improves correctness without changing runtime semantics or introducing game-specific logic.
5. This work should remain narrowly scoped to condition metadata and its direct consumers; it should not expand into a general descriptor framework.

## Architecture Check

1. Typed metadata is cleaner than stringly-typed metadata because it makes invalid field declarations and invalid consumer access fail at compile time rather than only in tests.
2. The right design is still metadata-only. The improvement is stronger typing around the metadata, not a new runtime registry or semantic dispatch system.
3. This preserves the engine-agnostic boundary: it strengthens generic AST contracts and does not encode any game-specific identifiers or rules.

## What to Change

### 1. Strengthen `condition-operator-meta.ts` typing

Refine `ConditionOperatorMeta` so each operator's field lists are typed against the actual shape of that operator's `ConditionAST` node rather than generic `string[]`.

Possible acceptable approaches include:
- a generic `ConditionOperatorMeta<TCondition>` helper keyed by operator shape
- a typed metadata-builder function that infers valid field names from a sample operator-specific type
- an equivalent design that gives consumers strongly typed field access without broad record casting

### 2. Update direct consumers to use typed access

Refactor:
- `packages/engine/src/kernel/zone-selector-aliases.ts`
- `packages/engine/src/kernel/validate-conditions.ts`

so they can traverse metadata-declared fields without `Record<string, unknown>` indexing for condition nodes.

Small, localized casting at a well-typed helper boundary is acceptable if it materially improves the overall contract, but broad per-consumer record casting should be removed.

### 3. Strengthen metadata contract tests

Extend the existing condition metadata tests so they prove the new typing contract is actually enforced and that all condition operators remain covered.

## Files to Touch

- `packages/engine/src/kernel/condition-operator-meta.ts` (modify)
- `packages/engine/src/kernel/zone-selector-aliases.ts` (modify)
- `packages/engine/src/kernel/validate-conditions.ts` (modify)
- `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` (modify)
- `packages/engine/test/unit/kernel/zone-selector-aliases.test.ts` (modify only if behavior/invariants need stronger coverage)
- `packages/engine/test/unit/validate-gamedef-input.test.ts` or the relevant condition-validation test file (modify only if needed)

## Out of Scope

- Changing condition runtime semantics
- Refactoring evaluation, display, or lowering switches into metadata-driven dispatch
- Changing `ConditionAST` runtime shape for compatibility reasons
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
3. Relevant condition-validation test file — add or adjust targeted regression tests only if the refactor exposes an edge case around validation traversal.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
