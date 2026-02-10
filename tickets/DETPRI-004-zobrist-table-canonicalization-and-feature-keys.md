# DETPRI-004 - Zobrist Table Canonicalization and Feature Keying

**Status**: Planned

## Goal
Implement deterministic Zobrist table creation from canonicalized `GameDef` features and stable keyed mapping from `ZobristFeature` tuples to 64-bit keys.

## Scope
- Add deterministic fingerprint canonicalization for hash-relevant `GameDef` fields.
- Derive stable table seed from fingerprint.
- Implement `zobristKey(table, feature)` with deterministic feature encoding.

## File List Expected To Touch
- `src/kernel/zobrist.ts`
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `test/unit/zobrist-table.test.ts`
- `test/fixtures/gamedef/zobrist-canonicalization-a.json`
- `test/fixtures/gamedef/zobrist-canonicalization-b.json`

## Implementation Notes
- Canonicalization must explicitly sort IDs/names (zones, phases, actions, vars, token declarations).
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
