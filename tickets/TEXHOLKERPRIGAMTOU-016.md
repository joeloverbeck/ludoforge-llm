# TEXHOLKERPRIGAMTOU-016: Typed Runtime Table Contracts (Replace String Paths)

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-017, TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-019

## 1) What needs to be fixed/added

Replace stringly-typed runtime table addressing with first-class typed table contracts in `GameDef`.

Scope:
- Add canonical table contract definitions in `GameDef` (for example: table id, source asset id, row schema, scalar field declarations).
- Update compiler to derive/validate table contracts from `GameSpecDoc` data assets.
- Replace `assetRows.table` dotted-path addressing with canonical table-id addressing.
- Replace `assetField.field` free-form usage with field names validated against table schema.
- Remove alias/legacy path forms; keep one canonical representation only.

Constraints:
- No game-specific table handling in kernel/runtime.
- No backwards compatibility path syntax.
- Table contracts must be generic and reusable across all games.

## 2) Invariants that should pass

1. Runtime table queries are validated against declared table contracts before execution.
2. Invalid table ids and invalid fields are rejected deterministically with stable diagnostics.
3. `GameDef` remains game-agnostic; table contracts contain no game-specific branching logic.
4. Existing map/scenario/pieceCatalog projection behavior remains unchanged.
5. Canonical table references are sufficient to express current Texas Hold'em schedule use-cases.

## 3) Tests that should pass

1. Unit: schema/type tests for new `GameDef` table contract section.
2. Unit: compiler tests deriving table contracts from embedded data assets.
3. Unit: compile/validation diagnostics for unknown table id / unknown field.
4. Unit: runtime query/reference tests using table-id + field-id only.
5. Integration: compiled fixture using table contracts executes successfully through simulator.
6. Regression: `npm run build`, `npm test`, `npm run lint`.
