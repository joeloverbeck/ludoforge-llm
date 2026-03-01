# SEATRES-007: Seat identity contract coverage and compile-path parity

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler test architecture (`seat-identity-contract.ts` tests, `cross-validate.test.ts` contract input parity)
**Deps**: archive/tickets/SEATRES-004-unified-seat-identity-contract-module.md

## Problem

Seat identity is now centralized in `seat-identity-contract.ts`, but it still has no dedicated unit tests. Current cross-validation unit tests also inject seat ids via hardcoded literals instead of feeding the contract from the same canonical source that the test fixture doc uses.

This creates regression risk at the contract boundary between selector-lowering and cross-validation seat-reference checks.

## Assumption Reassessment (2026-03-01)

1. `buildSeatIdentityContract()` currently defines exactly two modes: `none` and `seat-catalog`.
2. There is no dedicated unit test file that table-tests each mode/output/diagnostic combination directly.
3. `packages/engine/test/unit/cross-validate.test.ts` currently calls `buildSeatIdentityContract({ seatCatalogSeatIds: ['us', 'arvn'] })` through local helpers; production compile wiring feeds `seatCatalogSeatIds` from derived seat-catalog assets.
4. Existing active tickets (`SEATRES-005`, `SEATRES-006`) target future strict-namespace / seat-catalog refactors, but do not explicitly cover present-state direct contract tests and test-harness parity with compile wiring.

## Architecture Check

1. A first-class contract module requires first-class contract tests. Direct mode coverage on `none | seat-catalog` keeps behavior explicit and safe to refactor.
2. Aligning test harness seat-id sources with compile-path semantics improves confidence in game-agnostic compiler behavior without introducing game-specific logic.
3. No backward-compatibility shims are introduced; this ticket strengthens correctness guarantees around existing behavior.

## What to Change

### 1. Add direct table-driven tests for `buildSeatIdentityContract`

1. Create a dedicated unit test suite for `seat-identity-contract.ts`.
2. Cover each mode with explicit assertions for:
   - returned `mode`
   - `selectorSeatIds`
   - `referenceSeatIds`
   - emitted diagnostics (including code/path/message shape where applicable)
3. Include cases that verify pass-through semantics (identity/ordering preservation) and the undefined-input path.

### 2. Remove cross-validation test harness drift from production wiring

1. Refactor `cross-validate.test.ts` helper(s) so contract inputs are built from a canonical fixture seat source (single source of truth in the test), mirroring compile semantics that flow seat ids from seat-catalog assets.
2. Add at least one test that verifies cross-validation behavior under both contract modes (`seat-catalog` and `none`) where relevant.
3. Keep cross-validation tests focused on xref behavior while avoiding drift-prone ad hoc contract construction.

## Files to Touch

- `packages/engine/test/unit/seat-identity-contract.test.ts` (new)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `packages/engine/src/cnl/seat-identity-contract.ts` (modify only if tests expose incorrect behavior)

## Out of Scope

- Strict single seat namespace migration (`SEATRES-005`)
- New SeatCatalog schema boundary (`SEATRES-006`)
- Runner visual-config behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Every `SeatIdentityContractMode` is directly tested with deterministic output assertions.
2. Cross-validation tests no longer rely on duplicated hardcoded seat-id literals that can drift from fixture seat declarations.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Seat contract module remains the single source of seat identity policy in compiler surfaces.
2. Test harnesses validate game-agnostic contract behavior without game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/seat-identity-contract.test.ts` — direct mode/output/diagnostic matrix coverage for `none | seat-catalog`.
Rationale: protects contract semantics from silent regressions.
2. `packages/engine/test/unit/cross-validate.test.ts` — contract-input parity updates with canonical fixture seat source + explicit `none` mode behavior check.
Rationale: ensures xref validation is tested under realistic contract wiring and validates the no-seat-catalog contract path explicitly.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/seat-identity-contract.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Added `packages/engine/test/unit/seat-identity-contract.test.ts` with direct contract coverage for both active modes (`none`, `seat-catalog`) and pass-through ordering/duplicate behavior.
  - Refactored `packages/engine/test/unit/cross-validate.test.ts` to use a single canonical seat-id source (`RICH_SEAT_CATALOG_IDS`) shared by fixture construction and contract wiring.
  - Added explicit cross-validation coverage for `none` contract mode (no seat catalog), asserting deterministic missing-seat diagnostics for turn-flow eligibility references.
- **Deviations From Original Plan**:
  - Original ticket text referenced a larger historical mode matrix that no longer exists; scope was corrected to the current two-mode contract before implementation.
  - `packages/engine/src/cnl/seat-identity-contract.ts` required no runtime change; the gap was test coverage and test-harness parity.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/seat-identity-contract.test.js` passed.
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
