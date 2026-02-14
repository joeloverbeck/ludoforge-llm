# ARCHGSD-003 - ValueExpr Integer and Rounding Operators

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Type**: Architecture / DSL Expressiveness  
**Depends on**: none

## Why this ticket exists
Current code already supports integer arithmetic including `op: '/'` with truncating semantics (`Math.trunc`) in runtime evaluation. However, the architecture still has important gaps:
- Rule authors cannot express explicit rounding intent (`floorDiv` / `ceilDiv`) as first-class operators.
- Production FITL Subvert patronage rounding is encoded as threshold branching (`>= 2`, `>= 4`) instead of a canonical formula.
- Compile-time validation does not emit explicit static divide-by-zero diagnostics for arithmetic expressions when the denominator is literal zero.
- Developer-facing capability hints and AST schema/operator declarations are inconsistent with runtime/compiler support.

This ticket focuses on those actual gaps rather than re-adding already existing integer division.

## 1) Specification (what must change)
- Extend ValueExpr arithmetic operator support with canonical integer rounding operators:
  - `floorDiv(left, right)` via `op: 'floorDiv'`
  - `ceilDiv(left, right)` via `op: 'ceilDiv'`
- Keep runtime deterministic, integer-only, side-effect-free semantics.
- Validate arithmetic expressions with explicit diagnostics:
  - static divide-by-zero check at compile/validation time when denominator is literal `0`;
  - runtime `DIVISION_BY_ZERO` for dynamic denominators that evaluate to `0`.
- Align AST/schema/compiler diagnostics text so supported operators are consistent everywhere.
- Replace the FITL Subvert patronage threshold hack with a canonical formula using integer operator semantics (no threshold branching approximation).

## 2) Invariants (must remain true)
- ValueExpr arithmetic remains deterministic and side-effect free.
- Arithmetic operands/results must remain finite safe integers.
- Existing non-arithmetic ValueExpr behavior remains unchanged.
- Rules encoded with integer formulas compile to game-agnostic GameDef/runtime behavior.

## 3) Tests that must pass
## New or updated tests to add
- `test/unit/eval-value.test.ts`
  - floorDiv/ceilDiv behavior for positive/zero/negative combinations;
  - divide-by-zero behavior for `/`, `floorDiv`, and `ceilDiv`.
- `test/unit/validate-gamedef.test.ts`
  - static diagnostic for literal divide-by-zero in ValueExpr arithmetic.
- `test/unit/compile-conditions.test.ts`
  - lowering support for `op: 'floorDiv'` and `op: 'ceilDiv'`.
- `test/integration/fitl-nva-vc-special-activities.test.ts`
  - Subvert patronage arithmetic remains correct using canonical integer formula path.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`

## Outcome
- Completion date: 2026-02-14
- What changed:
  - Added `op: 'floorDiv'` and `op: 'ceilDiv'` support end-to-end in ValueExpr AST typing, CNL lowering, runtime evaluation, and AST schema parsing.
  - Added static compile/validation diagnostics for literal zero denominators across `/`, `floorDiv`, and `ceilDiv` (`VALUE_EXPR_DIVISION_BY_ZERO_STATIC`).
  - Replaced FITL Subvert patronage threshold branching with a canonical formula using `floorDiv`.
  - Added/updated unit and integration tests for operator lowering/evaluation, static diagnostics, schema acceptance, and Subvert pipeline encoding.
- Deviations from original plan:
  - Did not introduce integer coercion semantics because runtime already enforces finite safe-integer operands/results and no new coercion requirement emerged.
  - Kept existing `/` truncating semantics for explicit backward behavior while adding explicit floor/ceil operators for author intent.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm run test` passed.
