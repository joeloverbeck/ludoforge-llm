# SEATRES-023: Align validator map/piece asset selection with compiler inference semantics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator data-asset selection diagnostics/parity
**Deps**: archive/tickets/SEATRES-013-seat-catalog-selection-ambiguity-and-missing-selector-diagnostics.md

## Problem

Compiler now emits deterministic ambiguity diagnostics when multiple `map` or `pieceCatalog` assets exist without explicit scenario selectors, but validator still checks only explicit missing references. This allows validator-pass + compiler-fail drift for the same `GameSpecDoc`.

## Assumption Reassessment (2026-03-01)

1. Compiler selection for `map`/`pieceCatalog` does attempt resolution whenever assets exist, and emits selection-boundary ambiguity/missing-reference diagnostics via `selectAssetById(...)` in `compile-data-assets.ts`.
2. Validator `validateDataAssets()` already performs scenario selection and ambiguity checks for `seatCatalog` and `pieceCatalog` during canonical seat validation, but it does **not** emit an equivalent ambiguity diagnostic for `map` selection when `scenario.mapAssetId` is omitted and multiple maps exist.
3. Validator scenario cross-reference checks currently use only explicit `scenario.mapAssetId` / `scenario.pieceCatalogAssetId` links (no singleton inference fallback), so parity in this ticket is constrained to **selection-boundary ambiguity diagnostics**, not full inferred cross-reference parity.
4. Existing tests cover compiler ambiguity in general (`compiler-structured-results.test.ts`) and validator scenario/seat ambiguity (`validate-spec-scenario.test.ts`), but do not explicitly lock scenario-linked validator/compiler parity for omitted map/piece selectors.

## Architecture Check

1. Validator and compiler must enforce the same asset-selection contract to avoid contradictory authoring feedback loops.
2. This remains game-agnostic: selection policy is generic to asset contracts and does not encode game logic.
3. No backward-compatibility aliases/shims: ambiguous selection is a hard failure until selector is explicit.

## What to Change

### 1. Add validator-side map selection ambiguity check for scenario links

1. In validator scenario data-asset validation, detect and emit deterministic diagnostics for:
   - multiple `map` assets with missing `scenario.mapAssetId`.
2. Keep existing deterministic missing-reference diagnostics with alternatives unchanged.
3. Keep existing `pieceCatalog` ambiguity behavior intact (regression guard via tests).

### 2. Add parity tests for validator vs compiler outcomes

1. Add tests asserting validator and compiler both reject scenario-linked omitted-selector ambiguity cases for:
   - `map` (new validator behavior)
   - `pieceCatalog` (existing validator behavior; parity lock).
2. Ensure selector-provided docs continue to validate/compile without regression.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add scenario-linked parity assertions)

## Out of Scope

- Seat-catalog-specific validator parity work already covered by `SEATRES-021`
- Runtime/kernel selection behavior
- Runner/visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Validator emits direct ambiguity diagnostics for multi-map/no-selector scenario cases.
2. Validator continues to emit direct ambiguity diagnostics for multi-pieceCatalog/no-selector scenario cases (no regression).
3. Equivalent docs fail in compiler with matching root-cause category (selection ambiguity), not downstream incidental errors.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator and compiler selection semantics are contract-parity for map/piece scenario-linked assets.
2. Asset selection failures are surfaced at selection boundary with deterministic alternatives when available.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add scenario-linked map/piece multi-asset/no-selector ambiguity cases and selector-present controls.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — add scenario-linked compile-path ambiguity checks matching validator root-cause category.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What Changed**:
  - Added validator-side map ambiguity diagnostics when `scenario.mapAssetId` is omitted and multiple map assets exist.
  - Hardened validator architecture by making `pieceCatalog` ambiguity/missing-reference selection checks run independently of seat-catalog selection (selection-boundary parity with compiler behavior).
  - Added validator scenario tests for map ambiguity (including explicit-selector control) and scenario-linked pieceCatalog ambiguity.
  - Added compiler structured-results tests for scenario-linked map/pieceCatalog ambiguity diagnostics.
- **Deviations From Original Plan**:
  - The original assumptions overstated missing validator behavior for `pieceCatalog`; validator already handled some ambiguity cases. Scope was corrected to focus on missing map ambiguity plus parity hardening.
  - Compiler parity assertions were split across validator-focused and compiler-focused unit tests instead of coupling both in one test assertion path.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint` ✅
