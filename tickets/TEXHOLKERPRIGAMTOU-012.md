# TEXHOLKERPRIGAMTOU-012: Generalized Aggregate Value Expressions

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-011
**Blocks**: TEXHOLKERPRIGAMTOU-013, TEXHOLKERPRIGAMTOU-014

## 1) What needs to be fixed/added

Generalize aggregate evaluation so aggregate operators can compute over derived expressions per item, not only direct token/map-space props.

Scope:
- Replace/extend aggregate contract to allow canonical `valueExpr` evaluation for each query item.
- Introduce per-item binding context for aggregate evaluation.
- Support aggregate over players, zones, tokens, numeric ranges, and composed queries.
- Keep integer safety and deterministic behavior guarantees.

Constraints:
- No game-specific aggregate semantics.
- No dual legacy/new aggregate forms with alias behavior.
- Preserve safe-integer runtime checks and deterministic diagnostics.

## 2) Invariants that should pass

1. Aggregates evaluate deterministically with explicit per-item binding scope.
2. Aggregate semantics are uniform across item kinds.
3. Integer safety checks remain enforced.
4. Existing aggregate use cases are either preserved canonically or migrated with no aliasing.
5. Compiler/runtime diagnostics clearly identify invalid aggregate expressions.

## 3) Tests that should pass

1. Unit: aggregate over players using per-player variable refs.
2. Unit: aggregate over tokens using derived expression logic.
3. Unit: aggregate over composed query outputs.
4. Unit: safety checks for non-integer/overflow/invalid expression paths.
5. Integration: fixture using aggregate valueExpr for betting-completion style checks.
6. Regression: `npm run build`, `npm test`, `npm run lint`.
