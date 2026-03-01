# SEATRES-009: Reject object-form numeric player selectors when canonical seat IDs are declared

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL selector normalization and related unit coverage
**Deps**: archive/tickets/SEATRES-005-strict-single-seat-namespace-and-spec-migration.md

## Problem

String-form numeric selectors are now rejected under canonical seat IDs, but object-form selectors (`{ id: 0 }`) are still accepted. That preserves an index alias path and violates strict single-seat-namespace policy.

## Assumption Reassessment (2026-03-01)

1. `normalizePlayerSelector()` currently accepts object-form `{ id: number }` without checking `seatIds` context.
2. `normalizePlayerSelectorFromString()` already rejects numeric string selectors when canonical `seatIds` are declared.
3. Current tests cover numeric string rejection but do not enforce equivalent rejection for object-form numeric selectors.
4. This gap is not covered by active tickets `SEATRES-006`, `SEATRES-007`, or `SEATRES-008`.

## Architecture Check

1. Canonical selector policy must be shape-independent; allowing `{ id: n }` while rejecting `"n"` is inconsistent and brittle.
2. Strict rejection keeps selector semantics game-agnostic and prevents hidden aliasing between player indexes and seat IDs.
3. No backward-compatibility shim is introduced; index alias forms are disallowed.

## What to Change

### 1. Enforce canonical policy in object-form selectors

1. Update `normalizePlayerSelector()` to reject object-form numeric selectors when `seatIds` are present.
2. Emit deterministic `CNL_COMPILER_PLAYER_SELECTOR_INVALID` diagnostics with actionable canonical-seat suggestions.

### 2. Add parity tests for selector-form equivalence

1. Add tests that verify both `"0"` and `{ id: 0 }` are rejected under canonical seat IDs.
2. Confirm `{ id: 0 }` remains valid only when no canonical seat contract is declared.

## Files to Touch

- `packages/engine/src/cnl/compile-selectors.ts` (modify)
- `packages/engine/test/unit/compile-selectors.test.ts` (modify)
- `packages/engine/test/unit/compile-actions.test.ts` (modify, if selector parsing appears through action compile surfaces)

## Out of Scope

- Runtime seat resolution behavior
- SeatCatalog schema introduction
- Diagnostic-noise gating for incoherent seat contracts

## Acceptance Criteria

### Tests That Must Pass

1. Under canonical seat IDs, object-form numeric selectors fail with deterministic diagnostics.
2. Under no-seat-contract mode, object-form numeric selectors retain current valid behavior.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Selector acceptance/rejection is consistent across equivalent selector shapes.
2. No numeric index alias path exists when canonical seat IDs are declared.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-selectors.test.ts` — object-form numeric rejection in canonical-seat context.
Rationale: closes the remaining alias entry point in selector normalization.
2. `packages/engine/test/unit/compile-actions.test.ts` — compile-path parity assertion for action selectors using object-form numeric IDs.
Rationale: verifies policy at action-compile boundary, not only isolated selector helper level.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-selectors.test.js`
3. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
