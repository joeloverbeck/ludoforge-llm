# SEATRES-040: Add compile-pipeline integration assertion for seat-reference diagnostic code

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler integration-test coverage
**Deps**: archive/tickets/SEATRES-022-split-compiler-seat-reference-diagnostic-code-from-asset-reference-missing.md

## Problem

`SEATRES-022` split seat-reference diagnostics to `CNL_COMPILER_SEAT_REF_MISSING`, but current integration coverage in `compile-pipeline.test.ts` only asserts `CNL_COMPILER_DATA_ASSET_REF_MISSING` for scenario asset-id lookups. We lack an end-to-end assertion that markdown parse + compile surfaces the new seat-reference code.

## Assumption Reassessment (2026-03-02)

1. `compile-data-assets.ts` now emits `CNL_COMPILER_SEAT_REF_MISSING` for canonical seat-id reference misses.
2. `compiler-structured-results.test.ts` asserts seat-reference split at unit level.
3. `compile-pipeline.test.ts` currently does not assert `CNL_COMPILER_SEAT_REF_MISSING`; scope is integration coverage completion, not behavior redesign.

## Architecture Check

1. Integration coverage for compiler diagnostics hardens contract boundaries and prevents regressions between parser/source-map and compiler layers.
2. This change is game-agnostic and does not introduce game-specific logic into `GameDef`/simulation/runtime.
3. No backwards-compatibility aliasing; test asserts canonical code only.

## What to Change

### 1. Add markdown integration case for seat-id miss diagnostic code

Add one integration test fixture or inline markdown case that produces an invalid seat reference in selected piece/scenario payloads and asserts diagnostic code `CNL_COMPILER_SEAT_REF_MISSING` at the expected path.

### 2. Keep asset-id lookup assertions unchanged

Retain existing integration assertions for missing `mapAssetId`/`pieceCatalogAssetId`/`seatCatalogAssetId` using `CNL_COMPILER_DATA_ASSET_REF_MISSING` to preserve domain separation.

## Files to Touch

- `packages/engine/test/integration/compile-pipeline.test.ts` (modify)

## Out of Scope

- Compiler implementation changes for seat-reference detection
- Validator diagnostic taxonomy
- Runner/UI handling of diagnostics

## Acceptance Criteria

### Tests That Must Pass

1. Integration compile pipeline emits `CNL_COMPILER_SEAT_REF_MISSING` for seat-id misses.
2. Integration compile pipeline still emits `CNL_COMPILER_DATA_ASSET_REF_MISSING` for asset-id misses.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler diagnostic domains remain separated by failure type (seat-id value vs asset-id lookup).
2. Parse + compile diagnostic behavior remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compile-pipeline.test.ts` — add seat-reference integration assertion for canonical compiler code. Rationale: ensures end-to-end contract parity with unit-level taxonomy split.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
3. `pnpm -F @ludoforge/engine test`

