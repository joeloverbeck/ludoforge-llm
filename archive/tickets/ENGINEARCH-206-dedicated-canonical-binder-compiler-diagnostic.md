# ENGINEARCH-206: Introduce Dedicated Compiler Diagnostic for Canonical Binder Declarations

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler diagnostics contract and tests
**Deps**: packages/engine/src/cnl/compiler-diagnostic-codes.ts, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/cnl/compile-conditions.ts, packages/engine/test/unit/compile-effects.test.ts, packages/engine/test/unit/compile-conditions.test.ts

## Problem

Canonical binder declaration failures in compiler lowering currently use generic `CNL_COMPILER_MISSING_CAPABILITY`. This weakens diagnostic precision and makes policy-oriented filtering/reporting harder.

## Assumption Reassessment (2026-03-04)

1. Compiler now checks canonical declared binder surfaces early in effect lowering.
2. Aggregate bind checks in condition lowering also enforce canonical `$name`.
3. Confirmed mismatch: both surfaces reported generic missing-capability code instead of a dedicated canonical-binding contract code.
4. Scope remains correct and unchanged: add one dedicated canonical binder declaration code and adopt it at the two enforcement points.

## Architecture Check

1. Dedicated diagnostic taxonomy is cleaner and more extensible than overloading capability errors for contract violations.
2. This remains engine-agnostic contract enforcement (no game-specific code paths).
3. No backward-compatibility aliases are introduced; existing invalid specs remain hard failures with more precise error classification.

## What to Change

### 1. Add dedicated diagnostic code

Add a canonical-binder-declaration compiler diagnostic code in `compiler-diagnostic-codes.ts`.

### 2. Use dedicated code in compiler enforcement points

Switch canonical binder declaration failures in `compile-effects` and aggregate bind canonical checks in `compile-conditions` to the new code.

### 3. Update tests

Adjust unit tests to assert the dedicated code and preserve current path/message behavior.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Changing canonical binder rules.
- Behavior validator diagnostic code changes.
- Runtime simulation behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler emits a dedicated canonical-binder diagnostic code for binder declaration contract violations.
2. Existing canonical binder path coverage remains deterministic.
3. Existing suite: `pnpm turbo test`.

### Invariants

1. Contract violations and capability gaps are represented by distinct compiler diagnostic codes.
2. Diagnostic precision increases without softening strict canonical enforcement.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — assert dedicated canonical binder code for declaration surfaces.
2. `packages/engine/test/unit/compile-conditions.test.ts` — assert dedicated code for non-canonical aggregate bind declarations.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-04
- **What Changed**:
  - Added `CNL_COMPILER_BINDING_DECLARATION_NON_CANONICAL` to compiler diagnostic codes.
  - Updated canonical binder declaration enforcement in `compile-effects` and aggregate bind canonical enforcement in `compile-conditions` to emit the new dedicated code.
  - Updated unit coverage in `compile-effects.test.ts` and `compile-conditions.test.ts` to assert the dedicated code while preserving path/message expectations.
- **Deviations from Original Plan**:
  - None; implementation matched planned scope.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
