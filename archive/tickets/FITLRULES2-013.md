# FITLRULES2-013: Strengthen Turn-Flow Action-Class Mapping Semantics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL cross-validation semantic invariants and shared turn-flow mapping rules
**Deps**: `specs/00-fitl-implementation-order.md`, `reports/fire-in-the-lake-rules-section-2.md`

## Problem

Current validation guarantees turn-flow map shape, allowed class literals, and action-id existence, but does not enforce semantic completeness/coherence for card-driven sequencing. This permits map omissions/misclassifications that only surface as degraded runtime behavior.

## Assumption Reassessment (2026-02-23)

Confirmed against current code/tests:

1. Structural/literal checks already exist in `validate-extensions.ts` and `compile-turn-flow.ts`.
2. Cross-validation currently checks only action-id existence for `turnFlow.actionClassByActionId` entries.
3. There is no shared compile-time rule for required semantic mappings (pass/event/participating action coverage).

Discrepancy correction:

4. `validate-spec` is structural-only in current architecture; semantic turn-flow invariants belong in cross-validation, not structural validation.
5. `compile-turn-flow.ts` runs before full section cross-reference context and is not the right home for action-map semantic completeness checks that depend on resolved action definitions.
6. Free-operation operation ids can be context-classified at move time (`operation` vs `limitedOperation`), so requiring static map coverage for those ids introduces turn-flow action-class mismatches and is not architecturally valid under current contracts.

## Architecture Check

1. Semantic turn-flow mapping invariants should be centralized in one shared reusable rule unit and enforced at compile time via cross-validation.
2. Runtime turn-flow logic must consume only validated contracts; no compatibility shims or fallback aliasing for missing semantic mappings.
3. Keep engine generic: invariants are card-driven semantics, not FITL-specific assumptions.

## Updated Scope

### In Scope

1. Add semantic diagnostics for card-driven action-class mapping:
- required pass action mapping (`pass -> pass`)
- required card-event action mapping (declared/synthesized card-event action -> `event`)
- required pivotal interrupt action mapping (`pivotal.actionIds[*] -> event`)

2. Introduce one shared participation rule helper and use it consistently from cross-validation.

3. Improve diagnostic quality with path-level pointers and actionable correction suggestions.

### Out of Scope

1. Structural schema validation redesign in `validate-spec`.
2. Runtime legality algorithm redesign.
3. Runner visualization contract changes.

## What to Change

### 1. Add semantic mapping invariants (cross-validation)

Introduce blocking diagnostics for:
- declared pass action not mapped to `pass`
- declared/synthesized card-event action not mapped to `event`
- pivotal action ids not mapped to `event`

### 2. Define participation rule centrally

Add one reusable helper that computes required card-driven participating action ids from compiled action metadata (engine-generic), and use it in cross-validation.

### 3. Improve diagnostics quality

Emit precise `doc.turnOrder.config.turnFlow.actionClassByActionId...` paths and direct correction guidance.

## Files to Touch (Corrected)

- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/kernel/turn-flow-contract.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)

## Acceptance Criteria

### Tests That Must Pass

1. Missing required semantic mappings fail compile with clear path-level diagnostics.
2. Misclassified pass/event mappings fail compile with explicit correction guidance.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card-driven turn-flow map is semantically complete for required participating actions.
2. Validation/compile logic remains game-agnostic and reusable for any card-driven game.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — semantic mapping diagnostics (missing/misclassified pass/event/participating actions).
2. `packages/engine/test/unit/compile-top-level.test.ts` — compile blocking behavior for semantic mapping violations.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-23
- Actually changed:
  - Added centralized semantic mapping requirements helper in `packages/engine/src/kernel/turn-flow-contract.ts`.
  - Added cross-validation semantic invariants in `packages/engine/src/cnl/cross-validate.ts` for:
    - declared `pass` action must map to `pass`
    - declared/synthesized card-event actions must map to `event`
    - `pivotal.actionIds[*]` must map to `event`
  - Added/updated unit coverage in:
    - `packages/engine/test/unit/cross-validate.test.ts`
    - `packages/engine/test/unit/compile-top-level.test.ts`
  - Updated ticket assumptions/scope to remove invalid free-operation static mapping requirement (operation actions can be context-classified as `operation` or `limitedOperation`).
- Deviations from original plan:
  - Did not enforce static `actionClassByActionId` coverage for `freeOperationActionIds`; that approach caused runtime `turnFlowActionClassMismatch` regressions for valid limited operations and was corrected as architecturally invalid.
  - No changes were retained in production FITL mapping after verifying that static mapping over-constrained limited-op contexts.
- Verification:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (254 pass, 0 fail)
  - `pnpm -F @ludoforge/engine lint` ✅
