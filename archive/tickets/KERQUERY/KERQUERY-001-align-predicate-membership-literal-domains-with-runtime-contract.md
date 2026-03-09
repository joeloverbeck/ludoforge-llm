# KERQUERY-001: Align Predicate Membership Literal Domains with Runtime Contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL predicate lowering, predicate-literal validation, unit tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/compile-conditions.ts`, `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/query-predicate.ts`, `packages/engine/src/kernel/value-membership.ts`, `packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/eval-query.test.ts`, `packages/engine/test/unit/value-membership.test.ts`

## Problem

The AST and runtime predicate contract already support scalar membership sets of `string | number | boolean`, but compiler lowering for authored `in` / `notIn` predicates still only accepts literal `string[]` values.

That mismatch leaves the canonical predicate surface only partially generic. Authored numeric/boolean membership predicates are blocked in `GameSpecDoc` even though the engine runtime can evaluate them safely and generically.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/types-ast.ts` and `packages/engine/src/kernel/query-predicate.ts` already define predicate set values generically as scalar arrays, not string-only arrays.
2. `packages/engine/src/kernel/value-membership.ts` already enforces fail-closed scalar membership semantics, including mixed-type and non-scalar rejection.
3. Existing runtime tests already cover much of that contract in `eval-query`, `query-predicate`, and `value-membership`; the primary gap is compiler-time acceptance/rejection for authored inline literal membership arrays.
4. Mismatch: `packages/engine/src/cnl/compile-conditions.ts` still narrows literal membership operands to `string[]` for both token filters and `assetRows` predicates. The corrected scope is to bring compiler lowering into parity with the existing AST/runtime contract rather than adding new runtime behavior.
5. `metadata.namedSets` remain `string[]`-only today. This ticket does not widen named-set schema or token trait vocabularies; it only fixes inline literal membership arrays.

## Architecture Check

1. Matching compiler lowering to the existing AST/runtime predicate contract is cleaner than preserving a narrower authoring surface with hidden runtime-only capability.
2. This keeps game-specific choices in `GameSpecDoc` while leaving `GameDef`, compiler internals, and runtime predicate evaluation fully game-agnostic.
3. No backwards-compatibility aliasing or alternate predicate shapes are needed. The canonical `in` / `notIn` surface remains unchanged; only the accepted inline literal scalar domain is corrected.
4. The clean implementation is a shared compiler helper for scalar membership literal validation reused by token-filter and `assetRows` lowering, instead of duplicating widening logic in both branches.

## What to Change

### 1. Broaden canonical literal membership lowering to the full scalar domain

Update predicate lowering so authored inline literal membership sets for token filters and `assetRows` accept canonical arrays of strings, numbers, or booleans, consistent with the existing AST/runtime predicate contract.

### 2. Preserve fail-closed validation for invalid literal sets

Keep rejecting nested arrays, objects, and mixed scalar-type sets during lowering so invalid authored membership values fail before runtime.

### 3. Add parity-focused coverage

Add tests that prove compiler lowering now accepts numeric/boolean inline literal sets and still rejects mixed-type or non-scalar arrays, while end-to-end evaluation already works for those widened literals.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/value-membership.test.ts` (verify unchanged runtime contract coverage remains sufficient; modify only if a gap is found)

## Out of Scope

- FITL macro/data rewrites already covered by `tickets/FITLASSAULT-002-rework-targeted-assault-on-dynamic-filter-engine-support.md`
- New predicate operators or alias shapes
- Widening `metadata.namedSets` beyond `string[]`
- Visual presentation changes in any `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Authored token-filter membership predicates accept numeric/boolean inline literal sets when the predicate field domain is scalar-compatible.
2. Authored `assetRows` membership predicates accept numeric/boolean inline literal sets and still fail closed for mixed/non-scalar arrays.
3. Existing runtime behavior for scalar membership evaluation is unchanged; this ticket widens compiler acceptance only.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical predicate authoring and AST/runtime contracts stay aligned across compiler and kernel layers.
2. `GameDef` and runtime remain game-agnostic; no game-specific predicate branching is introduced.
3. Named-set schema remains unchanged; only inline literal membership arrays are widened.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — verify lowering accepts numeric/boolean inline membership arrays and rejects invalid mixed/non-scalar arrays.
2. `packages/engine/test/unit/eval-query.test.ts` — verify end-to-end query evaluation remains correct for numeric/boolean inline membership sets.
3. `packages/engine/test/unit/value-membership.test.ts` — keep existing runtime contract coverage as the reference boundary; add coverage only if a genuine gap appears during implementation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `node --test packages/engine/dist/test/unit/eval-query.test.js`
4. `node --test packages/engine/dist/test/unit/value-membership.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Updated `compile-conditions.ts` to accept homogeneous inline scalar membership literals for token filters and `assetRows`, using one shared compiler helper instead of separate ad hoc checks.
- Added compiler coverage for numeric/boolean acceptance and mixed/non-scalar rejection.
- Added end-to-end query coverage for numeric `assetRows` membership and boolean token-filter membership.
- Left runtime predicate evaluation and `metadata.namedSets` unchanged because they were already correct and outside the true scope.
