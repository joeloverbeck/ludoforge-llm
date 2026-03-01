# SEATRES-008: Gate cascading seat xref diagnostics when seat contract is incoherent

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cross-validation diagnostic policy (`cross-validate.ts`, tests)
**Deps**: archive/tickets/SEATRES-004-unified-seat-identity-contract-module.md

## Problem

When seat identity contract is structurally incoherent, compiler already emits root-cause diagnostic `CNL_COMPILER_SEAT_IDENTITY_CONTRACT_INCOHERENT`. Cross-validation still emits many downstream seat-missing xref diagnostics derived from invalid seat targets.

This creates noisy error surfaces, obscures root cause, and makes diagnostics less actionable.

## Assumption Reassessment (2026-03-01)

1. `buildSeatIdentityContract()` emits explicit incoherence error for index seat count mismatch.
2. `crossValidateSpec()` currently continues seat-reference checks regardless of contract mode.
3. In incoherent cases, this can produce a cascade of seat xref errors (for example victory/event seat reference missing diagnostics) in addition to the root cause.
4. Active tickets `SEATRES-005`/`SEATRES-006` address larger seat-identity refactors, but do not explicitly define near-term diagnostic-noise policy for incoherent mode.

## Architecture Check

1. Root-cause-first diagnostics are cleaner and more maintainable than cascading derivative errors.
2. Gating only seat-dependent xref checks preserves broad compiler validation while avoiding misleading multi-error bursts.
3. This remains game-agnostic policy in compiler diagnostics; no game-specific behavior is introduced.
4. No compatibility shims are added.

## What to Change

### 1. Add incoherent-mode gating for seat-dependent cross-validation checks

1. Thread `SeatIdentityContract.mode` into seat-dependent validation branches.
2. Skip emitting seat-reference missing diagnostics when mode is `incoherent`.
3. Preserve non-seat cross-validation checks (actions, phases, zones, windows, vars, etc.).

### 2. Add deterministic tests for gated behavior

1. Add tests that construct incoherent contract mode and verify only root-cause contract error is emitted from compile path for seat incoherence.
2. Confirm seat xref cascades are absent in incoherent mode.
3. Confirm non-seat xref checks still execute in the same scenario.

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add, if needed for compile-path assertions)

## Out of Scope

- Removing index seat mode entirely (`SEATRES-005`)
- Introducing SeatCatalog as sole seat source (`SEATRES-006`)
- Visual presentation config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Incoherent seat contract mode does not emit cascading seat xref missing diagnostics.
2. Root-cause seat-contract incoherence diagnostic remains deterministic.
3. Non-seat xref validations still run in incoherent mode.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Diagnostic surfaces prioritize root cause over derivative noise.
2. Compiler remains game-agnostic with explicit contract-driven validation policy.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — assert seat-xref diagnostics are gated in incoherent mode while non-seat xrefs still fire.
Rationale: validates targeted diagnostic policy change without suppressing unrelated checks.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert root-cause incoherence diagnostic remains present and deterministic.
Rationale: preserves contract boundary guarantee at compile level.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
