# SEATRES-046: Add scenario-root-cause tokenTypes cascade regression coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler regression test coverage
**Deps**: archive/tickets/SEATRES/SEATRES-026-model-scenario-selection-failure-reasons-and-suppress-dependent-cascades.md

## Problem

Scenario-root-cause suppression behavior for tokenTypes derivation has partial regression coverage: selector-missing is already covered, but scenario-ambiguous tokenTypes cascade suppression is not. That leaves a parity gap versus existing zones/seat-catalog suppression tests.

## Assumption Reassessment (2026-03-03)

1. Suppression policy in `compiler-core.ts` includes both `scenario-selector-missing` and `scenario-ambiguous` for `pieceCatalogTokenTypesMissing`.
2. Existing tests already cover selector-missing tokenTypes cascade behavior:
   - unit: `compiler-structured-results.test.ts` (`emits scenario-root-cause tokenTypes cascade wording when selector target is missing`)
   - integration: `compile-pipeline.test.ts` (`suppresses seat-catalog-required when metadata.defaultScenarioAssetId target is missing`)
3. Existing tests cover scenario-ambiguous suppression for zones, but do not cover scenario-ambiguous suppression for tokenTypes.
4. Scope should focus on filling that ambiguity-specific tokenTypes gap and tightening assertions where tokenTypes required-section suppression is implied but not asserted.

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
2. Keep existing selector-missing tokenTypes unit case and strengthen only if any required-section suppression assertion is missing.

### 2. Add integration coverage for tokenTypes cascade behavior

1. Add a parse/compile integration case for scenario-ambiguous selection with omitted tokenTypes section asserting deterministic cascade outputs.
2. In existing selector-missing integration coverage, assert absence of required `doc.tokenTypes` diagnostic if not already covered.

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
2. Selector-missing continues to emit tokenTypes cascade warning and suppress required `doc.tokenTypes` diagnostic.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Root-cause-first diagnostics remain deterministic and minimal.
2. Compiler/runtime remain game-agnostic; tests encode generic contracts only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — add tokenTypes scenario-ambiguous suppression assertions and tighten selector-missing assertions if needed.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — add end-to-end scenario-ambiguous tokenTypes suppression assertion and tighten selector-missing assertions if needed.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Added unit regression coverage for tokenTypes cascade suppression on `scenario-ambiguous` in `packages/engine/test/unit/compiler-structured-results.test.ts`.
  - Strengthened integration coverage in `packages/engine/test/integration/compile-pipeline.test.ts`:
    - scenario-ambiguous path now asserts tokenTypes cascade presence, message/suggestion root-cause wording, and suppression of required `doc.tokenTypes`.
    - selector-missing path now explicitly asserts suppression of required `doc.tokenTypes`.
  - Added reusable assertion helper in `packages/engine/test/helpers/diagnostic-helpers.ts`:
    - `assertDataAssetCascadeSuppression(...)` centralizes cascade-present + required-section-suppressed + root-cause wording checks.
  - Refactored affected unit/integration tests to use the shared helper to reduce assertion drift and keep suppression invariants consistent across zones/tokenTypes coverage.
- **Deviations from original plan**:
  - Did not add a new selector-missing unit test or a brand-new selector-missing integration scenario because both already existed before implementation.
  - Re-scoped work to the real uncovered gap: tokenTypes assertions for scenario ambiguity plus stronger suppression assertions in existing tests.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
