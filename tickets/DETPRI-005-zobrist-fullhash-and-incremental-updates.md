# DETPRI-005 - Zobrist Full Hash and Incremental Updates

**Status**: Planned

## Goal
Implement full-state Zobrist hash computation and O(1) incremental XOR update helpers for token placements, variables, and turn metadata.

## Scope
- Add `computeFullHash(table, state)` covering all required hash features.
- Add `updateHashFeatureChange(...)` and `updateHashTokenPlacement(...)` helpers.
- Validate incremental updates against full recomputation.

## File List Expected To Touch
- `src/kernel/zobrist.ts`
- `src/kernel/index.ts`
- `test/unit/zobrist-hash-updates.test.ts`
- `test/fixtures/trace/zobrist-known-state.json`

## Implementation Notes
- Full hash must include token identity and slot order, not just counts/types.
- Metadata contributions must include `activePlayer`, `currentPhase`, `turnCount`, and action usage counters.
- Incremental helpers must follow XOR-out/XOR-in contract exactly.

## Out Of Scope
- Game loop wiring (Spec 06 responsibility).
- Lint/static forbidden-API enforcement.
- PRNG algorithm or `nextInt` behavior.
- Performance benchmarking/optimization passes.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/zobrist-hash-updates.test.ts`:
  - token move update result equals `computeFullHash` recomputation.
  - global/per-player variable update result equals recomputation.
  - changing active player/phase/turn/action usage changes hash and matches recomputation.
  - two different transition paths to same final state yield same hash.
  - zone order differences produce different hashes.
  - same-type tokens with distinct token IDs do not cancel hash contribution.
- Existing `test/unit/zobrist-table.test.ts` remains passing.

### Invariants That Must Remain True
- Incremental single-feature updates stay O(1).
- Same state under same table always yields same hash.
- Hash changes when any legal-move-relevant metadata changes.
- BigInt hash is JSON-serialized only via explicit string encoding helpers.
