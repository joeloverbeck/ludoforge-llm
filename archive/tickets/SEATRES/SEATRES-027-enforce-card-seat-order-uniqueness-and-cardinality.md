# SEATRES-027: Enforce card seat-order uniqueness and cardinality

**Status**: COMPLETED (2026-03-02)
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - GameDef validation + turn-flow runtime invariant hardening for card metadata seat order
**Deps**: archive/tickets/SEATRES-015-enforce-strict-card-seat-order-metadata-and-initial-active-seat-resolution.md

## Problem

Card metadata seat-order entries are validated for unknown seat references, but duplicate and underspecified seat-order arrays can still pass validation and reach runtime. This permits ambiguous card-driven candidate derivation (for example `firstEligible` and `secondEligible` collapsing to the same seat) and weakens deterministic turn-flow contracts.

## Assumption Reassessment (2026-03-02)

1. `resolveCardSeatOrder()` currently resolves and returns mapped seat arrays once tokens are resolvable to player seats; it does not enforce uniqueness or minimum distinct cardinality.
2. `validateCardSeatOrderMapping()` already enforces mapping-target validity and mapping-target uniqueness (`TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_UNKNOWN_SEAT`, `TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_DUPLICATE`) plus source-key normalization collisions, but card metadata arrays are only checked for unknown-seat entries; duplicate resolved seats and insufficient distinct seats are not diagnosed.
3. Existing active SEATRES tickets in `tickets/` (`SEATRES-028+`) do not cover strict metadata seat-order uniqueness/cardinality enforcement for card-driven turn-flow.

## Architecture Check

1. Enforcing uniqueness and minimum distinct cardinality at validation/runtime is cleaner than allowing ambiguous arrays that fail semantically downstream.
2. Checks remain game-agnostic seat-contract invariants on turn-flow metadata (no game-specific identifiers or branching).
3. Runtime guard should be implemented as a reusable invariant helper (rather than ad hoc branching) to keep turn-flow seat-order contract validation centralized and extensible.
4. No backwards-compatibility aliasing or soft fallback paths are introduced; invalid seat-order contracts fail deterministically.

## What to Change

### 1. Add compile-time diagnostics for duplicate/invalid card metadata seat-order shape

1. In `validateCardSeatOrderMapping()`, add deterministic diagnostics for duplicate resolved seat values within a card metadata seat-order array.
2. Add deterministic diagnostic when resolved card metadata seat-order has fewer than 2 distinct seats.
3. Ensure diagnostic paths identify the exact metadata entry/card path.

### 2. Add runtime invariant guard for malformed card metadata seat-order

1. In the card-seat-order resolution path used by turn-flow initialization, assert uniqueness and minimum distinct cardinality before state mutation.
2. Throw deterministic `RUNTIME_CONTRACT_INVALID` with card/metadata context if malformed arrays bypass validation boundaries.
3. Keep this runtime check generic and reusable for future seat-order invariant surfaces.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)

## Out of Scope

- Coup seat-order validation policy (tracked separately)
- Seat-resolution index lifecycle/threading work (`SEATRES-018+` stream)
- Runner rendering behavior

## Acceptance Criteria

### Tests That Must Pass

1. Card metadata seat-order arrays with duplicate resolved seats fail validation with deterministic diagnostic code/path.
2. Card metadata seat-order arrays with fewer than 2 distinct resolved seats fail validation deterministically.
3. Runtime initialization fails with deterministic invariant error if malformed card metadata seat-order bypasses validation.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-driven seat-order metadata must represent a deterministic, non-ambiguous seat sequence.
2. Turn-flow initialization never commits a card seat-order with duplicate seats or fewer than 2 distinct seats.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` - duplicate and insufficient-cardinality card metadata seat-order emits deterministic validation diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` - runtime guard throws when malformed card metadata seat-order is injected post-validation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

Implemented vs planned:
1. Implemented compile-time diagnostics for duplicate resolved seat entries and insufficient distinct seat cardinality in card metadata seat-order values.
2. Added a reusable runtime invariant helper in `turn-flow-runtime-invariants.ts` and enforced it from `resolveCardSeatOrder()` before state mutation.
3. Added unit test coverage for both validation and runtime invariant paths (duplicate-seat and single-distinct-seat edge cases).
4. Expanded scope slightly to add shared seat-order shape analysis in `seat-resolution.ts` to keep validation/runtime logic DRY and extensible.
