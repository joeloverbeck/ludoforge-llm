# SEATRES-050: Add boundary and mapping-collapse contract tests for card seat-order shape

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - additional invariant regression tests for card seat-order shape across boundary flow and mapping-collapsed duplicates
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md

## Problem

Current card seat-order shape coverage focuses on initialization-path malformed metadata. Two high-value edges are not explicitly locked: boundary flow re-resolution and duplicates introduced by mapping collapse (distinct raw values resolving to the same canonical seat).

## Assumption Reassessment (2026-03-02)

1. `resolveCardSeatOrder()` is used in initialization and card-boundary transition paths, so invariant behavior must remain consistent across both surfaces.
2. Existing tests cover direct duplicate and single-distinct metadata arrays, but do not explicitly assert mapping-induced duplicate collapse.
3. Existing active tickets do not specifically scope these two regression surfaces.

## Architecture Check

1. Contract tests across all entry surfaces are cleaner than assuming one path implies all paths.
2. Mapping-collapse checks keep invariants semantic (resolved seat order), which is game-agnostic and robust.
3. No backwards-compatibility shims are introduced; strict invariants are reinforced.

## What to Change

### 1. Add boundary-flow runtime regression test

1. Add a test that triggers card boundary progression where card seat-order is re-resolved and assert invariant enforcement parity with initialization.
2. Ensure deterministic invariant failure details are asserted.

### 2. Add mapping-collapse duplicate tests

1. Add validator test where distinct raw metadata seat values collapse to duplicate resolved seat values through mapping.
2. Add runtime test for the same collapse scenario to ensure defense-in-depth.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add if best boundary-path harness)

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
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` - runtime mapping-collapse duplicate and boundary path parity assertions.
3. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` - integration boundary-flow invariant regression (if this is the best boundary harness).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
