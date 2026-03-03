# SEATRES-067: Narrow scoped-var runtime error code domain union

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — scoped-var runtime contract typing and guard coverage
**Deps**: archive/tickets/SEATRES/SEATRES-054-complete-effect-runtime-reason-context-contracts-and-guarded-consumption.md

## Problem

`scoped-var-runtime-access.ts` currently allows any `EffectRuntimeReason` as `ScopedVarRuntimeErrorCode`. This is broader than scoped-var semantics and permits cross-domain reason leakage (choice/turn-flow/etc.) into scoped-var paths.

## Assumption Reassessment (2026-03-03)

1. `ScopedVarRuntimeErrorCode` is currently aliased to `EffectRuntimeReason`.
2. Scoped-var helpers are only meant to surface scoped-var/resource/internal-invariant style reasons tied to variable endpoint resolution and value state invariants.
3. No active ticket currently narrows this union to enforce domain boundaries at compile time.

## Architecture Check

1. A narrowed reason union provides cleaner domain boundaries and stronger compile-time guarantees than an open-ended full reason set.
2. This tightens agnostic runtime contracts; it does not encode any game-specific behavior or identifiers.
3. No compatibility aliases/shims: callers using out-of-domain reasons should fail compilation and be corrected.

## What to Change

### 1. Define explicit scoped-var reason subset

1. Replace `type ScopedVarRuntimeErrorCode = EffectRuntimeReason` with a constrained union of allowed effect-runtime reasons.
2. Ensure allowed reasons cover existing valid scoped-var callers only.

### 2. Enforce callers comply with scoped-var reason domain

1. Update call sites and helper option types to compile under the narrowed union.
2. Keep error construction centralized through `effectRuntimeError(...)` and canonical constants.

### 3. Add a type-level contract guard

1. Add compile-time assertions ensuring scoped-var union stays a subset of `EffectRuntimeReason` and does not drift.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify only if cross-contract matrix assertions are needed)

## Out of Scope

- Behavioral changes to variable resolution semantics
- Changes to GameSpecDoc/GameDef schema
- Error taxonomy redesign outside scoped-var domain

## Acceptance Criteria

### Tests That Must Pass

1. Scoped-var helper code rejects out-of-domain effect runtime reasons at compile time.
2. Existing scoped-var runtime behavior remains unchanged for valid reason paths.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-var helpers can emit only scoped-var domain runtime reasons.
2. Domain boundaries remain engine-level and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add/strengthen compile-time/source guards for narrowed scoped-var reason unions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
