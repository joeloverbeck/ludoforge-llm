# SEATRES-047: Make scenario failure reason mapping exhaustive and centralized

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler derivation-reason mapping hardening
**Deps**: tickets/SEATRES-044-split-scenario-linked-selection-core-from-diagnostic-adapters.md

## Problem

Scenario-selection failure mapping in `compile-data-assets.ts` currently uses a two-branch inline conditional. If `DataAssetSelectionFailureReason` is extended, this can silently misclassify new failure variants. The mapping contract should be explicit, exhaustive, and centralized.

## Assumption Reassessment (2026-03-02)

1. `selectScenarioRefWithPolicy` currently surfaces `failureReason` from shared selection policy.
2. `compile-data-assets.ts` maps this reason to derivation reasons with an inline ternary, not an exhaustive mapping helper.
3. No active ticket in `tickets/*` currently scopes exhaustive mapping hardening for this path.

## Architecture Check

1. Exhaustive mapping localizes policy knowledge and prevents silent drift between selection reason taxonomy and suppression behavior.
2. This is purely generic compiler plumbing and keeps game-specific content in `GameSpecDoc`, not runtime/compiler branches.
3. No backwards-compatibility aliases/shims: strict behavior is preserved while hardening maintainability.

## What to Change

### 1. Introduce centralized exhaustive mapping helper

1. Add a helper to map scenario selection `failureReason` to `DataAssetDerivationFailureReason`.
2. Use exhaustive `switch`/`assertNever` style typing so compiler fails at build-time when new reasons are introduced without mapping updates.

### 2. Keep reason propagation behavior unchanged

1. Continue projecting scenario-root-cause reason into map/pieceCatalog/seatCatalog derivation failure sets when scenario selection blocks inference.
2. Add targeted tests that assert mapping outputs for all current scenario selection failure reasons.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/unit/data-asset-selection.test.ts` (modify/add if needed for reason-surface expectations)

## Out of Scope

- Diagnostic code taxonomy changes
- Validator parity work
- Runtime/kernel simulation behavior

## Acceptance Criteria

### Tests That Must Pass

1. Scenario `missing-reference` maps deterministically to `scenario-selector-missing` derivation reason.
2. Scenario `ambiguous-selection` maps deterministically to `scenario-ambiguous` derivation reason.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selection-to-derivation reason mapping is centralized and exhaustive.
2. Compiler remains game-agnostic and deterministic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — add assertions that observable suppression behavior remains correct for both scenario failure reason variants after mapping hardening.
2. `packages/engine/test/unit/data-asset-selection.test.ts` — add/adjust focused expectations if helper extraction changes selection reason exposure contracts.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/data-asset-selection.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`
