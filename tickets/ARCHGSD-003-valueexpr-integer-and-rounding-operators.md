# ARCHGSD-003 - ValueExpr Integer and Rounding Operators

**Status**: TODO  
**Priority**: P1  
**Type**: Architecture / DSL Expressiveness  
**Depends on**: none

## Why this ticket exists
Many board/card rules require integer arithmetic (floor division, rounding, bucketed penalties). Encoding these through threshold hacks is brittle and not reusable.

## 1) Specification (what must change)
- Extend ValueExpr with canonical integer operators:
  - `floorDiv(left, right)` (or equivalent canonical op);
  - optional `ceilDiv` if needed by rules corpus;
  - explicit integer coercion semantics (if required).
- Validate operator arity/types at compile-time with explicit diagnostics.
- Ensure deterministic runtime evaluation and serialization semantics.
- Replace threshold-pattern hacks in production specs where equivalent integer formulas are intended (no alias path).

## 2) Invariants (must remain true)
- Integer operators are deterministic and side-effect free.
- Division-by-zero is rejected deterministically (compile-time when static, runtime diagnostic when dynamic).
- Existing ValueExpr behavior remains unchanged for existing operators.
- Rules encoded with integer formulas compile to game-agnostic GameDef/runtime behavior.

## 3) Tests that must pass
## New tests to add
- `test/unit/kernel/value-expr-integer-ops.test.ts`
  - floor/ceil behavior over positive/zero/negative cases (if negatives allowed);
  - divide-by-zero diagnostics.
- `test/integration/fitl-nva-vc-special-activities.test.ts`
  - Subvert patronage arithmetic expressed with integer operator remains correct.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`

