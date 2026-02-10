# KEREFFINT-004 - Bulk Zone Operations (`moveAll`, `shuffle`) and Spatial Stub

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`

## Goal
Implement bulk zone operations with deterministic ordering semantics and PRNG-backed shuffle, and lock in explicit stub behavior for `moveTokenAdjacent`.

## Scope
- Implement `moveAll` with:
  - zone resolution for `from` and `to`
  - no-op when both resolve to same concrete zone
  - full move behavior preserving source order
  - optional filter evaluation per token in source-order, with current token bound as `$token`
- Implement `shuffle` with Fisher-Yates using kernel PRNG.
- Ensure `shuffle` does not advance RNG for zones of size 0 or 1.
- Preserve existing `moveTokenAdjacent` strict `SpatialNotImplementedError` behavior and coverage.

## Reassessed Assumptions (Current Codebase)
- `moveAll` and `shuffle` are not implemented in `src/kernel/effects.ts`; dispatcher currently throws `EFFECT_NOT_IMPLEMENTED` for `shuffle`.
- `moveTokenAdjacent` is already implemented as a strict runtime stub that throws `SpatialNotImplementedError` with effect context.
- `test/unit/effects-runtime.test.ts` currently asserts `shuffle` is unimplemented; this test must be updated when `shuffle` is implemented.
- `test/unit/effects-zone-ops.test.ts` does not exist yet and should be added for focused zone-op coverage.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `test/unit/effects-zone-ops.test.ts` (new)
- `test/unit/effects-runtime.test.ts`

## Out Of Scope
- Single-token movement and draw.
- Token lifecycle effects.
- Control flow and choice assertion effects.
- Spatial adjacency mechanics from Spec 07.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-zone-ops.test.ts`
  - `moveAll` without filter moves all tokens and preserves relative order.
  - `moveAll` with filter moves only matching tokens, leaving non-matching tokens in source in original order.
  - `moveAll` filter can reference `$token` via `tokenProp`.
  - `moveAll` same source/destination is no-op.
  - `moveAll` on empty source is no-op.
  - `shuffle` yields deterministic order for known seed.
  - `shuffle` advances RNG state for zone size >= 2.
  - `shuffle` leaves state+RNG unchanged for zone size 0/1.
  - `moveTokenAdjacent` throws `SpatialNotImplementedError` with effect context.
- `test/unit/effects-runtime.test.ts`
  - no longer expects `shuffle` to be unimplemented.

## Invariants That Must Remain True
- `moveAll` conserves total token count across zones.
- `shuffle` only reorders tokens within one zone; token identities and counts are unchanged.
- No `Math.random` usage; PRNG is the sole randomness source.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Implemented `moveAll` in `src/kernel/effects.ts` with:
    - `from`/`to` single-zone resolution
    - no-op for same-zone and empty-source cases
    - deterministic source-order movement
    - optional `filter` evaluation using `$token` binding
  - Implemented `shuffle` in `src/kernel/effects.ts` with PRNG-driven Fisher-Yates and no RNG advancement for zone sizes `0` and `1`.
  - Kept existing `moveTokenAdjacent` stub behavior (`SpatialNotImplementedError`) unchanged.
  - Added `test/unit/effects-zone-ops.test.ts` with coverage for `moveAll`, `shuffle`, and spatial stub behavior.
  - Updated `test/unit/effects-runtime.test.ts` to remove the stale assumption that `shuffle` is unimplemented.
- **Deviations from original plan**:
  - `src/kernel/effect-error.ts` did not require changes; existing error types already satisfied the ticket.
- **Verification results**:
  - `npm run build` passed.
  - `node --test "dist/test/unit/effects-zone-ops.test.js"` passed.
  - `npm test` passed (33/33 tests).
