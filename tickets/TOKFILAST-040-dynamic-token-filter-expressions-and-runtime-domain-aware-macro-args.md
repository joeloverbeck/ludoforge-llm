# TOKFILAST-040: Dynamic Token-Filter Expressions and Runtime-Domain Macro Args

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — CNL AST/contracts, macro expansion validation, token-filter lowering, runtime query/effect filter evaluation, compiler tests
**Deps**: `tickets/README.md`, `packages/engine/src/cnl/expand-effect-macros.ts`, `packages/engine/src/cnl/compile-conditions.ts`, `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/token-filter.ts`, `packages/engine/test/unit/expand-effect-macros.test.ts`, `packages/engine/test/unit/compile-conditions.test.ts`, `packages/engine/test/unit/eval-query.test.ts`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`, `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md`

## Problem

Current `GameSpecDoc` authoring can branch in conditions and values, but not inside token-filter entries, and macro arg constraints reject runtime-bound expressions when the declared param uses a literal domain constraint.

That combination forces data authors to hoist branching above filter definitions and to duplicate macro bodies when the only real variation is a runtime-selected target set. The recent FITL Assault refactor could stay game-agnostic, but it still had to encode a branch-heavy workaround in data because the engine cannot yet express the cleaner generic shape.

## Assumption Reassessment (2026-03-09)

1. `packages/engine/src/cnl/compile-conditions.ts` still lowers token filters from canonical static entry shapes and rejects conditional objects embedded inside filter entries.
2. `packages/engine/src/cnl/expand-effect-macros.ts` still validates constrained macro params eagerly enough that a binding/value expression cannot satisfy an enum-constrained arg, even when the expression would resolve to an allowed runtime value.
3. `packages/engine/src/kernel/types-ast.ts` / `packages/engine/src/kernel/schemas-ast.ts` currently model token-filter entries as static predicate data, not as a first-class composable expression surface.
4. `archive/tickets/FREEOP-001-grant-scoped-action-context.md` already delivered a generic `grantContext` surface; the remaining limitation is not grant transport but authored filter/arg expressiveness.
5. `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md` was completed without engine hacks, but only by branching outside token filters and threading an explicit selector through duplicated filter structures.
6. Mismatch: the codebase does not need an Assault-specific engine field. It needs a generic way for authored data to express runtime-selected filter criteria and to pass runtime-selected values through constrained macro contracts.

## Architecture Check

1. First-class dynamic filter/value support is cleaner than proliferating one-off macro variants or pushing more branching into game data.
2. This keeps `GameDef` and runtime agnostic: the engine only evaluates generic filter/value expressions, while each game decides what target sets or selectors mean in its own `GameSpecDoc`.
3. No backwards-compatibility aliasing or dual contracts should remain. Introduce one canonical dynamic filter surface and one canonical macro-arg validation rule for runtime-bound constrained values.
4. This is more extensible than adding narrow helpers such as `targetFactionMode`, `assaultTargetFaction`, or per-operation filter knobs, because the same capability would benefit events, operations, targeting, and future games.

## What to Change

### 1. Introduce a first-class token-filter expression surface

Extend the authored/kernel AST so token filters can be composed from canonical filter-expression nodes rather than only static entry arrays. At minimum, the surface must support:

- canonical `and` / `or` / `not` composition,
- canonical comparison entries,
- conditional selection between filter subtrees, and
- binding/ref/value-driven comparison operands where the runtime already supports those value kinds.

The surface must stay canonical and fail closed; do not add alias shapes or legacy shims.

### 2. Distinguish literal-domain vs runtime-domain macro arg constraints

Refactor effect-macro arg validation so a constrained param can accept either:

- a literal authored value that is validated at expansion time, or
- an allowed runtime value expression/binding whose domain can be validated against the same canonical contract.

Do not silently downgrade validation. The macro contract should still reject shapes that cannot possibly resolve into the allowed runtime domain.

### 3. Keep lowering/runtime evaluation generic

Update lowering and runtime query/effect evaluation to consume the new canonical filter-expression surface without adding FITL- or operation-specific handling. The runtime should evaluate the final generic filter tree the same way regardless of whether the selected value came from a literal, binding, or `grantContext`.

### 4. Add contract/regression coverage around the new authoring capability

Cover AST/schema acceptance, compiler lowering, macro validation, and runtime filter evaluation so the feature is useful beyond the motivating FITL Assault case.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify if needed for filter operands)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify if schema surface changes)

## Out of Scope

- Reworking Fire in the Lake Assault data itself.
- Adding operation-specific engine fields or helper branches.
- Changing visual presentation contracts or `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Authored token filters can express runtime-selected criteria without duplicating surrounding macro structure.
2. Constrained effect-macro params can accept runtime-bound expressions when those expressions are valid for the declared canonical domain.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Token-filter and macro-arg contracts remain canonical and fail closed.
2. `GameSpecDoc` remains the only home for game-specific behavior; `GameDef`, compiler, kernel, and simulator remain game-agnostic.

## Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add authored dynamic token-filter lowering cases and rejection cases for invalid mixed/runtime shapes.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — add constrained macro-param coverage for valid runtime-bound expressions and invalid non-domain expressions.
3. `packages/engine/test/unit/eval-query.test.ts` — add runtime evaluation coverage proving the new canonical filter-expression surface works with bindings and generic context values.
4. `packages/engine/test/unit/schemas-ast.test.ts` / `packages/engine/test/unit/json-schema.test.ts` — keep AST/schema contracts aligned and fail closed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — verifies canonical dynamic token-filter lowering and rejection behavior.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — verifies runtime-domain-aware macro arg validation without relaxing literal-contract checks.
3. `packages/engine/test/unit/eval-query.test.ts` — verifies runtime evaluation of the new filter-expression surface.
4. `packages/engine/test/unit/schemas-ast.test.ts` — verifies the AST accepts only the new canonical contract.
5. `packages/engine/test/unit/json-schema.test.ts` — verifies exported schema artifacts match the new authoring surface if schema changes are user-visible.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/compile-conditions.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/unit/expand-effect-macros.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/unit/eval-query.test.ts`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
