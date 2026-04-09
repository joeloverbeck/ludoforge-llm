# 120MAREFFDOM-003: Final verification of marker effect domain separation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None
**Deps**: `archive/tickets/120MAREFFDOM-001.md`

## Problem

After the extraction and consumer import rewiring completed under ticket 001, a final verification pass confirms the refactoring is complete and no regressions were introduced. This ticket exists to formalize the verification gate before the spec can be marked as implemented.

## Assumption Reassessment (2026-04-09)

1. Ticket 001 will have completed the full extraction and consumer import rewiring
2. All tests should pass unchanged — this is a pure structural refactoring with no behavioral changes
3. The spec's 5 invariants must all hold after the refactoring

## Architecture Check

1. Verification-only ticket — no code changes, only validation
2. Confirms the architectural improvement: two focused modules instead of one overloaded file
3. No backwards-compatibility concerns — nothing to check beyond what exists

## What to Change

### 1. Run full build and test suite

Execute the complete verification battery:
- `pnpm turbo build`
- `pnpm turbo test --force` (bypass cache for guaranteed fresh run)
- `pnpm turbo typecheck`
- `pnpm turbo lint`

### 2. Verify spec invariants

Confirm all 5 invariants from the spec:
1. Every effect function retains its exact signature and behavior (tests pass)
2. The effect registry maps to the same functions, just from different modules (grep `effect-registry.ts` imports)
3. No new public exports beyond the moved functions and shared utilities (grep exports in both files)
4. `effects-choice.ts` no longer contains any marker-related code (grep for `Marker`, `marker`, `resolveMarkerLattice`, `resolveGlobalMarkerLattice`)
5. `effects-markers.ts` does not contain any decision/choice-related code (grep for `chooseOne`, `chooseN`, `rollRandom`, `PendingChoice`)

### 3. Verify file sizes are reasonable

- `effects-choice.ts` should be ~1114 lines (decision effects + shared utilities + helpers)
- `effects-markers.ts` should be ~428 lines (marker effects + lattice helpers + imports)

## Files to Touch

None — verification only.

## Out of Scope

- Any code changes — this is a verification gate
- Performance benchmarking
- Addressing globalMarker defaultState projection drift

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — zero errors
2. `pnpm turbo test --force` — all tests pass
3. `pnpm turbo typecheck` — zero type errors
4. `pnpm turbo lint` — zero lint errors

### Invariants

1. `effects-choice.ts` contains zero marker-related functions
2. `effects-markers.ts` contains zero decision-related functions
3. Effect registry dispatch behavior is identical (all tests pass)
4. No re-exports or compatibility shims exist

## Test Plan

### New/Modified Tests

None.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test --force`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
