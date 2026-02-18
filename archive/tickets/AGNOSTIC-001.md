# AGNOSTIC-001: Value-Based `attributeEquals` Semantics Across Zone Filters

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes
**Deps**: None

## Problem

`attributeEquals` is currently inconsistent across filter paths. Some evaluators still compare values with reference inequality (`actual !== expected`), which breaks valid comparisons for array-valued attributes (for example `terrainTags`) because arrays with equal contents but different references never match.

Reassessed affected paths:
- `packages/engine/src/kernel/stacking.ts`
- `packages/engine/src/kernel/map-model.ts`
- `packages/engine/src/kernel/validate-gamedef-structure.ts`

Current-state discrepancy found during reassessment:
- `packages/engine/src/kernel/map-model.ts` already has value-based comparison in `mapVisualRuleMatchApplies()`, but `constraintApplies()` still uses `!==`.
- `attributeEquals` behavior is therefore split across runtime/validation paths, and map-model contains duplicate comparison logic.

## What Must Change

1. Add a shared helper for `AttributeValue` equality with value semantics:
- scalars (`string`, `number`, `boolean`) compare by strict equality
- arrays compare by ordered element equality

2. Replace direct `!==` checks in all `attributeEquals` filter evaluators with the shared helper:
- `stacking.ts` zone space-filter evaluation
- `map-model.ts` marker constraint evaluation (`constraintApplies`)
- `map-model.ts` visual-rule evaluation (`mapVisualRuleMatchApplies`) should use the same shared helper instead of a local duplicate
- `validate-gamedef-structure.ts` initial-placement stacking validation

3. Keep behavior consistent across runtime enforcement and compile/validation-time checks.

4. Add explicit tests for array-valued attribute comparisons in:
- stacking runtime enforcement
- structure-validation stacking checks
- map marker-constraint validation flow

## Invariants

1. `attributeEquals` with scalar values behaves exactly as before.
2. `attributeEquals` with array values matches when contents are equal by value.
3. A missing attribute key never matches an expected value.
4. Runtime stacking enforcement and structure validation produce consistent filter decisions for the same input.
5. No FITL/game-specific logic is introduced into kernel filter code.
6. Engine architecture avoids duplicate attribute comparison implementations; shared helper is reused in all `attributeEquals` evaluators.

## Tests That Should Pass

1. `packages/engine/test/unit/stacking.test.ts`
- New case: `attributeEquals: { terrainTags: ['highland', 'jungle'] }` matches a zone with same tag array content.
- New negative case: order/content mismatch does not match.

2. `packages/engine/test/unit/data-assets.test.ts`
- New case proving map marker constraints with `attributeEquals` array attributes are evaluated by value during map payload validation.

3. `packages/engine/test/unit/validate-gamedef.test.ts`
- New case asserting placement/constraint validation honors array-valued `attributeEquals`.

4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-02-18
- What changed:
  - Added shared attribute comparator: `packages/engine/src/kernel/attribute-value-equals.ts`.
  - Unified `attributeEquals` evaluation in:
    - `packages/engine/src/kernel/stacking.ts`
    - `packages/engine/src/kernel/map-model.ts` (`constraintApplies` and `mapVisualRuleMatchApplies`)
    - `packages/engine/src/kernel/validate-gamedef-structure.ts`
  - Added array-equality regression tests in:
    - `packages/engine/test/unit/stacking.test.ts`
    - `packages/engine/test/unit/data-assets.test.ts`
    - `packages/engine/test/unit/validate-gamedef.test.ts`
- Deviations from original plan:
  - Replaced `fitl-production-lattice` test target with `data-assets` because lattice fixture tests are static-shape checks, while `validateMapPayload` is the executable marker-constraint path.
  - Fixed a pre-existing lint blocker in `packages/engine/scripts/schema-artifacts.mjs` (removed redundant global redeclaration comment) so lint can pass.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (249/249).
  - `pnpm turbo lint` passed.
