# ENGINEAGNO-001: Restore Int-Domain Contract Parity for Move Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel validation semantics
**Deps**: None

## Problem

`applyMove` param validation for `intsInRange` / `intsInVarRange` currently accepts values that are within min/max bounds but may violate domain shape constraints (for example `step` membership). This creates a legality mismatch between GameSpecDoc domain definition and runtime enforcement.

Current behavior was introduced by short-circuiting to `isInIntRangeDomain` in `src/kernel/apply-move.ts`, while `isInIntRangeDomain` only checks range bounds in `src/kernel/eval-query.ts`.

## What to Change

1. Update int-domain membership validation so `applyMove` legality enforces the same semantic contract as the declared domain:
   - bounds (`min` / `max`)
   - integer safety
   - `step` membership
   - any other domain-level constraints intended to define legal values
2. Keep `maxResults` as a legal-move enumeration/sampling concern, not a legality concern.
3. Ensure legality for int domains is expressed by a single shared membership function used consistently by:
   - `applyMove` move-param validation
   - any future replay/ingestion APIs
4. Add explicit comments or docs in code clarifying contract vs suggestion semantics.

## Invariants

1. Declared int-domain legality in `applyMove` must be independent from `maxResults` downsampling.
2. Any value violating `step` must be rejected even if within min/max.
3. Values that satisfy declared int-domain contract but were omitted from `legalMoves` due to downsampling must still be accepted.
4. `intsInRange` and `intsInVarRange` follow the same legality model.
5. No game-specific exceptions in engine code.

## Tests

1. Unit: `intsInRange` with `step: 2` rejects odd/even out-of-step value inside bounds.
2. Unit: `intsInVarRange` with `step` rejects out-of-step value inside bounds.
3. Unit: values omitted by `maxResults` but satisfying full domain are accepted.
4. Integration: Texas raise replay case still accepts exact raise amounts outside sampled buckets when they satisfy declared domain contract.
5. Regression: existing legal-move cardinality tests continue to pass.

