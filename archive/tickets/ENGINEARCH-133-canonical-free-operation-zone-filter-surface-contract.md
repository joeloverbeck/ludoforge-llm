# ENGINEARCH-133: Canonical Free-Operation Zone-Filter Surface Contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel type contract ownership for free-operation zone-filter surfaces
**Deps**: archive/tickets/ENGINEARCH-123-free-operation-zone-filter-deferral-path-completeness.md, archive/tickets/ENGINEARCH-132-free-operation-zone-filter-binding-resolution-contract.md

## Problem

The free-operation zone-filter evaluation surface union is declared in multiple places, which creates contract drift risk between policy, diagnostics, and runtime errors.

## Assumption Reassessment (2026-02-28)

1. `missing-binding-policy.ts` currently defines `FreeOperationZoneFilterSurface`.
2. `turn-flow-error.ts` separately hardcodes the same union in `FreeOperationZoneFilterErrorInput.surface`.
3. `turn-flow-eligibility.ts` also hardcodes the same union in multiple locations (`evaluateZoneFilterForMove` and `zoneFilterErrorSurface` option contracts).
4. Existing tests already validate surface behavior in:
   - `missing-binding-policy.test.ts` (defer policy split by surface)
   - `legal-choices.test.ts` (typed `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` with `surface=legalChoices`)
   - `apply-move.test.ts` (typed `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` with `surface=turnFlowEligibility`)
5. Mismatch: duplicated union ownership is not a clean architecture contract; corrected scope is to define one canonical shared type and import it from all consumers.

## Architecture Check

1. A single canonical type contract is cleaner and more robust than repeated string unions because it prevents silent policy/diagnostic divergence.
2. This remains fully game-agnostic and does not introduce game-specific behavior into runtime/kernel contracts.
3. No backwards-compatibility aliasing/shims: duplicate unions are removed rather than preserved.

## What to Change

### 1. Centralize surface type ownership

Define one canonical exported `FreeOperationZoneFilterSurface` contract in a shared kernel type owner (`packages/engine/src/kernel/free-operation-zone-filter-contract.ts`) and remove duplicate local unions.

### 2. Rewire all zone-filter surface consumers

Update policy and error wiring to import the canonical type for:
- missing-binding deferral policy
- free-operation zone-filter runtime error inputs
- turn-flow eligibility APIs (`evaluateZoneFilterForMove`, `analyze/explain/resolve` option contracts)
- any other direct free-operation zone-filter surface annotations

### 3. Add contract-lock test coverage

Strengthen/confirm tests to guard that legal/probe and strict/apply surfaces still map to expected behavior and diagnostics under the canonical contract.

## Files to Touch

- `packages/engine/src/kernel/free-operation-zone-filter-contract.ts` (add)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/turn-flow-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify, only if type import changes become necessary)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add if diagnostics coverage needs updates)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add if diagnostics coverage needs updates)

## Out of Scope

- Redesign of free-operation denial taxonomy.
- Game-specific schema/data changes in GameSpecDoc or visual-config YAML files.

## Acceptance Criteria

### Tests That Must Pass

1. Free-operation zone-filter surfaces are typed from one canonical contract (no duplicate local unions).
2. `legalChoices` surface still defers only deferrable unresolved bindings; `turnFlowEligibility` surface still throws typed runtime errors.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation zone-filter surface semantics are defined by one engine-level contract.
2. GameDef/runtime remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — lock canonical surface policy behavior.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — lock strict-surface typed-error behavior.
3. `packages/engine/test/unit/kernel/legal-choices.test.ts` — lock probe-surface typed-error behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

Implemented exactly as reassessed:

1. Added canonical type owner `packages/engine/src/kernel/free-operation-zone-filter-contract.ts` and rewired all free-operation zone-filter surface annotations to import it.
2. Removed duplicated surface unions from:
   - `missing-binding-policy.ts`
   - `turn-flow-error.ts`
   - `turn-flow-eligibility.ts` (including option contracts)
3. Updated `missing-binding-policy.test.ts` to consume canonical surface constants for contract-locked behavior checks.
4. Validated behavior and diagnostics remained stable:
   - `pnpm turbo build`
   - targeted tests (`missing-binding-policy`, `apply-move`, `legal-choices`)
   - full `pnpm -F @ludoforge/engine test` (322/322 pass)
   - `pnpm turbo lint`
