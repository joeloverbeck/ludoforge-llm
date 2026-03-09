# TOKFILAST-040: Dynamic Token-Filter Expressions and Runtime-Domain Macro Args

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — token-filter/row-predicate membership lowering, runtime predicate resolution, macro constraint validation, compiler tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/expand-effect-macros.ts`, `packages/engine/src/cnl/compile-conditions.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/token-filter.ts`, `packages/engine/test/unit/expand-effect-macros.test.ts`, `packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/eval-query.test.ts`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`, `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md`

## Problem

The codebase already has first-class canonical `TokenFilterExpr` support (`and` / `or` / `not` / predicate nodes), and `tokenTraitValue` macro params already accept runtime value expressions such as bindings.

The remaining limitation is narrower and more specific: token-filter and asset-row membership predicates (`op: in` / `op: notIn`) still lower only from literal string arrays or named sets, and runtime predicate evaluation still treats authored `ValueExpr` operands as scalar-only. That means authored data cannot pass a runtime-selected set through a generic membership filter, which still forces branch-heavy data workarounds in places like FITL Assault targeting.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/kernel/types-ast.ts` and `packages/engine/src/kernel/schemas-ast.ts` already model token filters as a first-class canonical expression tree. This ticket does not need new token-filter AST/schema shapes.
2. `packages/engine/src/cnl/compile-conditions.ts` already lowers canonical token-filter expression trees, including binding/ref-driven scalar predicate operands for `eq` / `neq`. The gap is narrower: `in` / `notIn` still reject runtime-bound set operands.
3. `packages/engine/src/kernel/token-filter.ts` and `packages/engine/src/kernel/eval-query.ts` already evaluate canonical token-filter trees generically, but predicate value resolution still only permits scalar `ValueExpr` results and literal array membership operands.
4. `packages/engine/src/cnl/expand-effect-macros.ts` already accepts runtime expressions for `tokenTraitValue` params. The relevant missing piece is `tokenTraitValues` and membership-oriented constrained args that should accept runtime-selected sets through the same canonical contract.
5. `archive/tickets/FREEOP-001-grant-scoped-action-context.md` already delivered a generic `grantContext` surface. The remaining limitation is not grant transport but the inability to consume runtime-selected scalar sets through generic predicate membership operators.
6. `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md` was completed without engine hacks, but the remaining branch-heavy data in FITL exists because membership filters cannot yet consume runtime-selected target sets directly.
7. Corrected scope: the codebase does not need a new token-filter expression language. It needs canonical runtime-set support for existing predicate membership operators plus matching macro-constraint handling.

## Architecture Check

1. Extending existing canonical predicate membership operators is cleaner than inventing a second dynamic-filter surface or preserving branch-heavy game-data workarounds.
2. This keeps `GameDef` and runtime agnostic: the engine only evaluates generic predicate values, while each game decides what runtime-selected set means in its own `GameSpecDoc`.
3. No aliasing or duplicate contracts should be introduced. The canonical `TokenFilterExpr` / predicate surface should stay intact; only the operand capabilities of existing canonical operators should expand.
4. The same capability should work for token filters, asset-row predicates, macro args, bindings, and `grantContext`, rather than solving only FITL Assault.

## What to Change

### 1. Extend canonical membership predicates to accept runtime-selected sets

Keep the existing canonical predicate surface, but allow `op: in` / `op: notIn` to lower from either:

- canonical literal string arrays / named sets, or
- canonical runtime-selected set references/expressions that are valid in the predicate domain.

Do not add alias keys or legacy shapes.

### 2. Align constrained macro args with runtime-selected membership sets

Refactor effect-macro arg validation so a constrained param can accept either:

- a literal authored value that is validated at expansion time, or
- an allowed runtime-selected value/set expression whose shape is compatible with the same canonical contract.

Do not silently downgrade validation. The macro contract should still reject shapes that cannot possibly resolve into the allowed runtime domain.

### 3. Keep lowering/runtime evaluation generic

Update lowering and runtime query/effect evaluation so canonical predicates work the same way regardless of whether their membership operand came from a literal array, binding, or `grantContext`. Do not add FITL- or operation-specific handling.

### 4. Add contract/regression coverage around the new authoring capability

Cover compiler lowering, macro validation, and runtime filter evaluation so the feature is useful beyond the motivating FITL Assault case.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify if needed for filter operands)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)

## Out of Scope

- Reworking Fire in the Lake Assault data itself.
- Adding operation-specific engine fields or helper branches.
- Changing visual presentation contracts or `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Authored token filters and row predicates can express runtime-selected membership criteria without duplicating surrounding macro structure.
2. Constrained effect-macro params can accept runtime-bound value/set expressions when those expressions are valid for the declared canonical domain.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Predicate and macro-arg contracts remain canonical and fail closed.
2. `GameSpecDoc` remains the only home for game-specific behavior; `GameDef`, compiler, kernel, and simulator remain game-agnostic.

## Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add runtime-set membership lowering cases and rejection cases for invalid canonical/runtime operand shapes.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — add constrained macro-param coverage for valid runtime-bound membership sets and invalid non-domain shapes.
3. `packages/engine/test/unit/eval-query.test.ts` — add runtime evaluation coverage proving canonical membership predicates work with bindings and generic context values.
4. `packages/engine/test/unit/token-filter.test.ts` — add predicate-level runtime membership resolution coverage and fail-closed behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — verifies canonical runtime-set membership lowering and rejection behavior.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — verifies runtime-domain-aware macro arg validation without relaxing literal-contract checks.
3. `packages/engine/test/unit/eval-query.test.ts` — verifies runtime evaluation of canonical membership predicates with bindings and `grantContext`.
4. `packages/engine/test/unit/token-filter.test.ts` — verifies predicate-level runtime membership resolution and fail-closed behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js`
4. `node --test packages/engine/dist/test/unit/eval-query.test.js`
5. `node --test packages/engine/dist/test/unit/token-filter.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed: 2026-03-09
- What changed:
  - Re-scoped the ticket to the actual engine gap in the current codebase: canonical token-filter expressions already existed, so the implementation focused on runtime-selected membership sets for canonical `in` / `notIn` predicates.
  - Extended predicate lowering so token filters and `assetRows` predicates can consume runtime-selected set refs from `binding` and `grantContext` in addition to literal arrays and named sets.
  - Extended runtime predicate resolution to accept scalar-array values from `binding` / `grantContext` in predicate position without changing general scalar `ValueExpr` evaluation semantics.
  - Extended constrained macro validation so `tokenTraitValues` params can accept runtime-selected set refs through the same canonical contract.
  - Added regression coverage for lowering, macro expansion, predicate evaluation, and runtime query evaluation.
- Deviations from original plan:
  - No AST/schema expansion was needed. The ticket originally assumed the token-filter expression surface did not exist, but the codebase already had that architecture.
  - No FITL data changes were made here; this ticket remained engine-only.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
  - `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js`
  - `node --test packages/engine/dist/test/unit/eval-query.test.js`
  - `node --test packages/engine/dist/test/unit/token-filter.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
