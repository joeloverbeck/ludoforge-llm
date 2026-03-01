# SEATRES-017: Unify seat-contract runtime errors across kernel and effects

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — runtime invariant diagnostics/error-shape consistency across kernel and effect surfaces
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Seat-contract invariant failures currently surface through mixed error construction paths (`kernelRuntimeError` vs `effectRuntimeError`) with non-uniform codes/payload shapes, which weakens observability and consistent handling across runtime surfaces.

## Assumption Reassessment (2026-03-01)

1. Kernel turn-flow seat invariant failures emit `RUNTIME_CONTRACT_INVALID`.
2. `applyGrantFreeOperation()` seat failures emit `EFFECT_RUNTIME` with `turnFlowRuntimeValidationFailed` payload.
3. Existing tests typically assert throw behavior but do not enforce cross-surface diagnostic parity.
4. This diagnostic consistency work is not included in active tickets `SEATRES-011` through `SEATRES-014`.

## Architecture Check

1. A unified invariant error contract is cleaner and more extensible for tooling/logging than mixed per-surface shapes.
2. This is game-agnostic and focused on runtime contract semantics, not game-specific behavior.
3. No backwards-compat alias layer is retained; callers should consume one canonical invariant error pattern.

## What to Change

### 1. Define one canonical seat-contract invariant error policy

1. Establish canonical error code/category and required metadata fields for seat-resolution invariant failures.
2. Apply policy consistently in kernel and effect turn-flow seat-resolution paths.

### 2. Centralize error emission helpers for seat invariants

1. Add/extend shared helper(s) to avoid duplicated message formatting and diverging payload schema.
2. Replace ad-hoc seat-invariant throws in affected files with shared helper usage.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify/add helper)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify where seat invariant errors are emitted)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify where seat invariant errors are emitted)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify/add)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/unit/legal-moves.test.ts` (modify/add)

## Out of Scope

- Seat identity semantics changes
- SeatCatalog compiler diagnostics
- Turn-flow performance optimization

## Acceptance Criteria

### Tests That Must Pass

1. Equivalent seat invariant failures produce consistent canonical error contract across kernel and effect surfaces.
2. Error payload includes deterministic seat-context fields needed for debugging.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-contract invariant diagnostics are consistent regardless of call surface.
2. Runtime remains strictly canonical-seat, game-agnostic, and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert canonical seat-invariant error contract from effect surface.
2. `packages/engine/test/unit/phase-advance.test.ts` — assert same invariant contract in coup progression/entry surfaces.
3. `packages/engine/test/unit/legal-moves.test.ts` — assert same invariant contract in legal-move surface.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
4. `node --test packages/engine/dist/test/unit/legal-moves.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
