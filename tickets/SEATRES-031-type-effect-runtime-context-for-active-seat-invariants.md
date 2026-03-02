# SEATRES-031: Type effect runtime context for active-seat invariants

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect error context contract typing for turn-flow runtime validation invariants
**Deps**: archive/tickets/SEATRES-017-unify-seat-contract-runtime-errors-across-kernel-and-effects.md

## Problem

Effect-side active-seat invariant metadata is currently validated only by runtime tests. `effectRuntimeError(...)` accepts generic context records, so invariant payload schema can regress without compile-time failures.

## Assumption Reassessment (2026-03-02)

1. `effectRuntimeError` currently accepts `context?: Readonly<Record<string, unknown>>`.
2. `applyGrantFreeOperation` now emits active-seat invariant fields, but those keys are not encoded in effect context type contracts.
3. Existing active tickets do not add typed reason-specific context contracts for effect runtime invariants.

## Architecture Check

1. Reason-specific typed effect contexts are cleaner and more extensible than free-form records because invariants become first-class contracts.
2. This change remains game-agnostic and concerns runtime error-schema quality only.
3. No backwards-compat aliasing: callsites adopt typed context builders/contracts directly.

## What to Change

### 1. Introduce reason-specific effect runtime context typing

1. Add typed context mapping for `EFFECT_RUNTIME` reasons (starting with `turnFlowRuntimeValidationFailed` active-seat invariant payload).
2. Provide helper(s) that construct typed context payloads for active-seat invariant effect throws.

### 2. Migrate active-seat invariant effect emitters to typed payload contract

1. Update `applyGrantFreeOperation` unresolved-active-seat throw path to use typed context shape.
2. Keep existing effect code/reason taxonomy while enforcing payload contract at compile time.

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify only if shared typed payload helpers are extracted)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add if shared type assertions are centralized)

## Out of Scope

- Converting every existing `turnFlowRuntimeValidationFailed` payload in one pass
- Kernel `RUNTIME_CONTRACT_INVALID` redesign beyond active-seat invariant contract
- Seat-resolution lifecycle/performance work

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat invariant effect payload schema is enforced by TypeScript contracts, not only runtime assertions.
2. Existing effect error behavior (code/reason/message) remains stable while payload typing becomes strict.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect runtime active-seat invariant metadata is strongly typed and deterministic.
2. Runtime logic remains game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert effect payload still includes canonical invariant fields under typed contract.
2. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add type-contract guard coverage if effect context typings are exported/shared.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
