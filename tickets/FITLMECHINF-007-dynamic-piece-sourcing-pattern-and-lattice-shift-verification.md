# FITLMECHINF-007 - Dynamic Piece Sourcing Pattern and Lattice Shift Verification

**Status**: Pending
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md` (Tasks 25.3 + Marker Lattice Shift)
**References**: `specs/00-fitl-implementation-order.md` (Milestone B)
**Depends on**: `FITLMECHINF-001` (token filter for counting available pieces by faction)

## Goal

1. Verify that the dynamic piece sourcing pattern (Rule 1.4.1) is fully expressible with existing `EffectAST` (`if/then/else` + `aggregate count`). Document the `sourcePiece` pattern as a reusable compiler macro for Specs 26–27.

2. Verify that the marker lattice shift mechanism works correctly via existing `addVar` with delta +/-1 and clamping to lattice bounds. Add explicit tests for lattice shift edge cases.

## Rationale

Both dynamic piece sourcing and lattice marker shifts are identified in the spec as "already expressible" with existing infrastructure. This ticket confirms that claim with concrete tests, documents the patterns, and flags any gaps. If gaps are found, they are fixed minimally.

## Scope

### Changes

1. **Dynamic piece sourcing tests** (`test/unit/effects-control-flow.test.ts` or new `test/unit/dynamic-sourcing.test.ts`):
   - Build the `sourcePiece` pattern as a nested `if/then/else` EffectAST tree
   - Test: available zone has pieces → placed from available
   - Test: available zone empty, non-US faction → taken from map (any map space)
   - Test: available zone empty, US Troops → skip (no placement)
   - Test: available zone empty, US Bases → skip (no placement)
   - Test: available zone empty, non-restricted piece type (e.g., NVA guerrilla) → taken from map

2. **Compiler macro documentation**: If a compiler macro facility exists, implement `sourcePiece` as an expansion. If not, document the pattern in a spec appendix or code comment for Specs 26–27 to copy.

3. **Lattice marker shift tests** (`test/unit/effects-var.test.ts`):
   - `addVar` with delta +1 on a zone variable at index 2 of a 5-state lattice → moves to index 3
   - `addVar` with delta +1 at max index (4) → clamped to 4 (no change)
   - `addVar` with delta -1 at index 0 → clamped to 0 (no change)
   - `addVar` with delta -1 at index 3 → moves to index 2
   - Verify the existing `clamp(currentValue + delta, min, max)` logic handles lattice bounds

## File List

- `test/unit/dynamic-sourcing.test.ts` — New test file for sourcing pattern
- `test/unit/effects-var.test.ts` — Additional lattice shift edge case tests
- `src/cnl/expand-macros.ts` — Only if implementing `sourcePiece` as a compiler macro (may be deferred)

## Out of Scope

- Stacking enforcement (FITLMECHINF-003/004)
- Free operation flag (FITLMECHINF-005)
- Joint operation cost constraint (FITLMECHINF-006)
- Derived value computation (FITLMECHINF-002)
- Individual FITL operation effect definitions (Spec 26–27)
- Changes to `EffectAST` type definition — this ticket verifies existing AST is sufficient
- Changes to `effects.ts` core logic — only adds tests

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/unit/dynamic-sourcing.test.ts`:
  - Available zone has 3 pieces → `moveToken` from available succeeds, piece placed in target
  - Available zone empty, NVA guerrilla → `moveToken` from map space succeeds
  - Available zone empty, US Troops → outer `if` false, inner `if` false → no effect (skip)
  - Available zone empty, US Bases → same skip behavior
  - Nested `if/then/else` depth of 2 works without errors
- `test/unit/effects-var.test.ts`:
  - Lattice shift +1 from middle state → correct next state
  - Lattice shift +1 at max → clamped, value unchanged
  - Lattice shift -1 at min (0) → clamped, value unchanged
  - Lattice shift -1 from middle state → correct previous state
  - Lattice shift with delta +2 (double shift) → clamped correctly
- `npm run build` passes
- `npm test` passes

### Invariants That Must Remain True

- No changes to `EffectAST` type — the existing AST is sufficient for both patterns
- No changes to `effects.ts` runtime logic — only new test coverage
- Existing `addVar` clamping behavior unchanged
- Existing `if/then/else` nesting behavior unchanged
- The `sourcePiece` pattern is documented as a reusable reference for Specs 26–27
