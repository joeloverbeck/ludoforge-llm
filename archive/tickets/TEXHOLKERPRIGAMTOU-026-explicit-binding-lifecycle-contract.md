# TEXHOLKERPRIGAMTOU-026: Explicit Binding Lifecycle Contract (No Name-Based Scope Semantics)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-025
**Blocks**: TEXHOLKERPRIGAMTOU-027

## 0) Assumption Reassessment (2026-02-16)

Current code and tests differ from this ticket's original assumptions:

1. Explicit lifecycle metadata is already centralized for effect binders in `src/cnl/binder-surface-registry.ts` via `declaredBinderPaths` and `sequentiallyVisibleBinderPaths`.
2. Broad binding lifecycle coverage already exists in tests, especially:
- `test/unit/binder-surface-registry.test.ts`
- `test/unit/compile-bindings.test.ts`
3. Non-aliasing exact-name behavior is already enforced in compiler tests (for example `test/unit/compile-actions.test.ts`).
4. The key remaining discrepancy is in `collectSequentialBindings`:
- `let` and `reduce` nested exports are still filtered with `name.startsWith('$')`
- this leaves `$` prefix as a semantic export gate for those paths, violating the explicit-metadata contract goal.
5. AST/schema-wide rewrites are not currently justified by code reality; the unresolved work is targeted, not wholesale.

## 0.1) Updated Scope (Corrected)

1. Remove `$`-prefix semantic gating from `let`/`reduce` sequential export collection.
2. Keep lifecycle behavior driven by explicit binder-surface metadata and lexical frame rules, not naming pattern checks.
3. Preserve strict no-aliasing behavior: binding identity remains exact string match (`amount` is not `$amount`).
4. Add regression tests proving non-prefixed nested bindings export correctly when lifecycle metadata marks them sequentially visible.
5. Keep the solution compiler/kernel generic and game-agnostic.

## 1) What needs to change / be added

1. Update `collectSequentialBindings` to eliminate `$`-prefix filtering from `let`/`reduce` nested-export behavior.
2. Strengthen unit coverage for non-prefixed nested sequential exports across `let` and `reduce`.
3. Ensure local lexical binders (`let.bind`, `reduce.resultBind`) remain scoped and do not leak.
4. Keep strict migration stance: no backward-compat aliasing; mismatched binding names continue to fail diagnostics.

## 2) Invariants that should pass

1. Binding visibility/export behavior is determined only by explicit contract fields, never by string naming patterns.
2. Binding scope behavior is deterministic and identical across discovery and execution surfaces.
3. Binding collisions/shadowing rules are explicit and deterministic.
4. Game specs can express complex chained bindings without hidden scope leaks.
5. Kernel remains game-agnostic with no per-game binding logic.

## 3) Tests that should pass

1. Unit: binder surface registry tests remain green and continue to assert declared/sequential binder contracts.
2. Unit: compile binding tests prove non-prefixed nested exports for `let` and `reduce` are visible sequentially.
3. Unit: lexical-scope tests still prove local binders do not leak outside their scope.
4. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Architecture Rationale

The updated implementation scope is more beneficial than retaining current behavior because:

1. It removes the last name-based lifecycle semantic (`$`-prefix export gating) in this flow.
2. It makes behavior consistent with the explicit binder-surface metadata architecture already adopted.
3. It keeps strict, explicit contracts without introducing aliasing or game-specific branches.

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Corrected ticket assumptions/scope to match current codebase reality.
  - Removed `$`-prefix export gating from `collectSequentialBindings` for `let`/`reduce`.
  - Strengthened unit coverage to verify non-prefixed nested sequential exports in both binder-surface and compile-binding flows.
- Deviations from original plan:
  - No AST/schema rewrite was performed because explicit lifecycle metadata was already in place; the remaining gap was localized export filtering logic.
- Verification:
  - `npm run build` passed.
  - `npm run test:unit` passed.
  - `npm test` passed.
  - `npm run lint` passed.
