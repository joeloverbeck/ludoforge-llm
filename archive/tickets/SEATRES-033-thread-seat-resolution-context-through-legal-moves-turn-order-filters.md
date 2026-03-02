# SEATRES-033: Thread seat-resolution context through legal-moves turn-order filters

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — runtime call-chain refactor already landed; this ticket is verification hardening + archival
**Deps**: archive/tickets/SEATRES-018-thread-seat-resolution-context-through-turn-flow-operation-scopes.md

## Problem

This ticket was drafted under a stale assumption. Current runtime code already threads one operation-scoped seat-resolution context through the `legal-moves` turn-order stages and the `apply-move` turn-flow preflight path. The remaining gap is ensuring that architecture stays locked by explicit regression guards.

## Assumption Reassessment (2026-03-02)

1. `applyTurnFlowWindowFilters(...)` and `applyPendingFreeOperationVariants(...)` already accept `SeatResolutionContext` and pass it into `requireCardDrivenActiveSeat(...)` (`packages/engine/src/kernel/legal-moves-turn-order.ts`).
2. `enumerateLegalMoves(...)` already creates one `seatResolution` and threads it through eligibility checks + both turn-order helper stages (`packages/engine/src/kernel/legal-moves.ts`).
3. `apply-move` preflight already calls `applyTurnFlowWindowFilters(def, state, [move], seatResolution)` with explicit context (`packages/engine/src/kernel/apply-move.ts`).
4. `packages/engine/test/unit/kernel/legal-moves.test.ts` already contains AST guard coverage for legal-moves threading, but `packages/engine/test/unit/kernel/apply-move.test.ts` does not yet lock the explicit-context preflight call chain.

## Architecture Check

1. The current architecture (single operation-scoped context threaded through consumers) is preferable to local helper-owned context creation because lifecycle ownership is explicit and composable.
2. The remaining work should stay test-only and game-agnostic; no game-specific branching or payload contracts.
3. No backwards-compat aliases/shims: guard explicit context threading directly in tests so regressions fail loudly.

## What to Change

### 1. Correct stale assumptions in ticket scope

1. Record that runtime call-chain changes are already complete in `legal-moves.ts`, `legal-moves-turn-order.ts`, and `apply-move.ts`.
2. Narrow this ticket to verification hardening and archival.

### 2. Harden architecture regression coverage

1. Add an AST architecture guard in `packages/engine/test/unit/kernel/apply-move.test.ts` that asserts turn-flow preflight window filtering passes explicit `seatResolution`.
2. Preserve runtime behavior and error surfaces (test-only change).

## Files to Touch

- `tickets/SEATRES-033-thread-seat-resolution-context-through-legal-moves-turn-order-filters.md` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)

## Out of Scope

- Active-seat invariant surface typing tickets (`SEATRES-030`, `SEATRES-031`, `SEATRES-032`)
- Seat-catalog/compiler diagnostics
- Runner visual/model behavior

## Acceptance Criteria

### Tests That Must Pass

1. Confirmed: one legal-moves operation path uses a single explicit seat-resolution context across turn-order filter/variant stages (guarded by existing `kernel/legal-moves.test.ts` AST checks).
2. Add/confirm: `apply-move` turn-flow preflight path uses explicit seat-resolution context (new `kernel/apply-move.test.ts` AST guard).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle ownership is explicit at legal-moves/apply-move operation boundaries.
2. Kernel/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add AST guard ensuring turn-flow preflight threads explicit `seatResolution` into `applyTurnFlowWindowFilters(...)`.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — existing architecture guard remains authoritative for legal-moves chain (no code changes expected).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-02
- **What actually changed**:
  - Reassessed and corrected stale ticket assumptions: runtime call-chain threading was already implemented in `legal-moves.ts`, `legal-moves-turn-order.ts`, and `apply-move.ts`.
  - Narrowed scope from runtime refactor to regression-hardening and archival.
  - Added architecture-guard coverage in `packages/engine/test/unit/kernel/apply-move.test.ts` to assert explicit `seatResolution` threading into turn-flow preflight window filtering.
- **Deviations from original plan**:
  - No kernel runtime code changes were required; the originally proposed implementation had already landed.
  - Work focused on ticket correction + missing test guard rather than refactoring source modules.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (355/355).
  - `pnpm turbo test` passed (engine + runner).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
