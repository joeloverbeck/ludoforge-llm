# KERCONVALQUEEVA-011: Runtime Table Unique-Key Contracts + Static Invariant Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: KERCONVALQUEEVA-010

## Assumption Reassessment (2026-02-16)

- Confirmed discrepancy in contract/schema assumptions:
  - `RuntimeTableContract` currently has `id`, `assetId`, `tablePath`, and `fields` only (`src/kernel/types-core.ts`).
  - `uniqueBy` does not exist in `src/kernel/schemas-core.ts` or `schemas/GameDef.schema.json`.
- Confirmed discrepancy in behavior-validation assumptions:
  - `validateOptionsQuery(... assetRows ...)` in `src/kernel/validate-gamedef-behavior.ts` validates table/field references, but does not enforce compile-time `exactlyOne` proof invariants.
- Confirmed discrepancy in test-location assumptions:
  - There is no `schemas-core` unit test file; top-level schema coverage is in `test/unit/schemas-top-level.test.ts`.
- Confirmed dependency status:
  - `KERCONVALQUEEVA-010` is completed and archived (`archive/tickets/KERCONVALQUEEVA-010-assetrows-cardinality-empty-where-enforcement.md`).
- Architectural reassessment:
  - Adding declarative `uniqueBy` to generic runtime table contracts is beneficial over current architecture because it shifts `exactlyOne` correctness from runtime-only failure into deterministic compile-time validation.
  - Keep architecture extensible by representing uniqueness as an array of key tuples (`string[][]`) in shared kernel/schema contracts, with no game-specific logic or per-game schemas.
  - Do not add aliases/backward-compat layers; adopt a single contract shape and fix call sites/tests accordingly.

## 1) What needs to change/be added

- Extend generic runtime table contract model with declarative uniqueness metadata (for example `uniqueBy` with one or more field tuples).
- Validate uniqueness metadata structurally at compile/validation time:
  - fields must exist in table contract,
  - no duplicate/empty tuples,
  - deterministic diagnostics.
- Add behavior-level validation for `assetRows` with `cardinality: exactlyOne`:
  - if query has no predicates, emit invariant diagnostic,
  - if predicates do not constrain at least one declared unique key path, emit invariant diagnostic.
- Keep game-agnostic schema ownership in shared compiler/kernel types (no per-game schemas).

## 2) Invariants that should pass

1. Table contracts can declare unique keys in a deterministic, schema-validated form.
2. Invalid unique-key declarations are rejected with stable diagnostics.
3. `exactlyOne` queries that cannot be proven key-constrained are surfaced as compile-time validation issues.
4. Existing games without `uniqueBy` remain valid unless they opt into `exactlyOne` in unprovable ways.

## 3) Tests that should pass

1. Unit (`schemas-top-level` / `validate-gamedef-structure`): accepts valid `uniqueBy` declarations; rejects malformed variants.
2. Unit (`validate-gamedef-behavior`): emits diagnostics for `exactlyOne` with unconstrained/non-unique predicates.
3. Unit (`validate-gamedef-behavior`): no diagnostic when predicates cover a declared unique key.
4. Integration: Texas blind schedule contract declares unique key (`level`) and passes strict validation.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Added optional `tableContracts[].uniqueBy` to shared runtime table contract types and schemas.
  - Added structural unique-key validation in `validate-gamedef-structure` for:
    - empty tuples,
    - unknown fields,
    - duplicate fields inside a tuple,
    - duplicate tuples (order-insensitive canonical comparison).
  - Added behavior-level `assetRows` invariant checks in `validate-gamedef-behavior` for `cardinality: exactlyOne`:
    - missing `where`,
    - missing `uniqueBy`,
    - predicates that do not fully constrain any declared unique tuple via `eq`.
  - Extended compiler data-asset table-contract derivation to infer generic single-field unique keys from scalar row tables, enabling strict validation on compiled scenario tables (including Texas blind schedule).
  - Added/updated unit and integration tests for schema shape, structural diagnostics, behavior diagnostics, and Texas contract coverage.
- Deviations from original plan:
  - No scope reduction; implementation stayed within generic shared contract/validator architecture.
  - Integration verification used generic inferred `uniqueBy` metadata from compiled table contracts rather than game-specific hardcoded declarations.
- Verification results:
  - `npm run build` passed.
  - Targeted tests passed:
    - `node --test dist/test/unit/validate-gamedef.test.js dist/test/unit/schemas-top-level.test.js dist/test/unit/texas-holdem-spec-structure.test.js`
  - `npm test` passed.
  - `npm run lint` passed.
