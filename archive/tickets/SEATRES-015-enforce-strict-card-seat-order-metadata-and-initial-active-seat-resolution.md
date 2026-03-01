# SEATRES-015: Enforce strict card seat-order metadata and initial active-seat resolution

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — card-driven turn-flow eligibility initialization/runtime invariant handling
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Card-driven seat initialization still tolerates malformed seat metadata in two places: it filters unresolved seat tokens from card metadata seat order and silently leaves `activePlayer` unchanged when `firstEligible` cannot resolve. This reintroduces non-deterministic, partially-applied state under invalid seat contracts.

## Assumption Reassessment (2026-03-01)

1. `resolveCardSeatOrder()` currently maps then filters unresolved seat tokens and returns a reduced list instead of failing fast. Confirmed in `packages/engine/src/kernel/turn-flow-eligibility.ts`.
2. `withActiveFromFirstEligible()` currently no-ops when `firstEligible` cannot resolve to canonical seat/player identity. Confirmed in `packages/engine/src/kernel/turn-flow-eligibility.ts`.
3. Existing fail-fast coverage already includes a runtime invariant in `packages/engine/test/unit/kernel/legal-moves.test.ts` for unresolved active seat in card-driven runtime, but it does not specifically lock initialization-time `firstEligible` resolution behavior.
4. Ticket path assumptions were stale: `packages/engine/test/unit/legal-moves.test.ts` does not exist; the active file is `packages/engine/test/unit/kernel/legal-moves.test.ts`.
5. Compile-time validation currently emits warning `TURN_FLOW_CARD_SEAT_ORDER_ENTRY_DROPPED` for unresolved metadata seat entries (`packages/engine/test/unit/validate-gamedef.test.ts`). This ticket remains runtime-initialization strictness only.

## Architecture Check

1. Strict initialization invariants are cleaner than partial filtering because runtime state remains all-or-nothing valid.
2. This remains game-agnostic: checks validate canonical seat contracts generically; no game-specific branching is introduced.
3. No compatibility aliases/shims are added; malformed metadata must fail loudly.
4. Existing architecture opportunity: runtime strictness and compile-time diagnostics should eventually converge to reject unresolved seat metadata as errors (follow-up ticket), but this ticket keeps scope on runtime initialization invariants.

## What to Change

### 1. Make card metadata seat-order resolution strict

1. In `resolveCardSeatOrder()`, detect any unresolved seat token after card-seat mapping and throw deterministic `RUNTIME_CONTRACT_INVALID` with metadata context (`cardId`, metadata key, offending token).
2. Remove partial filtering behavior.

### 2. Make initial active-seat assignment strict

1. In `withActiveFromFirstEligible()`, throw deterministic `RUNTIME_CONTRACT_INVALID` when non-null `firstEligible` cannot resolve.
2. Ensure `initializeTurnFlowEligibilityState()` and downstream callers never retain stale `activePlayer` under invalid card-driven seat state.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add initialization-invariant assertions as needed)
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
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-driven runtime initialization never produces partially-resolved seat orders.
2. Active-seat derivation is deterministic and strictly canonical.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — malformed card-driven initialization seat state should throw.
2. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — malformed card metadata seat order should fail deterministically.
3. `packages/engine/test/integration/fitl-card-flow-determinism.test.ts` — valid canonical card seat-order determinism remains unchanged after strictness update.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-card-flow-determinism.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

Implemented vs planned:

1. Implemented strict runtime invariants in `packages/engine/src/kernel/turn-flow-eligibility.ts`:
   - `resolveCardSeatOrder()` now throws `RUNTIME_CONTRACT_INVALID` on any unresolved metadata seat token (no partial filtering).
   - `withActiveFromFirstEligible()` now throws `RUNTIME_CONTRACT_INVALID` when non-null `firstEligible` cannot resolve.
2. Added/updated planned tests:
   - `packages/engine/test/unit/kernel/legal-moves.test.ts`
   - `packages/engine/test/integration/fitl-turn-flow-golden.test.ts`
   - `packages/engine/test/integration/fitl-card-flow-determinism.test.ts`
3. Additional scope required to keep the repository green under strict invariants:
   - Updated fixture contracts to include canonical `seats` in:
     - `packages/engine/test/unit/isolated-state-helpers.test.ts`
     - `packages/engine/test/integration/fitl-coup-redeploy-commit-reset.test.ts`
     - `packages/runner/test/model/derive-render-model-zones.test.ts`
   - These tests previously relied on silent fallback/no-op behavior and now explicitly satisfy canonical seat resolution.
4. Verification completed:
   - `pnpm turbo build`
   - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
   - `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
   - `node --test packages/engine/dist/test/integration/fitl-card-flow-determinism.test.js`
   - `pnpm -F @ludoforge/engine test`
   - `pnpm turbo test`
   - `pnpm turbo typecheck`
   - `pnpm turbo lint`

Follow-up architecture improvement implemented after ticket completion:

1. Compile-time validation now matches runtime strictness for card seat metadata:
   - `packages/engine/src/kernel/validate-gamedef-extensions.ts` now emits hard error `TURN_FLOW_CARD_SEAT_ORDER_ENTRY_UNKNOWN_SEAT` (replacing warning `TURN_FLOW_CARD_SEAT_ORDER_ENTRY_DROPPED`) when a mapped metadata seat value is not in `turnFlow.eligibility.seats`.
2. Tests updated to enforce the strict compile-time contract:
   - `packages/engine/test/unit/validate-gamedef.test.ts`
   - `packages/engine/test/integration/fitl-turn-flow-golden.test.ts`
