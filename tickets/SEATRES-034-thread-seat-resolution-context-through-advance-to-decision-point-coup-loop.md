# SEATRES-034: Thread seat-resolution context through advance-to-decision-point coup loop

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel phase-advance coup-loop operation scope
**Deps**: archive/tickets/SEATRES-018-thread-seat-resolution-context-through-turn-flow-operation-scopes.md

## Problem

`advanceToDecisionPoint(...)` can repeatedly call coup-loop helpers that currently allocate seat-resolution context internally per iteration. This weakens operation-scoped lifecycle ownership and adds avoidable churn in auto-advance paths.

## Assumption Reassessment (2026-03-02)

1. `coupPhaseImplicitPass(...)` currently defaults to creating seat-resolution context when not provided one.
2. `advanceToDecisionPoint(...)` currently calls `coupPhaseImplicitPass(def, nextState)` without threading a prebuilt context.
3. No active ticket currently scopes this specific `advanceToDecisionPoint` coup-loop context-threading refactor.

## Architecture Check

1. Building once per `advanceToDecisionPoint` operation and threading through coup-loop helpers is cleaner than per-iteration implicit creation.
2. This is game-agnostic lifecycle hardening in kernel flow control, not game-specific logic.
3. No backwards-compat aliases/shims: operation context ownership is explicit.

## What to Change

### 1. Thread one seat-resolution context through coup-loop progression

1. Create one operation-scoped seat-resolution context at `advanceToDecisionPoint(...)` entry.
2. Pass that context through `coupPhaseImplicitPass(...)` and any helper calls that resolve active/next seats.
3. Remove per-iteration fallback creation inside the coup-loop path.

### 2. Maintain deterministic progression semantics

1. Preserve existing coup implicit-pass behavior and stall-loop guard behavior.
2. Preserve existing runtime error code/message contracts.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify only if helper signatures require tightening)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)

## Out of Scope

- Broad legal-moves filter context threading (`SEATRES-033`)
- Active-seat surface typing tickets (`SEATRES-030`, `SEATRES-031`, `SEATRES-032`)
- Compiler/validator seat-catalog work

## Acceptance Criteria

### Tests That Must Pass

1. `advanceToDecisionPoint` coup-loop uses explicit operation-scoped seat-resolution context across iterations.
2. Coup implicit-pass and decision-point progression behavior remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle ownership is explicit for coup-loop operation boundaries.
2. Kernel/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — add/strengthen coup-loop regression coverage to lock progression parity with explicit context threading.
2. `packages/engine/test/unit/phase-advance.test.ts` — add lifecycle-focused regression case (operation-scope context reuse expectation, without changing gameplay semantics).

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
