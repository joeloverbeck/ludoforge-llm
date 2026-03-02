# SEATRES-052: Enforce required effect-runtime context args by reason

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect error API typing and effect-runtime call contracts
**Deps**: archive/tickets/SEATRES/SEATRES-031-type-effect-runtime-context-for-active-seat-invariants.md

## Problem

`effectRuntimeError(reason, message, context?)` still allows missing context even when a reason requires mandatory fields (for example `turnFlowRuntimeValidationFailed` requires `effectType`). This permits invalid runtime error payloads that violate reason contracts.

## Assumption Reassessment (2026-03-02)

1. `EffectErrorContext<'EFFECT_RUNTIME'>` is now modeled as a reason-discriminated union in `packages/engine/src/kernel/effect-error.ts`.
2. `effectRuntimeError` still accepts optional `context` for every `EffectRuntimeReason`, so mandatory context cannot be enforced by the function signature.
3. Current tests validate typed contexts for selected paths, but do not guarantee compile-time rejection of missing required context for reason-specific required fields.

## Architecture Check

1. Conditional arg typing by reason is cleaner than permissive optional context because contracts are enforced at the construction boundary.
2. This remains game-agnostic: it hardens engine error contracts without introducing game-specific behavior.
3. No backwards-compatibility aliasing: invalid untyped invocation shapes should fail typecheck and be migrated directly.

## What to Change

### 1. Add reason-aware context arg contract to `effectRuntimeError`

1. Introduce required/optional/no-context reason group typing (similar to `illegalMoveError` contract style).
2. Make context mandatory only when a reason context has required keys.
3. Keep emitted runtime payload shape unchanged (`reason` + context fields).

### 2. Add compile-time contract tests

1. Add type assertions that missing required context for required reasons fails compilation paths.
2. Add positive assertions for optional/no-required-context reasons.

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)

## Out of Scope

- Defining all per-reason payload schemas for every `EffectRuntimeReason`
- Changing top-level error taxonomy (`EFFECT_RUNTIME` vs kernel runtime codes)

## Acceptance Criteria

### Tests That Must Pass

1. `effectRuntimeError` rejects missing context at compile-time for reasons with required fields.
2. Existing runtime behavior (message and serialized context) remains stable.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Required reason payload fields are enforced at the effect error construction boundary.
2. Runtime error contract enforcement remains engine-wide and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — add reason-group contract assertions for required vs optional context args.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
