# SEATRES-050: Add boundary and mapping-collapse contract tests for card seat-order shape

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - additional invariant regression tests for card seat-order shape across boundary flow and mapping-collapsed duplicates
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md

## Problem

Current card seat-order shape coverage focuses on initialization-path malformed metadata. Two high-value edges are not explicitly locked: boundary flow re-resolution and duplicates introduced by mapping collapse (distinct raw values resolving to the same canonical seat).

## Assumption Reassessment (2026-03-02)

1. `resolveCardSeatOrder()` is used in initialization and card-boundary transition paths, so invariant behavior must remain consistent across both surfaces.
2. Existing tests already cover runtime/validation failures for direct duplicate and insufficient-distinct seat-order arrays, but do not explicitly assert mapping-induced duplicate collapse (distinct raw values resolving to the same canonical seat).
3. Existing unit coverage does not directly assert boundary-path re-resolution failure on malformed next-card metadata; adding this in `apply-move` unit tests is a more direct and stable harness than FITL golden integration.
4. Existing active tickets do not specifically scope these two regression surfaces.

## Architecture Check

1. Contract tests across all entry surfaces are cleaner than assuming one path implies all paths.
2. Mapping-collapse checks keep invariants semantic (resolved seat order), which is game-agnostic and robust.
3. No backwards-compatibility shims are introduced; strict invariants are reinforced.

## What to Change

### 1. Add boundary-flow runtime regression test

1. Add a unit test in `apply-move` coverage that triggers card boundary progression where card seat-order is re-resolved and assert invariant enforcement parity with initialization.
2. Ensure deterministic invariant failure details are asserted.

### 2. Add mapping-collapse duplicate tests

1. Add validator test where distinct raw metadata seat values collapse to duplicate resolved seat values through mapping.
2. Add runtime initialization-path test for the same collapse scenario to ensure defense-in-depth.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)

## Out of Scope

- New invariant policy definitions (tracked separately)
- Runtime context typing redesign (tracked separately)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Boundary-path card seat-order re-resolution enforces the same shape invariants as initialization path.
2. Mapping-collapsed duplicates fail deterministically at validation and runtime.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Seat-order shape contract is enforced consistently across all resolver entry surfaces.
2. Enforcement is based on resolved seat order semantics, not raw token uniqueness.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` - mapping-collapse duplicate diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` - runtime initialization-path mapping-collapse duplicate invariant assertion.
3. `packages/engine/test/unit/kernel/apply-move.test.ts` - boundary re-resolution mapping-collapse duplicate invariant assertion.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Added validation coverage for mapping-collapse duplicates in `packages/engine/test/unit/validate-gamedef.test.ts`.
  - Added runtime initialization-path coverage for mapping-collapse duplicates in `packages/engine/test/unit/kernel/legal-moves.test.ts`.
  - Added boundary re-resolution runtime coverage (next-card promotion path) for mapping-collapse duplicates in `packages/engine/test/unit/kernel/apply-move.test.ts`.
  - Re-scoped ticket assumptions to use unit-level boundary harness (`apply-move`) instead of FITL golden integration.
- **Deviations from original plan**:
  - Did not add `fitl-turn-flow-golden` integration changes; boundary invariant coverage was implemented in direct kernel unit tests for tighter contract isolation and lower maintenance cost.
- **Verification results**:
  - Passed `pnpm turbo build`.
  - Passed targeted dist tests:
    - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
  - Passed `pnpm -F @ludoforge/engine test`.
  - Passed `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`.
