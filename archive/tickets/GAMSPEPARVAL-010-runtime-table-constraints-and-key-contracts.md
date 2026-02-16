# GAMSPEPARVAL-010: Runtime Table Constraints and Key Contracts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: GAMEDEFGEN-029, KERCONVALQUEEVA-009
**Blocks**: Robust data-contract validation for arbitrary games

## 0) Assumption Reassessment (2026-02-16)

Current code already provides part of this ticket:
- `RuntimeTableContract.uniqueBy` already exists in core types/schema and supports single/composite tuples.
- Structural validation already checks malformed `uniqueBy` declarations (empty tuple, unknown field, repeated field, duplicate tuple).
- Runtime table indexing already builds tuple key indexes from `uniqueBy`.
- `assetRows` with `cardinality: "exactlyOne"` already requires `where` predicates that constrain a declared unique key tuple.

Current code does **not** yet provide the core invariant-validation behavior this ticket targets:
- `uniqueBy` is currently metadata for lookup/cardinality proof, not an enforced data invariant against row payloads.
- No generic contract primitives exist yet for monotonic ordering, contiguous integer ranges, or numeric bounds.
- No declarative YAML path exists in `GameSpecDoc` data assets to express runtime table invariants beyond inferred shape/`uniqueBy`.
- Malformed Texas blind schedule data currently fails only at runtime (`assetRows` cardinality miss), not at compile/validate time via explicit table-contract diagnostics.

## 1) What needs to change/be added

Add generic runtime table contract constraints so data invariants are validated structurally at compile/validate time rather than assumed in game macros.

Scope:
- Keep existing `uniqueBy` contract shape; treat it as an enforced invariant against concrete table rows.
- Extend runtime table contracts with optional generic constraints:
  - monotonic numeric field constraints (`asc`/`desc`, optional strictness),
  - contiguous integer field constraints (optional `start`, optional `step`),
  - numeric range constraints (for example `min: 1` for positive values).
- Add declarative `GameSpecDoc` data-asset table-contract metadata so constraints live in YAML (not engine code).
- Merge declared table-contract metadata with compiler-derived table shape contracts in a generic way.
- Validate constraints deterministically at compile/validate time against runtime data assets with offending table + row diagnostics.
- Encode Texas blind schedule constraints declaratively through generic table contracts (for example contiguous/monotonic `level`, `handsUntilNext >= 1`).

Out of scope:
- Game-specific validators hardcoded in kernel/compiler.
- Rewriting unrelated runtime table query/evaluation architecture.

## 2) Invariants that must pass

1. Constraint evaluation is table-generic and reusable across games.
2. Violations fail compilation/validation deterministically (not deferred to runtime macro failure).
3. No runtime fallback when declared constraints are violated.
4. Constraint metadata is represented in `GameSpecDoc`/`GameDef`, not hidden in game-specific code.
5. Existing `uniqueBy` lookup/cardinality architecture remains generic; new enforcement augments it rather than forks it.

## 3) Tests that must pass

1. Unit: `uniqueBy` data enforcement catches duplicate key rows.
2. Unit: monotonic/contiguous/numeric-range constraints catch malformed rows and report row context.
3. Unit: valid constrained tables pass without diagnostics.
4. Integration: malformed Texas blind schedule data fails compile/validation with explicit runtime-table-contract diagnostics.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Architecture Rationale

This direction is stronger than the current architecture because it moves table invariants from implicit macro assumptions into explicit, reusable contracts evaluated before runtime. That improves robustness (fail-fast), extensibility (new games can declare constraints without engine branches), and maintainability (single generic contract pipeline instead of ad-hoc per-game checks).

## Outcome

- Completion date: 2026-02-16
- Implemented:
  - Added generic runtime table constraints to core contract schema/types: `monotonic`, `contiguousInt`, `numericRange`.
  - Added `GameSpecDoc`-level declarative per-asset `tableContracts` metadata and compiler merge into derived runtime table contracts.
  - Enforced `uniqueBy` and declared constraints against concrete runtime table rows during `validateGameDef` with deterministic diagnostics and row context.
  - Encoded Texas blind schedule constraints declaratively in YAML (`settings.blindSchedule`).
  - Added/updated unit and integration tests covering declaration merge, constraint violations, valid passes, and Texas malformed schedule compile-time failure behavior.
- Deviations from original plan:
  - `uniqueBy` schema shape was not extended (already existed); work focused on enforcement and new generic constraint primitives.
  - Existing runtime failure test for malformed Texas schedule was intentionally updated to assert earlier compile-time validation failure.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
