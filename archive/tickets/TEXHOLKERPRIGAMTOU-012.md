# TEXHOLKERPRIGAMTOU-012: Generalized Aggregate Value Expressions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-011 (completed; archived)
**Blocks**: TEXHOLKERPRIGAMTOU-013, TEXHOLKERPRIGAMTOU-014

## 1) What needs to be fixed/added

Current state already supports:
- `aggregate` over numeric queries with omitted `prop`.
- `aggregate` property extraction from token props, map-space props, and `assetRows` fields via `prop`.
- aggregate use from composed queries (`concat`) when runtime item shapes are consistent.

Actual gap:
- Non-`count` aggregate semantics are still coupled to `prop` extraction or direct numeric items.
- There is no canonical per-item binding + expression evaluation model.

Generalize aggregate evaluation so non-`count` aggregate operators compute over a canonical per-item numeric expression.

Scope:
- Replace aggregate contract with one canonical syntax:
  - `count`: `{ aggregate: { op: "count", query } }`
  - `sum|min|max`: `{ aggregate: { op, query, bind, valueExpr } }`
- Remove `aggregate.prop` from AST/schema/compiler/runtime/validation (no aliasing compatibility path).
- Evaluate `valueExpr` once per item in a binding scope where `bind` points to the current item.
- Preserve deterministic query iteration order and safe-integer enforcement.
- Ensure this works uniformly for players, zones/mapSpaces, tokens, numeric ranges, `assetRows`, and `concat` queries.
- Migrate in-repo aggregate usages/tests to the canonical form.

Constraints:
- No game-specific aggregate semantics.
- No legacy `prop` alias behavior.
- Preserve safe-integer runtime checks and deterministic diagnostics.

## 2) Invariants that should pass

1. Non-`count` aggregates evaluate deterministically with explicit per-item binding scope.
2. Aggregate semantics are uniform across query item kinds.
3. Integer safety checks remain enforced.
4. Legacy `aggregate.prop` is rejected by compiler/schema/runtime validation.
5. In-repo aggregate use cases are migrated to canonical `bind` + `valueExpr` with no aliasing.
6. Compiler/runtime diagnostics clearly identify invalid aggregate expressions (missing bind/valueExpr, non-numeric per-item result, overflow).

## 3) Tests that should pass

1. Unit: `sum|min|max` with `bind` + `valueExpr` over players/zones/tokens/numeric ranges/composed queries.
2. Unit: per-item references via existing refs (`binding`, `tokenProp`, `zoneProp`, `assetField`) under aggregate item binding.
3. Unit: validation/compiler diagnostics for invalid aggregate shapes (including rejected legacy `prop`).
4. Unit: safety checks for non-integer per-item values and aggregate overflow.
5. Regression migration coverage: existing aggregate tests updated to canonical syntax.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- **Completion date**: 2026-02-16
- **What was changed**:
  - Replaced legacy non-count aggregate contract (`prop`) with canonical per-item contract (`bind` + `valueExpr`) in AST types, schemas, compiler lowering, runtime evaluation, and behavior validation.
  - Preserved `count` as the canonical shape without per-item value expression.
  - Removed legacy alias behavior and added compiler rejection for old `aggregate.prop` syntax.
  - Migrated in-repo tests and production YAML specs/fixtures that used legacy non-count aggregates.
  - Regenerated schema artifacts (`GameDef`, `Trace`, `EvalReport`).
- **Deviations from original plan**:
  - The ticket’s original assumption that aggregates were limited to token/map-space props was corrected; existing support already included numeric query items and runtime-table row fields.
  - Scope was refined to architectural replacement of non-count aggregate evaluation semantics rather than additive extension.
- **Verification results**:
  - `npm run build` ✅
  - `npm run schema:artifacts:generate` ✅
  - `npm test` ✅
  - `npm run lint` ✅
