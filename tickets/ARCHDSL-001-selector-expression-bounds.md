# ARCHDSL-001 - Expression Bounds for Selectors (`chooseN.min/max`)

**Status**: Pending  
**Priority**: High  
**Depends on**: None

## 1) What needs to change / be added

Add first-class expression support for selector cardinality bounds so GameSpecDoc authors can set dynamic limits without branch duplication.

### Required implementation changes

- Extend AST/types so `chooseN.min` and `chooseN.max` accept `ValueExpr` (not only numeric literals).
- Update schema validators for AST + GameDef JSON schema to allow expression-valued selector bounds.
- Update compiler lowering to preserve/validate expression bounds.
- Update runtime selector resolution to evaluate bounds at decision time.
- Enforce runtime safety:
  - evaluated bounds must be finite integers
  - `min >= 0`
  - `max >= min`
  - fail with deterministic diagnostic/error metadata when violated
- Remove temporary branch duplication patterns in production specs where only selector bound differs by condition (initial target: FITL Air Strike Wild Weasels branch).

### Expected files to touch (minimum)

- `src/kernel/types-ast.ts`
- `src/kernel/schemas-ast.ts`
- `src/kernel/eval-selectors.ts` (or equivalent selector runtime evaluator)
- `src/cnl/compile-effects.ts` and/or selector lowering path
- `schemas/gamedef.schema.json`
- `data/games/fire-in-the-lake.md` (cleanup duplicated `chooseN` branches where applicable)

## 2) Invariants that should pass

- Engine/runtime remain game-agnostic; no FITL-specific conditionals in kernel/compiler.
- Existing literal numeric bounds continue to behave identically.
- Dynamic bounds are deterministic for a fixed seed/state.
- Invalid evaluated bounds fail fast with explicit diagnostics (no silent coercion).
- No backward-compat aliases/path shims; canonical bound contract is expression-capable.

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/compile-selectors.test.ts`
  - compiles selector bounds as literals and expressions.
- `test/unit/schemas-ast.test.ts`
  - accepts expression bounds, rejects malformed/non-integer bound expressions where applicable.
- `test/unit/resolve-selectors.test.ts`
  - runtime evaluation of dynamic min/max, including guardrail failures (`max < min`, negative min).

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - Wild Weasels path uses expression bounds (not duplicated `if` branches) and behavior is unchanged.
- Optional golden/regression snapshot update if selector AST shape changes.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

