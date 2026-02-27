# ENGINEARCH-118: Add Canonical Runtime Validator Map for `ILLEGAL_MOVE` Reason Context

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime error helper runtime validation path
**Deps**: archive/tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md, tickets/ENGINEARCH-117-illegal-move-empty-context-closure.md

## Problem

`illegalMoveError` still constructs context via a broad cast and only runtime-validates one reason (`FREE_OPERATION_NOT_GRANTED`). Untyped/JS call paths can still emit malformed reason payloads without consistent runtime enforcement.

## Assumption Reassessment (2026-02-27)

1. Current helper has compile-time overload protection for TS callers, but runtime validation is ad hoc and incomplete across reasons.
2. Final context assembly still relies on a broad cast to `IllegalMoveContext`, which can hide malformed payload in untyped call paths.
3. Mismatch: contract safety currently depends on caller typing. Corrected scope is to add one canonical per-reason runtime validator path and remove ad hoc checks.

## Architecture Check

1. A centralized validator map is cleaner and more extensible than scattered special-case checks.
2. This remains game-agnostic kernel contract hardening; no game-specific logic, GameSpecDoc behavior, or visual-config coupling is introduced.
3. No backwards-compatibility aliases/shims; malformed context should fail fast with deterministic errors.

## What to Change

### 1. Define canonical reason-validator map

Add a single map/function keyed by `IllegalMoveReason` that validates reason-specific context requirements (required fields and disallowed/unknown fields where applicable).

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
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime and compile-time illegal-move context contracts are aligned by one canonical reason contract source.
2. Error-contract layer remains game-agnostic and reusable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add runtime assertions for validator failures on malformed context payloads and pass assertions for valid payloads.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`