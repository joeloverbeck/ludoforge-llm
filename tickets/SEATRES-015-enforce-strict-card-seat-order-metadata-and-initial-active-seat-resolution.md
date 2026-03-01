# SEATRES-015: Enforce strict card seat-order metadata and initial active-seat resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — card-driven turn-flow eligibility initialization/runtime invariant handling
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Card-driven seat initialization still tolerates malformed seat metadata in two places: it filters unresolved seat tokens from card metadata seat order and silently leaves `activePlayer` unchanged when `firstEligible` cannot resolve. This reintroduces non-deterministic, partially-applied state under invalid seat contracts.

## Assumption Reassessment (2026-03-01)

1. `resolveCardSeatOrder()` currently maps then filters unresolved seat tokens and returns a reduced list instead of failing fast.
2. `withActiveFromFirstEligible()` currently no-ops when `firstEligible` cannot resolve to canonical seat/player identity.
3. Existing tests added in SEATRES-010 enforce several fail-fast paths, but do not currently lock these two initialization-specific invariants.
4. This gap is not covered by active tickets `SEATRES-011` through `SEATRES-014`.

## Architecture Check

1. Strict initialization invariants are cleaner than partial filtering because runtime state remains all-or-nothing valid.
2. This remains game-agnostic: checks validate canonical seat contracts generically; no game-specific branching is introduced.
3. No compatibility aliases/shims are added; malformed metadata must fail loudly.

## What to Change

### 1. Make card metadata seat-order resolution strict

1. In `resolveCardSeatOrder()`, detect any unresolved seat token after card-seat mapping and throw deterministic `RUNTIME_CONTRACT_INVALID` with metadata context (`cardId`, metadata key, offending token).
2. Remove partial filtering behavior.

### 2. Make initial active-seat assignment strict

1. In `withActiveFromFirstEligible()`, throw deterministic `RUNTIME_CONTRACT_INVALID` when non-null `firstEligible` cannot resolve.
2. Ensure `initializeTurnFlowEligibilityState()` and downstream callers never retain stale `activePlayer` under invalid card-driven seat state.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/legal-moves.test.ts` (modify/add initialization-invariant assertions as needed)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add malformed-seat metadata coverage)
- `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` (modify/add malformed-seat metadata coverage)

## Out of Scope

- SeatCatalog compile-time selection/diagnostics
- Seat-resolution hot-path index lifecycle optimization
- Runner visual behavior

## Acceptance Criteria

### Tests That Must Pass

1. Card metadata seat order containing any unresolved seat token fails with deterministic invariant error (no partial filtered order).
2. Non-null `firstEligible` that cannot resolve fails fast instead of preserving prior `activePlayer`.
3. Valid canonical seat metadata/order behavior remains unchanged.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card-driven runtime initialization never produces partially-resolved seat orders.
2. Active-seat derivation is deterministic and strictly canonical.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/legal-moves.test.ts` — malformed card-driven initialization seat state should throw.
2. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — malformed card metadata seat order should fail deterministically.
3. `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` — regression parity for valid canonical card seat orders.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/legal-moves.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-card-flow-determinism.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
