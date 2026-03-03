# SEATRES-067: Narrow scoped-var runtime error code domain union

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — scoped-var runtime contract typing and guard coverage
**Deps**: archive/tickets/SEATRES/SEATRES-054-complete-effect-runtime-reason-context-contracts-and-guarded-consumption.md

## Problem

`scoped-var-runtime-access.ts` currently allows any `EffectRuntimeReason` as `ScopedVarRuntimeErrorCode`. This is broader than scoped-var semantics and permits cross-domain reason leakage (choice/turn-flow/etc.) into scoped-var paths.

## Assumption Reassessment (2026-03-03)

1. `ScopedVarRuntimeErrorCode` is currently aliased to `EffectRuntimeReason`.
2. Current production call sites (`effects-var.ts`, `effects-resource.ts`) already pass only `variableRuntimeValidationFailed` or `resourceRuntimeValidationFailed`; no current call site passes choice/turn-flow/control-flow reasons.
3. `scoped-var-runtime-access.ts` itself emits `internalInvariantViolation` for constructor/write invariant guards, which is intentionally outside call-site supplied `code`.
4. No active ticket currently narrows the `ScopedVarRuntimeErrorCode` type domain at compile time.

## Architecture Check

1. The issue is primarily type-surface hardening, not current runtime misbehavior.
2. A narrowed reason union still improves architecture by enforcing domain boundaries where helpers are consumed and preventing future drift.
3. This remains game-agnostic engine contract work (no game identifiers, no spec/schema coupling).
4. No compatibility aliases/shims: callers using out-of-domain reasons should fail compilation and be corrected.

## What to Change

### 1. Define explicit scoped-var reason subset

1. Replace `type ScopedVarRuntimeErrorCode = EffectRuntimeReason` with a constrained union of allowed effect-runtime reasons.
2. Ensure allowed reasons cover existing valid scoped-var callers only.

### 2. Enforce callers comply with scoped-var reason domain

1. Narrow helper option types (`code`) and helper function parameters to the explicit subset.
2. Keep existing callers compiling without behavioral changes.
3. Keep error construction centralized through `effectRuntimeError(...)` and canonical constants.

### 3. Add a type-level contract guard

1. Add compile-time assertions ensuring scoped-var union stays a subset of `EffectRuntimeReason` and does not drift.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (no change expected; modify only if union-matrix coupling is introduced)

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

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add/strengthen compile-time assertions that:
   - scoped-var code union is a subset of `EffectRuntimeReason`.
   - out-of-domain reasons (for example `choiceRuntimeValidationFailed`) are rejected at helper call sites.
   - in-domain reasons (`variableRuntimeValidationFailed`, `resourceRuntimeValidationFailed`) remain accepted.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Narrowed `ScopedVarRuntimeErrorCode` in `scoped-var-runtime-access.ts` from full `EffectRuntimeReason` to:
    - `variableRuntimeValidationFailed`
    - `resourceRuntimeValidationFailed`
  - Added compile-time scoped-var reason domain assertions in `scoped-var-runtime-access.test.ts` to enforce:
    - subset relationship to `EffectRuntimeReason`
    - acceptance of variable/resource reasons
    - rejection of out-of-domain reasons (e.g. `choiceRuntimeValidationFailed`)
- **Deviations from Original Plan**:
  - `effect-error-contracts.test.ts` was not modified because no cross-contract matrix coupling was required after implementation.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` ✅
