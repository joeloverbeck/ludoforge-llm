# TEXHOLKERPRIGAMTOU-010: Runtime Data-Asset Table Access in GameSpec DSL

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-004
**Blocks**: TEXHOLKERPRIGAMTOU-011, TEXHOLKERPRIGAMTOU-014, TEXHOLKERPRIGAMTOU-015

## 1) What needs to be fixed/added

Add first-class, game-agnostic runtime access to structured `dataAssets` payload data from GameSpec expressions/effects.

Current discrepancy (must be addressed by this ticket):
- Current compiler/runtime architecture does not expose `doc.dataAssets` in `GameDef` runtime surfaces.
- Current `OptionsQuery`/`Reference` variants do not include any data-asset table query or row field primitive.
- Current data-asset validation flow treats only `map|scenario|pieceCatalog` as valid envelope kinds.
- Current tests only cover map/scenario/pieceCatalog projection and no runtime table lookup path.

Updated architectural direction:
- Introduce a generic runtime asset registry in `GameDef` so runtime evaluation can access data assets without game-specific code.
- Keep existing map/scenario/pieceCatalog derivation logic for zones/tokenTypes/tracks, but decouple that from runtime access.
- Add one canonical row-query primitive and one canonical row-field reference primitive (no aliases, no alternate syntaxes).
- Prefer explicit, typed diagnostics over implicit `undefined` behavior when asset/table/field resolution fails.

Scope:
- Extend core AST/types/schema/compiler/runtime to support table-style access without game-specific branching.
- Add canonical primitives:
  - `OptionsQuery.query = "assetRows"` for selecting rows from a data-asset payload table.
  - `Reference.ref = "assetField"` for extracting scalar fields from a bound row.
- Ensure scenario payload structures (for example blind schedules) can be queried at runtime from YAML logic.
- Keep engine generic: no Texas Hold'em hardcoding in kernel/compiler.
- Remove kind restrictions that block generic runtime assets; known-kind validation remains only where required for map/scenario/pieceCatalog projection.

Constraints:
- No backwards compatibility layer or alias syntax.
- Single canonical representation for data-table access.
- Deterministic ordering guarantees for row query results.

## 2) Invariants that should pass

1. Runtime table access works for any `doc.dataAssets` entry and any game, not only Texas Hold'em.
2. Missing/invalid asset references produce compile/runtime diagnostics with stable reason codes and contextual metadata.
3. Table row ordering is deterministic across runs and platforms (preserve payload array order; do not use hash/object iteration order).
4. No game-specific identifiers appear in `src/` kernel/compiler logic.
5. Existing non-table gamespecs continue to compile and run without behavior drift.
6. Existing map/scenario/pieceCatalog compile-time projection behavior remains intact.

## 3) Tests that should pass

1. Unit: AST/schema accept canonical `assetRows`/`assetField` nodes and reject malformed shapes.
2. Unit: compiler lowering emits correct AST for `assetRows` queries and `assetField` references.
3. Unit: runtime evaluates `assetRows` deterministically and preserves source row order after filtering.
4. Unit: runtime surfaces structured errors for missing asset, invalid table path, non-row values, and missing/non-scalar fields.
5. Unit: GameDef behavioral validation catches static invalid asset/table references where possible.
6. Integration: gamespec fixture reads scenario schedule table through runtime data-asset primitives and drives variable updates.
7. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Implementation Notes

- Prefer minimal, additive edits in:
  - `src/kernel/types-ast.ts`, `src/kernel/schemas-ast.ts`
  - `src/kernel/types-core.ts`, `src/kernel/schemas-core.ts`
  - `src/cnl/compile-conditions.ts`
  - `src/cnl/compiler-core.ts` and/or data-asset compilation helpers
  - `src/kernel/eval-query.ts`, `src/kernel/resolve-ref.ts`
  - `src/kernel/validate-gamedef-behavior.ts`
- Update `schemas/GameDef.schema.json` if schema contracts change.
- Add tests in existing focused suites (compile-conditions, schemas-ast, eval-query, resolve-ref, validate-gamedef, integration compile pipeline).

## Outcome

- **Completion date**: 2026-02-15
- **What was changed**:
  - Added runtime asset registry support in `GameDef` via `runtimeDataAssets`.
  - Added canonical table primitives:
    - `OptionsQuery.query = "assetRows"` with `assetId`, `table`, `where`.
    - `Reference.ref = "assetField"` with `row`, `field`.
  - Updated compiler lowering, runtime query/ref evaluation, and GameDef validation to support these primitives.
  - Kept map/scenario/pieceCatalog projection intact while allowing custom data-asset kinds when unconstrained.
  - Added integration coverage for end-to-end compile + runtime execution using embedded asset rows.
- **Deviations from original plan**:
  - Extended data-asset kind handling to accept custom kinds by default; legacy kind rejections now occur only where `expectedKinds` is explicitly constrained.
  - Added `runtimeDataAssets` to compiled `GameDef` as the generic long-term extension point.
- **Verification results**:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
