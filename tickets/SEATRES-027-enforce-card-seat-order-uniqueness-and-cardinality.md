# SEATRES-027: Enforce card seat-order uniqueness and cardinality

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — GameDef validation + turn-flow runtime invariant hardening for card metadata seat order
**Deps**: archive/tickets/SEATRES-015-enforce-strict-card-seat-order-metadata-and-initial-active-seat-resolution.md

## Problem

Card metadata seat-order entries are now validated for unknown seat references, but duplicate and underspecified seat-order arrays can still pass validation and reach runtime. This permits ambiguous card-driven candidate derivation (for example `firstEligible` and `secondEligible` collapsing to the same seat) and weakens deterministic turn-flow contracts.

## Assumption Reassessment (2026-03-01)

1. `resolveCardSeatOrder()` currently returns resolved mapped seat arrays as-is once tokens are resolvable, without enforcing uniqueness/cardinality.
2. `validateCardSeatOrderMapping()` currently errors unknown mapped seats but does not emit diagnostics for duplicate seat values or insufficient order cardinality in metadata arrays.
3. Existing active tickets `SEATRES-016` through `SEATRES-026` do not cover strict metadata seat-order uniqueness/cardinality enforcement for card-driven turn-flow.

## Architecture Check

1. Enforcing uniqueness and minimum cardinality at validation/runtime is cleaner than allowing ambiguous arrays that only fail semantically downstream.
2. This remains game-agnostic: checks are generic seat-contract constraints on turn-flow metadata, not game-specific logic.
3. No backwards-compatibility aliasing or soft fallback paths are introduced; invalid seat-order contracts fail deterministically.

## What to Change

### 1. Add compile-time diagnostics for duplicate/invalid seat-order shape

1. In `validateCardSeatOrderMapping()`, add deterministic error diagnostics for duplicate resolved seat values within a card metadata seat-order array.
2. Add deterministic error diagnostic when resolved seat-order array has fewer than 2 distinct seats (or stricter configured minimum, if policy is formalized in the same ticket).
3. Ensure diagnostic paths identify exact metadata entry/card path.

### 2. Add runtime invariant guard for residual malformed arrays

1. In `resolveCardSeatOrder()` or immediately after seat-order selection in initialization/reset paths, assert uniqueness/cardinality before state mutation.
2. Throw deterministic `RUNTIME_CONTRACT_INVALID` with card/metadata context if malformed arrays bypass validation boundaries.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add if needed)

## Out of Scope

- Coup seat-order validation policy (tracked by `tickets/SEATRES-016-validate-entire-coup-seat-order-at-phase-entry.md`)
- Seat-resolution index lifecycle/threading work (`tickets/SEATRES-018-*.md`, `tickets/SEATRES-019-*.md`)
- Runner rendering behavior

## Acceptance Criteria

### Tests That Must Pass

1. Card metadata seat-order arrays with duplicate resolved seats fail validation with deterministic diagnostic code/path.
2. Card metadata seat-order arrays with insufficient distinct seats fail validation deterministically.
3. Runtime initialization fails with deterministic invariant error if malformed seat-order bypasses validation.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-driven seat-order metadata must represent a deterministic, non-ambiguous seat sequence.
2. Turn-flow initialization/reset never commits a card seat-order with duplicate seats or invalid cardinality.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — duplicate/underspecified card metadata seat-order emits deterministic error diagnostics.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — runtime guard throws if malformed seat-order is injected post-validation.
3. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — valid canonical behavior remains unchanged under stricter metadata shape checks.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
