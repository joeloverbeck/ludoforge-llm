# 63COMZONIDCROREFVAL-008 — Unit Tests for Zone Definition Cross-References

## Summary

Add unit tests for the post-materialization cross-reference validation pass in `materializeZoneDefs`, covering adjacency target and reshuffle source validation.

## Prerequisites

- 63COMZONIDCROREFVAL-001 (diagnostic codes)
- 63COMZONIDCROREFVAL-004 (cross-reference pass implemented)

## File List

| File | Change |
|------|--------|
| `packages/engine/test/unit/compile-zones.test.ts` | Add new test cases for zone definition cross-reference validation |

## Implementation Details

### Test cases to add

All tests should be in a new `describe` block (e.g., `'materializeZoneDefs cross-reference validation'`).

1. **Valid adjacency targets — no diagnostics**
   - Two zones: `field` (owner: none, adjacentTo: [{ to: 'forest:none' }]) and `forest` (owner: none).
   - Expected: no diagnostics with code `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN`.

2. **Invalid adjacency target — emits diagnostic**
   - One zone: `field` (owner: none, adjacentTo: [{ to: 'non-existent:none' }]).
   - Expected: diagnostic with code `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN`, message mentions `non-existent:none` and `field:none`.

3. **Invalid adjacency target includes alternatives**
   - Verify the diagnostic's `alternatives` field lists valid zone IDs.

4. **Valid reshuffle source — no diagnostics**
   - Two zones: `draw-deck` (behavior: { type: 'deck', reshuffleFrom: 'discard' }), `discard` (owner: none).
   - Expected: no diagnostics with code `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN`.

5. **Invalid reshuffle source — emits diagnostic**
   - One zone: `draw-deck` (behavior: { type: 'deck', reshuffleFrom: 'nonexistent' }), no `nonexistent` zone.
   - Expected: diagnostic with code `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN`.

6. **Multiple invalid cross-references — emits multiple diagnostics**
   - Zone with both an invalid adjacency target AND an invalid reshuffle source.
   - Expected: two diagnostics, one of each code.

7. **Player-owned zone adjacency target**
   - Zone `field` with adjacentTo `hand:0`. Player zone `hand` (owner: player) with playersMax=2 produces `hand:0` and `hand:1`.
   - Expected: `hand:0` is valid — no diagnostic.

## Out of Scope

- Tests for `canonicalizeZoneSelector` existence (ticket 007).
- Integration tests with production specs (ticket 009).
- Changes to production source files.

## Acceptance Criteria

### Tests That Must Pass
- All new tests pass: `pnpm -F @ludoforge/engine test`
- All existing tests continue to pass.

### Invariants
- Tests use the existing `node --test` runner (not Vitest/Jest).
- Tests call `materializeZoneDefs` directly with crafted `GameSpecZoneDef[]` inputs.
- Each test verifies the diagnostics array for the expected diagnostic codes.
- Tests follow existing patterns in `compile-zones.test.ts`.
