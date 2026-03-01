# SEATRES-007: Seat identity contract mode-matrix tests and compile-path parity coverage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler test architecture (`seat-identity-contract.ts` tests, `cross-validate.test.ts` contract input parity)
**Deps**: archive/tickets/SEATRES-004-unified-seat-identity-contract-module.md

## Problem

Seat identity is now centralized in `seat-identity-contract.ts`, but its behavior matrix is only tested indirectly. Current cross-validation unit tests also inject a simplified contract input (`pieceCatalogSeatIds: undefined`) that differs from production compiler wiring.

This creates a regression risk in the contract boundary that now coordinates selector-lowering seat ids and cross-validation seat-reference ids.

## Assumption Reassessment (2026-03-01)

1. `buildSeatIdentityContract()` currently defines multiple modes (`none`, `piece-catalog-only`, `turn-flow-named`, `turn-flow-index-raw`, `turn-flow-index-canonicalized`, `incoherent`) with distinct selector/reference outputs.
2. There is no dedicated unit test file that table-tests each mode/output/diagnostic combination directly.
3. `packages/engine/test/unit/cross-validate.test.ts` currently builds contract input with `pieceCatalogSeatIds: undefined`, while production compile path feeds real piece-catalog seat ids from derived assets.
4. Existing active tickets (`SEATRES-005`, `SEATRES-006`) target future strict-namespace / seat-catalog refactors, but do not explicitly cover present-state contract mode-matrix testing and compile-path parity harnessing.

## Architecture Check

1. A first-class contract module requires first-class contract tests. Direct mode-matrix coverage makes future refactors safe and deterministic.
2. Aligning test harness inputs with production compile flow improves confidence in game-agnostic compiler behavior without introducing game-specific logic.
3. No backward-compatibility shims are introduced; this ticket strengthens correctness guarantees around existing behavior.

## What to Change

### 1. Add direct table-driven tests for `buildSeatIdentityContract`

1. Create a dedicated unit test suite for `seat-identity-contract.ts`.
2. Cover each mode with explicit assertions for:
   - returned `mode`
   - `selectorSeatIds`
   - `referenceSeatIds`
   - emitted diagnostics (including code/path/message shape where applicable)
3. Include edge cases for index detection and mismatch handling.

### 2. Remove cross-validation test harness drift from production wiring

1. Refactor `cross-validate.test.ts` helper(s) so contract inputs can reflect production semantics, including piece-catalog seat ids when relevant.
2. Add at least one test that verifies cross-validation behavior under contract output produced from both turn-flow seats and piece-catalog seats.
3. Keep cross-validation tests focused on xref behavior while avoiding ad hoc contract construction that bypasses real compiler assumptions.

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
2. Cross-validation tests no longer rely on an unrealistic contract-input shortcut that diverges from compile production flow.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Seat contract module remains the single source of seat identity policy in compiler surfaces.
2. Test harnesses validate game-agnostic contract behavior without game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/seat-identity-contract.test.ts` — direct mode/output/diagnostic matrix coverage.
Rationale: protects contract semantics from silent regressions.
2. `packages/engine/test/unit/cross-validate.test.ts` — contract-input parity updates with production compile semantics.
Rationale: ensures xref validation is tested under realistic contract wiring.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/seat-identity-contract.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
