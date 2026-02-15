# TEXHOLKERPRIGAMTOU-016: Typed Runtime Table Contracts (Replace String Paths)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-017, TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-019

## 0) Reassessed Current State (Assumptions Correction)

What already exists (from TEXHOLKERPRIGAMTOU-010):
- `runtimeDataAssets` is already compiled into `GameDef`.
- Runtime table access already exists via `assetRows` using `{ assetId, table }` where `table` is a dotted payload path.
- Row field access already exists via `assetField` using `{ row, field }`.
- Structural/runtime diagnostics already exist for missing assets and invalid table paths.

What is still missing (this ticket's actual scope):
- There is no first-class typed table contract section in `GameDef`.
- `assetRows.table` is still string path traversal, not canonical table identity.
- `assetField.field` is still free-form and not tied to declared table schema.

This ticket is therefore a **strict contract migration** from path-based table access to canonical table-id addressing with validated field contracts.

## 1) What needs to be fixed/added

Replace stringly-typed runtime table addressing with first-class typed table contracts in `GameDef`.

Scope:
- Add canonical table contract definitions in `GameDef` (table id, source asset id, source table path, and declared scalar fields).
- Update compiler to derive table contracts from embedded `GameSpecDoc` data assets.
- Replace `assetRows` `{ assetId, table }` addressing with canonical `{ tableId }` addressing.
- Replace free-form `assetField` usage with contract-bound access (`tableId` + field validated against that table contract).
- Enforce deterministic diagnostics for unknown table ids and unknown table fields.
- Remove alias/legacy path forms; keep one canonical representation only.

Non-goals for this ticket:
- Runtime indexing/accessor performance optimization (handled by TEXHOLKERPRIGAMTOU-017).

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

1. Unit: schema/type tests for new `GameDef.tableContracts` and canonical query/reference shapes.
2. Unit: compiler tests deriving deterministic table contracts from embedded data assets.
3. Unit: compile/validation diagnostics for unknown table id and unknown field.
4. Unit: runtime query/reference tests using table-id + field-id only.
5. Integration: compiled fixture using table contracts executes successfully through simulator/applyMove.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- What was actually changed:
  - Added typed runtime table contracts to `GameDef` (`tableContracts`) with canonical table ids, source asset ids, source table paths, and scalar field contracts.
  - Migrated canonical query/reference shapes:
    - `assetRows` now uses `{ tableId }` (removed `{ assetId, table }`).
    - `assetField` now uses `{ row, tableId, field }` (contract-bound field resolution).
  - Compiler now derives table contracts generically from embedded runtime data assets.
  - Runtime query/reference logic now resolves via table contracts and enforces deterministic errors for unknown table ids/fields.
  - GameDef validation now checks runtime table ids/fields in `assetRows.where` and `assetField`, plus structural checks for duplicate table ids/fields and missing contract asset ids.
  - Updated integration/unit suites to canonical table-id addressing and added coverage for `assetField` field-contract diagnostics.
- Deviations from originally planned scope:
  - Kept JSON schema artifacts unchanged in this ticket; runtime/compiler/type-level contracts are implemented and covered by build/test/lint gates.
- Verification results:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
