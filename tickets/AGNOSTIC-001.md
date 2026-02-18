# AGNOSTIC-001: Value-Based `attributeEquals` Semantics Across Zone Filters

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes
**Deps**: None

## Problem

`attributeEquals` currently compares values with reference inequality (`actual !== expected`) in multiple filter paths. This breaks valid comparisons for array-valued attributes (for example `terrainTags`) because arrays with equal contents but different references never match.

Affected paths include:
- `packages/engine/src/kernel/stacking.ts`
- `packages/engine/src/kernel/map-model.ts`
- `packages/engine/src/kernel/validate-gamedef-structure.ts`

## What Must Change

1. Add a shared helper for `AttributeValue` equality with value semantics:
- scalars (`string`, `number`, `boolean`) compare by strict equality
- arrays compare by ordered element equality

2. Replace direct `!==` checks in all `attributeEquals` filter evaluators with the shared helper.

3. Keep behavior consistent across runtime enforcement and compile/validation-time checks.

4. Add explicit tests for array-valued attribute comparisons in stacking and marker-constraint flows.

## Invariants

1. `attributeEquals` with scalar values behaves exactly as before.
2. `attributeEquals` with array values matches when contents are equal by value.
3. A missing attribute key never matches an expected value.
4. Runtime stacking enforcement and structure validation produce consistent filter decisions for the same input.
5. No FITL/game-specific logic is introduced into kernel filter code.

## Tests That Should Pass

1. `packages/engine/test/unit/stacking.test.ts`
- New case: `attributeEquals: { terrainTags: ['highland', 'jungle'] }` matches a zone with same tag array content.
- New negative case: order/content mismatch does not match.

2. `packages/engine/test/unit/fitl-production-lattice.test.ts`
- New/updated case proving array-based marker constraints are evaluated by value.

3. `packages/engine/test/unit/validate-gamedef.test.ts`
- New case asserting placement/constraint validation honors array-valued `attributeEquals`.

4. `pnpm -F @ludoforge/engine test`
