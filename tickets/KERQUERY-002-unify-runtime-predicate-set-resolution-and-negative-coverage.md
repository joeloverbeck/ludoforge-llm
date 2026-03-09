# KERQUERY-002: Unify Runtime Predicate-Set Resolution and Negative Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared kernel predicate-set resolution, condition/query parity, unit tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/eval-condition.ts`, `packages/engine/src/kernel/query-predicate.ts`, `packages/engine/test/unit/eval-query.test.ts`, `packages/engine/test/unit/eval-condition.test.ts`, `packages/engine/test/unit/token-filter.test.ts`

## Problem

Runtime-selected predicate-set resolution now exists in multiple kernel paths. `evalQuery` resolves `binding` / `grantContext` membership operands in one implementation, while `evalCondition` retains a separate membership-set resolver.

That duplication increases drift risk in one of the engine’s core generic contracts. The current code also lacks direct negative regression coverage for several new runtime-set failure modes, which makes future divergence easier to miss.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/eval-query.ts` now contains dedicated runtime predicate-set resolution for `binding` and `grantContext` membership operands.
2. `packages/engine/src/kernel/eval-condition.ts` already had a separate `binding` / `grantContext` membership-set resolver for condition-level `in`.
3. Mismatch: there is no active ticket covering consolidation of these two runtime paths or the missing negative coverage around ref-backed membership failures. `tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md` is about FITL data cleanup, not this shared kernel boundary.

## Architecture Check

1. One shared runtime predicate-set resolver is cleaner and more robust than keeping parallel implementations in condition and query evaluation.
2. Consolidating this logic preserves the engine-agnostic boundary: the kernel evaluates generic predicate sets the same way regardless of whether the caller is a condition, token filter, or row predicate.
3. No backwards-compatibility layers are needed. The existing canonical predicate surface stays intact while the runtime implementation becomes more coherent.

## What to Change

### 1. Extract one shared runtime predicate-set resolver

Move runtime-selected set resolution for `binding` / `grantContext` membership operands into a single kernel helper consumed by both query predicate evaluation and condition membership evaluation.

### 2. Keep scalar vs scalar-array behavior fail-closed

Preserve strict runtime errors for missing refs, scalar values used where arrays are required, mixed scalar-type arrays, and non-scalar arrays.

### 3. Add explicit negative regression coverage

Cover missing bindings, missing `grantContext` keys, scalar `grantContext` values in membership position, and mixed-type runtime arrays so the shared helper’s failure modes are pinned.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/query-predicate.ts` (modify if helper ownership belongs there)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/eval-condition.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify if direct predicate-path coverage belongs there)

## Out of Scope

- FITL authored macro simplification already covered by `tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md`
- Compiler literal-domain parity work if handled separately
- Visual presentation changes in any `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Condition membership and query/token-filter membership resolve runtime-selected sets through one shared kernel rule.
2. Missing or malformed runtime-selected predicate sets fail with deterministic type/missing-reference errors in both condition and query paths.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Membership semantics remain centralized and game-agnostic across kernel evaluation surfaces.
2. Runtime predicate-set resolution stays fail-closed for invalid shapes; no silent coercion or compatibility shims are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — verify negative cases for ref-backed membership sets in query/token-filter and `assetRows` paths.
2. `packages/engine/test/unit/eval-condition.test.ts` — verify the same runtime-set resolution and failure behavior holds for condition-level `in`.
3. `packages/engine/test/unit/token-filter.test.ts` — verify direct predicate-level callers still fail closed when dynamic set resolution returns invalid shapes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-query.test.js`
3. `node --test packages/engine/dist/test/unit/eval-condition.test.js`
4. `node --test packages/engine/dist/test/unit/token-filter.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
