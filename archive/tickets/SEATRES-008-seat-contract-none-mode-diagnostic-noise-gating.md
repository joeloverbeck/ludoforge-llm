# SEATRES-008: Gate cascading seat xref diagnostics when seat contract mode is none

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cross-validation diagnostic policy (`cross-validate.ts`, tests)
**Deps**: archive/tickets/SEATRES-004-unified-seat-identity-contract-module.md

## Problem

When card-driven compilation lacks a selected `seatCatalog`, compiler already emits root-cause diagnostic `CNL_COMPILER_SEAT_CATALOG_REQUIRED`. Cross-validation still emits many downstream seat-missing xref diagnostics derived from an empty seat target set.

This creates noisy error surfaces, obscures root cause, and makes diagnostics less actionable.

## Assumption Reassessment (2026-03-01)

1. `SeatIdentityContract` currently has only `mode: 'none' | 'seat-catalog'`; there is no `incoherent` mode in `packages/engine/src/cnl/seat-identity-contract.ts`.
2. `crossValidateSpec()` currently runs seat-reference checks even when `seatIdentityContract.mode === 'none'`.
3. In that mode, seat-dependent checks emit cascades of seat xref diagnostics (`CNL_XREF_*_SEAT_MISSING`) alongside root-cause `CNL_COMPILER_SEAT_CATALOG_REQUIRED`.
4. Existing active seat tickets focus on broader seat architecture and do not define this immediate diagnostic-noise gating policy.

## Architecture Check

1. Root-cause-first diagnostics are cleaner and more maintainable than cascading derivative errors.
2. Gating only seat-dependent xref checks preserves broad compiler validation while avoiding misleading multi-error bursts.
3. This remains game-agnostic compiler policy based on contract mode; no game-specific behavior is introduced.
4. No compatibility shims are added.

## What to Change

### 1. Add none-mode gating for seat-dependent cross-validation checks

1. Use `SeatIdentityContract.mode` in `crossValidateSpec()`.
2. Skip emitting seat-reference missing diagnostics when mode is `none`.
3. Preserve non-seat cross-validation checks (actions, phases, zones, windows, vars, etc.).

### 2. Add deterministic tests for gated behavior

1. Add tests showing compile path keeps root-cause `CNL_COMPILER_SEAT_CATALOG_REQUIRED` without seat-xref cascades when seat contract mode is `none`.
2. Confirm seat xref cascades are absent in mode `none`.
3. Confirm non-seat xref checks still execute in the same scenario.

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add, if needed for compile-path assertions)

## Out of Scope

- Re-introducing incoherent/index seat modes in seat identity contract
- Introducing SeatCatalog as sole seat source beyond current enforced card-driven requirement
- Visual presentation config behavior

## Acceptance Criteria

### Tests That Must Pass

1. `SeatIdentityContract` mode `none` does not emit cascading seat xref missing diagnostics.
2. Root-cause seat-catalog-required diagnostic remains deterministic.
3. Non-seat xref validations still run in mode `none`.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Diagnostic surfaces prioritize root cause over derivative noise.
2. Compiler remains game-agnostic with explicit contract-driven validation policy.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — assert seat-xref diagnostics are gated in mode `none` while non-seat xrefs still fire.
Rationale: validates targeted diagnostic policy change without suppressing unrelated checks.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert root-cause seat-catalog-required diagnostic remains present and seat-xref cascades are absent.
Rationale: preserves contract boundary guarantee at compile level and prevents diagnostic noise regression.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Updated `cross-validate.ts` so seat-dependent xref diagnostics are contract-mode gated and emit only when `SeatIdentityContract.mode === 'seat-catalog'`.
  - Preserved non-seat cross-validation behavior in `none` mode (for example variable/window/action/zone checks still execute).
  - Updated and added tests in:
    - `packages/engine/test/unit/cross-validate.test.ts`
    - `packages/engine/test/unit/compiler-structured-results.test.ts`
- **Deviations From Original Plan**:
  - Original ticket premise referenced a non-existent `incoherent` seat-contract mode. Scope was corrected to current architecture (`none` vs `seat-catalog`) before implementation.
  - Gating policy now explicitly keys off `none` mode plus card-driven context rather than an incoherence diagnostic.
- **Verification Results**:
  - `pnpm turbo build` passed
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js` passed
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed
  - `pnpm turbo test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
