# SEATRES-033: Thread seat-resolution context through legal-moves turn-order filters

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel legal-moves turn-order filter call chain
**Deps**: archive/tickets/SEATRES-018-thread-seat-resolution-context-through-turn-flow-operation-scopes.md

## Problem

`legal-moves` operation paths still resolve active seat through helper calls that build seat-resolution context independently inside adjacent filter/variant stages. This leaves operation-scoped lifecycle ownership partially implicit in a hot path.

## Assumption Reassessment (2026-03-02)

1. `applyTurnFlowWindowFilters(...)` and `applyPendingFreeOperationVariants(...)` each call `requireCardDrivenActiveSeat(...)` without receiving a prebuilt seat-resolution context.
2. `legalMoves(...)` composes these two functions in one operation chain, so duplicate seat-resolution construction can occur in a single legal-moves request.
3. `SEATRES-019` focuses on lifecycle regression guards/tests, not call-chain refactor of these turn-order filter functions.

## Architecture Check

1. Passing one operation-scoped seat-resolution context through legal-moves filter/variant stages is cleaner than repeated local context creation.
2. This change is runtime/kernel-only and game-agnostic; no game-specific behavior is introduced.
3. No backwards-compat aliases/shims: call signatures are updated directly and callers adopt explicit context threading.

## What to Change

### 1. Thread seat-resolution context through legal-moves turn-order helpers

1. Update `applyTurnFlowWindowFilters(...)` and `applyPendingFreeOperationVariants(...)` to accept an explicit `SeatResolutionContext`.
2. Pass one prebuilt context from `legalMoves(...)` into both helper calls.
3. Update `apply-move` preflight path that uses `applyTurnFlowWindowFilters(...)` to provide explicit context.

### 2. Preserve behavior while removing duplicate lifecycle work

1. Keep move filtering/variant semantics unchanged.
2. Keep runtime error surfaces/messages unchanged.

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/seat-resolution.ts` (modify only if helper surface needs minor extension)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/legal-moves.test.ts` (modify/add if helper API tests live there)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)

## Out of Scope

- Active-seat invariant surface typing tickets (`SEATRES-030`, `SEATRES-031`, `SEATRES-032`)
- Seat-catalog/compiler diagnostics
- Runner visual/model behavior

## Acceptance Criteria

### Tests That Must Pass

1. One legal-moves operation path uses a single explicit seat-resolution context across turn-order filter/variant stages.
2. `apply-move` turn-flow preflight path uses explicit seat-resolution context.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle ownership is explicit at legal-moves operation boundaries.
2. Kernel/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add/strengthen regression coverage for legal-moves turn-order filtering parity under context threading.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — ensure turn-flow preflight behavior remains unchanged with explicit context ownership.
3. `packages/engine/test/unit/legal-moves.test.ts` — adjust/add helper-level coverage if this suite owns turn-order filter API tests.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
