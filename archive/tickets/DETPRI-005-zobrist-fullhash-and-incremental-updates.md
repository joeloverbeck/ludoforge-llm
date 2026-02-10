# DETPRI-005 - Zobrist Full Hash and Incremental Updates

**Status**: ✅ COMPLETED

## Goal
Implement full-state Zobrist hash computation and O(1) incremental XOR update helpers for token placements, variables, and turn metadata.

## Reassessed Assumptions (2026-02-10)
- `src/kernel/zobrist.ts` currently implements `createZobristTable` and `zobristKey` only; `computeFullHash`, `updateHashFeatureChange`, and `updateHashTokenPlacement` are not implemented yet.
- Existing coverage is limited to `test/unit/zobrist-table.test.ts` (table/fingerprint/key determinism); no hash recomputation vs incremental-update tests currently exist.
- `GameState.actionUsage` stores per-action counters as `{ turnCount, phaseCount, gameCount }`; full hash coverage must map these to `actionUsage` features by scope.
- A dedicated fixture file (`test/fixtures/trace/zobrist-known-state.json`) is not required for this ticket scope; deterministic known-state assertions can be expressed directly in unit tests.

## Scope
- Add `computeFullHash(table, state)` covering token placement, global/per-player vars, active player, phase, turn count, and action-usage counters.
- Add `updateHashFeatureChange(...)` and `updateHashTokenPlacement(...)` helpers.
- Add focused unit tests validating incremental updates against full recomputation, path-independence, token identity, and zone-order sensitivity.

## File List Expected To Touch
- `src/kernel/zobrist.ts`
- `test/unit/zobrist-hash-updates.test.ts`

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

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `computeFullHash(table, state)` in `src/kernel/zobrist.ts`, covering token placements, global vars, per-player vars, active player, phase, turn count, and action-usage counters by scope (`turn`/`phase`/`game`).
  - Added incremental helpers `updateHashFeatureChange(...)` and `updateHashTokenPlacement(...)` in `src/kernel/zobrist.ts`.
  - Added `test/unit/zobrist-hash-updates.test.ts` with targeted recomputation-vs-incremental checks and edge-case coverage for token identity and zone order.
- **Deviations from original plan**:
  - `src/kernel/index.ts` did not require edits because it already re-exported `./zobrist.js`; new exports are available through the existing export surface.
  - No JSON fixture file was added; known-state assertions are encoded directly in the new unit tests.
- **Verification**:
  - `npm test` passed (includes build + unit + integration suites).
