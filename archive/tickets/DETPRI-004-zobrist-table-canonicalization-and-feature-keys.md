# DETPRI-004 - Zobrist Table Canonicalization and Feature Keying

**Status**: ✅ COMPLETED

## Goal
Implement deterministic Zobrist table creation from canonicalized `GameDef` features and stable keyed mapping from `ZobristFeature` tuples to 64-bit keys.

## Reassessed Assumptions (2026-02-10)
- `src/kernel/zobrist.ts` does not exist yet in the repository and must be created in this ticket.
- No Zobrist unit tests currently exist; this ticket must introduce the base test coverage.
- Dedicated canonicalization fixtures (`test/fixtures/gamedef/zobrist-canonicalization-a.json` / `-b.json`) are not required for this scope; equivalent-order tests can be expressed directly in unit tests.
- `computeFullHash` and incremental update helpers are intentionally deferred to `DETPRI-005`.

## Scope
- Add deterministic fingerprint canonicalization for hash-relevant `GameDef` fields.
- Derive stable table seed from fingerprint.
- Implement `zobristKey(table, feature)` with deterministic feature encoding.

## File List Expected To Touch
- `src/kernel/zobrist.ts`
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `test/unit/zobrist-table.test.ts`

## Implementation Notes
- Canonicalization must explicitly sort declarations and key lists (zones, phases, actions, vars, token declarations).
- Avoid JSON key-order dependence for fingerprint creation.
- Feature encoding must include explicit field labels and separators.
- Hash representation remains BigInt 64-bit compatible.

## Out Of Scope
- `computeFullHash` over full `GameState`.
- Incremental hash updates (`updateHashFeatureChange`, token move wrappers).
- Integration tests over game execution paths.
- PRNG behavior changes.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/zobrist-table.test.ts`:
  - same `GameDef` produces identical `fingerprint` and `seed` across calls.
  - semantically equivalent `GameDef`s with different declaration order yield identical table outputs.
  - different feature tuples map to different key values in representative collision-resistance checks.
  - key generation is deterministic for repeated identical inputs.

### Invariants That Must Remain True
- Zobrist table derivation is pure and deterministic.
- Canonicalization order is explicit and stable.
- Hash/key representation remains integer-only BigInt.
- No mutable global cache is required for correctness.

## Outcome
- **Completed on**: 2026-02-10
- **What changed**:
  - Added `src/kernel/zobrist.ts` with deterministic `createZobristTable(def)` and `zobristKey(table, feature)` implementation.
  - Added `ZobristTable` and `ZobristFeature` types in `src/kernel/types.ts`.
  - Re-exported Zobrist API from `src/kernel/index.ts`.
  - Added `test/unit/zobrist-table.test.ts` covering deterministic table creation, declaration-order canonicalization, representative feature key separation, and key determinism.
- **Deviations from original plan**:
  - Did not add JSON fixture files for canonicalization permutations; equivalent-order coverage is implemented directly in unit tests.
  - Scope remained intentionally limited to table/keying only; full-state hashing and incremental update helpers stay in `DETPRI-005`.
- **Verification**:
  - `npm run test:unit` passed.
  - `npm test` passed.
