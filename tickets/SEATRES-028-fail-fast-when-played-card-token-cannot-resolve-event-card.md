# SEATRES-028: Fail fast when played-card token cannot resolve event card

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — turn-flow runtime invariant enforcement for played-card identity contract
**Deps**: archive/tickets/SEATRES-015-enforce-strict-card-seat-order-metadata-and-initial-active-seat-resolution.md

## Problem

In card-driven mode, seat-order resolution can silently fall back to default order when the `played` zone token’s `cardId` cannot be resolved to any declared event card. This masks corrupted/invalid runtime card state and reintroduces non-deterministic fallback behavior.

## Assumption Reassessment (2026-03-01)

1. `resolveCardSeatOrder()` reads `played` token `cardId` and scans event decks, but when no matching card is found it returns `null` and initialization falls back to default seat order.
2. Current validation enforces metadata value correctness for known cards, but does not protect runtime state from unknown `cardId` tokens injected in played/lookahead lifecycle state.
3. Existing active tickets `SEATRES-016` through `SEATRES-026` do not cover this specific played-card identity fail-fast invariant.

## Architecture Check

1. Failing fast on unknown played-card identity is cleaner than default-order fallback because invalid runtime card state is surfaced immediately.
2. This is game-agnostic: invariant enforces generic event-card identity contract, not game-specific card ids or branching.
3. No compatibility shim is introduced; invalid card identity is rejected deterministically.

## What to Change

### 1. Enforce played-card identity invariant in seat-order resolution

1. In `resolveCardSeatOrder()`, when `cardSeatOrderMetadataKey` is configured and a `played` token has string `cardId` that does not resolve to any `eventDecks[].cards[].id`, throw deterministic `RUNTIME_CONTRACT_INVALID`.
2. Include context in message (at minimum `cardId` and surface).

### 2. Lock behavior with targeted tests

1. Add unit coverage for unknown played-card id causing invariant failure rather than fallback.
2. Keep valid card identity behavior unchanged.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` (modify/add if best coverage point)

## Out of Scope

- Event deck schema/content authoring tools
- Coup order validation (`tickets/SEATRES-016-*.md`)
- Diagnostic taxonomy unification across effect surfaces (`tickets/SEATRES-017-*.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Unknown `cardId` in played card token fails with deterministic `RUNTIME_CONTRACT_INVALID` (no default-order fallback).
2. Valid played card id continues using configured card metadata seat order.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card-driven seat-order derivation only proceeds from valid, resolvable current card identity.
2. Runtime never silently substitutes default order when card identity is invalid.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — unknown played card id invariant failure case.
2. `packages/engine/test/integration/fitl-turn-flow-golden.test.ts` — integration-level guard for invalid played-card identity (if added there).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-turn-flow-golden.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
