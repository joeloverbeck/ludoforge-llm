# TOKFILAST-015: Align Non-Empty Invariant Failures with Kernel Error Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering + kernel utility invariant/error handling
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md, tickets/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md

## Problem

Current non-empty tuple enforcement introduced `toNonEmpty` helpers that throw generic `Error` in compile/lowering and hidden-info token-filter canonicalization paths. This weakens deterministic failure contracts and leaks ad-hoc error semantics into core boundaries.

## Assumption Reassessment (2026-03-06)

1. `compile-conditions.ts` uses `toNonEmpty` and throws plain `Error` when arrays are unexpectedly empty.
2. `hidden-info-grants.ts` also uses `toNonEmpty` and throws plain `Error` from shared kernel canonicalization flow.
3. Mismatch: we want fail-closed behavior with deterministic, layered contracts instead of ad-hoc generic errors.

## Architecture Check

1. A shared invariant helper or dedicated error contract is cleaner than duplicated inline `Error` throws and makes failure behavior explicit.
2. This remains game-agnostic contract hardening in compiler/kernel infrastructure; no game-specific behavior is added.
3. No backwards-compatibility shims/aliases are introduced; malformed data still fails closed.

## What to Change

### 1. Introduce a shared non-empty invariant contract

Add a small kernel-level helper (or sibling contract module) that provides typed non-empty coercion and deterministic invariant failure behavior.

### 2. Replace ad-hoc `Error` throws at current call sites

Adopt the helper in `compile-conditions.ts` and `hidden-info-grants.ts` so all non-empty invariant violations share one deterministic contract.

### 3. Verify boundary mapping behavior

Where invariant failure can surface across API boundaries, map to existing boundary-specific diagnostics/error contracts (compiler diagnostics, eval-layer error codes) instead of leaking generic errors.

## Files to Touch

- `packages/engine/src/kernel/<shared-invariant-module>.ts` (new or modify existing utility module)
- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/kernel/hidden-info-grants.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/hidden-info-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/<new-invariant-helper>.test.ts` (new, if helper is introduced)

## Out of Scope

- Broad eval error-system redesign outside affected invariant paths.
- Token-filter traversal fail-closed dispatch work tracked in `TOKFILAST-013`.

## Acceptance Criteria

### Tests That Must Pass

1. No affected path throws plain generic `Error` for non-empty invariant violations.
2. Non-empty invariant violations surface deterministic boundary-appropriate failures.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Non-empty boolean arity remains enforced at type/schema/validator/runtime/lowering boundaries.
2. Shared kernel/compiler infrastructure remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — assert deterministic diagnostics/failures for empty boolean args on lowering paths.
2. `packages/engine/test/unit/hidden-info-grants.test.ts` — assert canonicalization path fail-closed behavior is deterministic and non-generic.
3. `packages/engine/test/unit/kernel/<new-invariant-helper>.test.ts` — lock shared helper contract if introduced.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
