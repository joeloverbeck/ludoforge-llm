# KERCONVALQUEEVA-011: Runtime Table Unique-Key Contracts + Static Invariant Validation

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: KERCONVALQUEEVA-010

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

1. Unit (`schemas-core` / `validate-gamedef-structure`): accepts valid `uniqueBy` declarations; rejects malformed variants.
2. Unit (`validate-gamedef-behavior`): emits diagnostics for `exactlyOne` with unconstrained/non-unique predicates.
3. Unit (`validate-gamedef-behavior`): no diagnostic when predicates cover a declared unique key.
4. Integration: Texas blind schedule with declared unique key (`level`) passes strict validation.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
