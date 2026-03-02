# SEATRES-046: Add scenario-root-cause tokenTypes cascade regression coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler regression test coverage
**Deps**: archive/tickets/SEATRES/SEATRES-026-model-scenario-selection-failure-reasons-and-suppress-dependent-cascades.md

## Problem

Scenario-root-cause suppression behavior was expanded for tokenTypes derivation gating, but regression tests currently assert only zones and seat-catalog cascades. Missing tokenTypes-specific scenario-root-cause assertions creates a future regression gap.

## Assumption Reassessment (2026-03-02)

1. Suppression policy in `compiler-core.ts` now includes scenario reasons for `pieceCatalogTokenTypesMissing`.
2. Existing/new tests assert scenario-root-cause suppression for `doc.zones` and `CNL_COMPILER_SEAT_CATALOG_REQUIRED`, but not for `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING`.
3. No active ticket in `tickets/*` currently scopes this exact tokenTypes suppression regression gap.

## Architecture Check

1. Coverage parity across map/piece/seat cascades is required to keep suppression policy changes robust over time.
2. This change is test-only and preserves strict, game-agnostic compiler/runtime boundaries.
3. No backwards-compatibility shims/aliases: tests enforce existing strict contract.

## What to Change

### 1. Add unit coverage for tokenTypes cascade gating on scenario selection failure

1. Add a unit test for scenario ambiguity + `tokenTypes: null` asserting:
   - root scenario diagnostic present
   - `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING` present
   - no dependent required `doc.tokenTypes` cascade diagnostic
2. Add a unit test for missing `metadata.defaultScenarioAssetId` target + `tokenTypes: null` with same expectations.

### 2. Add integration coverage for tokenTypes cascade behavior

1. Add a parse/compile integration case for scenario selection failure with omitted tokenTypes section asserting deterministic cascade outputs.

## Files to Touch

- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add)

## Out of Scope

- Compiler implementation changes in derivation/suppression logic
- Validator behavior
- Runtime/kernel simulation behavior

## Acceptance Criteria

### Tests That Must Pass

1. Scenario ambiguity suppresses required tokenTypes cascade and emits `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING` when explicit tokenTypes are absent.
2. Missing `metadata.defaultScenarioAssetId` selector target does the same.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Root-cause-first diagnostics remain deterministic and minimal.
2. Compiler/runtime remain game-agnostic; tests encode generic contracts only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — add tokenTypes scenario-root-cause suppression assertions for ambiguous/missing selector paths.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — add end-to-end tokenTypes suppression assertion.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`
