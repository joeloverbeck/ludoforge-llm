# 63COMZONIDCROREFVAL-007 — Unit Tests for `canonicalizeZoneSelector` Zone ID Existence

## Summary

Add unit tests to the existing `canonicalizeZoneSelector` test file covering the new zone ID existence check behavior.

## Prerequisites

- 63COMZONIDCROREFVAL-001 (diagnostic codes)
- 63COMZONIDCROREFVAL-003 (`canonicalizeZoneSelector` enhanced)

## File List

| File | Change |
|------|--------|
| `packages/engine/test/unit/compile-zones.test.ts` | Add new test cases for zone ID existence validation |

## Implementation Details

### Test cases to add

All tests should be in a new `describe` block (e.g., `'canonicalizeZoneSelector zone ID existence'`).

1. **Valid literal zone ID with `zoneIdSet` provided**
   - Input: `'deck:none'`, ownershipByBase `{ deck: 'none' }`, zoneIdSet `new Set(['deck:none'])`
   - Expected: value `'deck:none'`, no diagnostics

2. **Invalid literal zone ID with `zoneIdSet` provided**
   - Input: `'deck:none'`, ownershipByBase `{ deck: 'none' }`, zoneIdSet `new Set(['hand:none'])`
   - Expected: value `null`, diagnostic with code `CNL_COMPILER_ZONE_ID_UNKNOWN`, `alternatives` is `[]` (no IDs with `deck:` prefix)

3. **Invalid zone ID with alternatives**
   - Input: `'hand:0'`, ownershipByBase `{ hand: 'player' }`, zoneIdSet `new Set(['hand:0', 'hand:1', 'hand:2'])`... wait, `hand:0` IS in the set. Use `hand:5` instead.
   - Input: `'hand:5'`, ownershipByBase `{ hand: 'player' }`, seatIds `['0','1','2','3','4','5']`, zoneIdSet `new Set(['hand:0', 'hand:1', 'hand:2'])`
   - Expected: value `null`, diagnostic code `CNL_COMPILER_ZONE_ID_UNKNOWN`, `alternatives` includes `['hand:0', 'hand:1', 'hand:2']`

4. **Binding reference (`$space`) with `zoneIdSet` provided**
   - Input: `'$space'`, ownershipByBase `{ deck: 'none' }`, zoneIdSet `new Set(['deck:none'])`
   - Expected: value `'$space'`, no diagnostics (bindings skip validation)

5. **No `zoneIdSet` provided (undefined)**
   - Input: `'nonexistent:none'`, ownershipByBase `{ nonexistent: 'none' }`, zoneIdSet `undefined`
   - Expected: value `'nonexistent:none'`, no diagnostics (existence check skipped)

6. **Valid `owner: 'none'` auto-qualification**
   - Input: `'deck'`, ownershipByBase `{ deck: 'none' }`, zoneIdSet `new Set(['deck:none'])`
   - Expected: value `'deck:none'`, no diagnostics

7. **Invalid auto-qualified zone**
   - Input: `'deck'`, ownershipByBase `{ deck: 'none' }`, zoneIdSet `new Set(['hand:none'])`
   - Expected: value `null`, diagnostic code `CNL_COMPILER_ZONE_ID_UNKNOWN`

8. **Dynamic qualifier binding (`hand:$actor`)**
   - Input: `'hand:$actor'`, ownershipByBase `{ hand: 'player' }`, zoneIdSet `new Set(['hand:0', 'hand:1'])`
   - Expected: value `'hand:$actor'`, no diagnostics (dynamic qualifier skips validation)

## Out of Scope

- Tests for zone definition cross-references (adjacency, reshuffle — ticket 008).
- Integration tests with production specs (ticket 009).
- Changes to production source files.

## Acceptance Criteria

### Tests That Must Pass
- All new tests pass: `pnpm -F @ludoforge/engine test`
- All existing tests continue to pass.

### Invariants
- Tests use the existing `node --test` runner (not Vitest/Jest).
- Tests follow the existing patterns in `compile-zones.test.ts`.
- Each test verifies both the `value` and `diagnostics` fields of the result.
- Tests cover both the `zoneIdSet` present and absent cases.
