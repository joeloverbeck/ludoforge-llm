# ENGINEARCH-118: Add Canonical Runtime Validator Map for `ILLEGAL_MOVE` Reason Context

**Status**: COMPLETED (2026-02-28)
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime error helper runtime validation path
**Deps**: archive/tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md, archive/tickets/ENGINEARCH-117-illegal-move-empty-context-closure.md

## Problem

`illegalMoveError` still constructs context via a broad cast and only runtime-validates one reason (`FREE_OPERATION_NOT_GRANTED`). Untyped/JS call paths can still emit malformed reason payloads without consistent runtime enforcement.

## Assumption Reassessment (2026-02-28)

1. Current helper has compile-time overload protection for TS callers, but runtime validation is ad hoc and incomplete across reasons.
2. As of `ENGINEARCH-117`, compile-time contracts are stricter (required-context and no-context reason enforcement), but this does not protect untyped/JS runtime call paths.
3. Final context assembly still relies on a broad cast to `IllegalMoveContext`, which can hide malformed payload in untyped call paths.
4. Runtime validation currently hardcodes only `FREE_OPERATION_NOT_GRANTED` via an inline branch; other required-context reasons are unchecked at runtime.
5. Corrected scope is to centralize runtime reason validation in one canonical map/dispatcher and remove ad hoc checks.

## Architecture Check

1. A centralized validator map is cleaner and more extensible than scattered special-case checks.
2. This remains game-agnostic kernel contract hardening; no game-specific logic, GameSpecDoc behavior, or visual-config coupling is introduced.
3. No backwards-compatibility aliases/shims; malformed context should fail fast with deterministic errors.
4. Centralized reason validators are more robust than the current architecture because they co-locate contract checks, reduce drift risk as reasons evolve, and eliminate hidden branch-by-branch behavior.

## What to Change

### 1. Define canonical reason-validator map

Add a single map/function keyed by `IllegalMoveReason` that validates reason-specific context requirements (required fields at minimum; optionally closed-key enforcement when practical without duplicating type-level contracts).

### 2. Route `illegalMoveError` through canonical validation

Replace the one-off `FREE_OPERATION_NOT_GRANTED` check with validator-map dispatch before constructing `IllegalMoveError`.

### 3. Keep runtime error diagnostics deterministic

Standardize thrown error type/message format for validator failures so test assertions and debugging remain stable.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)

## Out of Scope

- Changes to legality outcomes or move validation semantics.
- New illegal-move reasons.
- Any game-specific branching.

## Acceptance Criteria

### Tests That Must Pass

1. Malformed runtime contexts for required reasons throw deterministically even from untyped invocation paths.
2. Valid contexts continue to emit unchanged `ILLEGAL_MOVE` context payloads.
3. Existing `FREE_OPERATION_NOT_GRANTED` required-field runtime enforcement remains covered through the canonical validator path (no one-off branch).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime and compile-time illegal-move context contracts are aligned by one canonical reason contract source.
2. Error-contract layer remains game-agnostic and reusable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add runtime assertions for validator failures on malformed context payloads and pass assertions for valid payloads.
2. Prefer one runtime assertion per representative reason category (required-context, optional-context, no-context) to reduce future contract drift.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- Implemented the canonical `IllegalMoveReason -> runtime validator` map in `runtime-error.ts` and routed `illegalMoveError` through it, replacing the prior single ad hoc `FREE_OPERATION_NOT_GRANTED` branch.
- Further hardened architecture by collapsing duplicated per-reason validator entries into one typed required-field contract source for required-context reasons, with runtime validation derived from that source.
- Preserved deterministic runtime diagnostics with stable per-reason missing-field messages (same message shape now shared by all required-context reasons).
- Added runtime tests in `runtime-error-contracts.test.ts` for untyped invocation paths:
  - missing `freeOperationDenial` for `FREE_OPERATION_NOT_GRANTED` throws deterministically.
  - missing `profileId` for `SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED` throws deterministically.
- Scope remained aligned with plan (kernel contract hardening only; no move legality semantics changes, no game-specific branching).
- Verification completed successfully:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
