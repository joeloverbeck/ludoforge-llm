# TEXHOLKERPRIGAMTOU-011: Composable Multi-Source Queries for OptionsQuery

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-012, TEXHOLKERPRIGAMTOU-014

## 1) What needs to be fixed/added

Add composable query operators so YAML can build item sets from multiple sources (for example player hand + community cards) without engine special cases.

Scope:
- Extend `OptionsQuery` with canonical compositional forms (for example concatenation/union with deterministic semantics).
- Preserve type discipline across query item kinds.
- Support use from existing effects including `evaluateSubset`, `forEach`, and aggregations.
- Define and enforce stable ordering semantics for composed queries.

Constraints:
- No aliasing or duplicate syntaxes for equivalent behavior.
- No Texas-specific combinator behavior.
- Deterministic output ordering is mandatory.

## 2) Invariants that should pass

1. Composed queries are deterministic and stable given identical input state.
2. Query composition remains game-agnostic and reusable across card/board games.
3. Existing single-source query behavior remains unchanged.
4. Compiler/runtime reject invalid mixed-shape composition with clear diagnostics.
5. `evaluateSubset` can consume composed query outputs directly.

## 3) Tests that should pass

1. Unit: AST/schema/compiler support for compositional query nodes.
2. Unit: runtime query composition ordering and result cardinality tests.
3. Unit: composed query usage inside `evaluateSubset` and `forEach`.
4. Unit: invalid composition diagnostics (type/shape mismatch, unknown sources).
5. Integration: fixture evaluating best subset from combined zones.
6. Regression: `npm run build`, `npm test`, `npm run lint`.
