# SEATRES-052: Enforce required effect-runtime context args by reason

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect error API typing and effect-runtime call contracts
**Deps**: archive/tickets/SEATRES/SEATRES-031-type-effect-runtime-context-for-active-seat-invariants.md

## Problem

`effectRuntimeError(reason, message, context?)` still allows missing context even when a reason requires mandatory fields (for example `turnFlowRuntimeValidationFailed` requires `effectType`). This permits invalid runtime error payloads that violate reason contracts.

## Assumption Reassessment (2026-03-03)

1. `EffectErrorContext<'EFFECT_RUNTIME'>` is now modeled as a reason-discriminated union in `packages/engine/src/kernel/effect-error.ts`.
2. `effectRuntimeError` still accepts optional `context` for every `EffectRuntimeReason`, so mandatory context cannot be enforced by the function signature.
3. Only `turnFlowRuntimeValidationFailed` currently has required keys (`effectType`) in `EffectRuntimeContextByReason`; other reasons still use generic records.
4. Current tests validate typed contexts for selected paths, but do not include a compile-time reason-matrix (required/optional/no-context) for `effectRuntimeError`.
5. Unlike `illegalMoveError`, `effectRuntimeError` currently has no runtime required-field validation for required-context reasons.

## Architecture Check

1. Conditional arg typing by reason is cleaner than permissive optional context because contracts are enforced at the construction boundary.
2. This remains game-agnostic: it hardens engine error contracts without introducing game-specific behavior.
3. Runtime guard parity with `illegalMoveError` makes the contract resilient even when a caller bypasses TypeScript (for example via `unknown`/`any` or JS interop).
4. No backwards-compatibility aliasing: invalid invocation shapes should fail typecheck or throw immediately and be migrated directly.

## What to Change

### 1. Add reason-aware context arg contract to `effectRuntimeError`

1. Introduce required/optional/no-context reason group typing (similar to `illegalMoveError` contract style).
2. Make context mandatory only when a reason context has required keys.
3. Keep emitted runtime payload shape unchanged (`reason` + context fields).

### 2. Add runtime guard for required-context reasons

1. Add a required-field map for reasons that require context keys.
2. Throw `TypeError` when required fields are missing at runtime.
3. Keep the guard local to `effect-error.ts` and game-agnostic.

### 3. Add compile-time and runtime contract tests

1. Add type assertions that missing required context for required reasons fails compilation paths.
2. Add positive assertions for optional/no-required-context reasons.
3. Add runtime assertions proving required-context reasons throw on missing required fields when invoked through untyped call paths.

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)

## Out of Scope

- Defining all per-reason payload schemas for every `EffectRuntimeReason`
- Changing top-level error taxonomy (`EFFECT_RUNTIME` vs kernel runtime codes)

## Acceptance Criteria

### Tests That Must Pass

1. `effectRuntimeError` rejects missing context at compile-time for reasons with required fields.
2. `effectRuntimeError` throws at runtime when required-context reasons are missing required fields.
3. Existing runtime behavior (message and serialized context) remains stable.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Required reason payload fields are enforced at the effect error construction boundary.
2. Enforcement applies at both compile-time and runtime, consistent with other core runtime error constructors.
3. Runtime error contract enforcement remains engine-wide and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — add reason-group contract assertions for required vs optional/no-context args and runtime guard assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Implemented reason-aware argument contracts for `effectRuntimeError` using explicit required/optional/no-context reason groups (currently `turnFlowRuntimeValidationFailed` is required-context; no no-context reasons).
2. Added runtime required-field validation parity with `illegalMoveError`; missing `effectType` for `turnFlowRuntimeValidationFailed` now throws `TypeError`.
3. Expanded `effect-error-contracts` coverage with a compile-time reason matrix and runtime guard assertions, including exhaustive reason-listing checks against `EFFECT_RUNTIME_REASONS`.
4. Removed unsafe constructor casts from `effectRuntimeError` by using reason-branch construction with an explicit turn-flow context type guard.
5. Verified all planned commands pass after implementation (`build`, focused effect-error unit test, full engine suite, workspace typecheck/lint).
