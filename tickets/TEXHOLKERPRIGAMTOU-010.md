# TEXHOLKERPRIGAMTOU-010: Runtime Data-Asset Table Access in GameSpec DSL

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-004
**Blocks**: TEXHOLKERPRIGAMTOU-011, TEXHOLKERPRIGAMTOU-014, TEXHOLKERPRIGAMTOU-015

## 1) What needs to be fixed/added

Add first-class, game-agnostic runtime access to structured `dataAssets` payload data from GameSpec expressions/effects.

Scope:
- Extend core AST/types/schema/compiler/runtime to support table-style access without game-specific branching.
- Add canonical primitives for row selection and field extraction (no aliases).
- Ensure scenario payload structures (for example blind schedules) can be queried at runtime from YAML logic.
- Keep engine generic: no Texas Hold'em hardcoding in kernel/compiler.

Constraints:
- No backwards compatibility layer or alias syntax.
- Single canonical representation for data-table access.
- Deterministic ordering guarantees for row query results.

## 2) Invariants that should pass

1. Runtime table access works for any `dataAssets` entry and any game, not only Texas Hold'em.
2. Missing/invalid asset references produce compile/runtime diagnostics with stable reason codes.
3. Table row ordering is deterministic across runs and platforms.
4. No game-specific identifiers appear in `src/` kernel/compiler logic.
5. Existing non-table gamespecs continue to compile and run without behavior drift.

## 3) Tests that should pass

1. Unit: AST/schema accept canonical table access nodes and reject malformed shapes.
2. Unit: compiler lowering emits correct AST for table queries and field references.
3. Unit: runtime evaluates table row selection deterministically.
4. Unit: runtime surfaces structured errors for missing asset/table/field.
5. Integration: gamespec fixture reads scenario schedule table and drives variable updates.
6. Regression: `npm run build`, `npm test`, `npm run lint`.
