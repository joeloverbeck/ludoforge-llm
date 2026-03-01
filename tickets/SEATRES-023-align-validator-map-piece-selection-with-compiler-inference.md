# SEATRES-023: Align validator map/piece asset selection with compiler inference semantics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator data-asset selection diagnostics/parity
**Deps**: archive/tickets/SEATRES-013-seat-catalog-selection-ambiguity-and-missing-selector-diagnostics.md

## Problem

Compiler now emits deterministic ambiguity diagnostics when multiple `map` or `pieceCatalog` assets exist without explicit scenario selectors, but validator still checks only explicit missing references. This allows validator-pass + compiler-fail drift for the same `GameSpecDoc`.

## Assumption Reassessment (2026-03-01)

1. Compiler selection for `map`/`pieceCatalog` now attempts resolution whenever assets exist, surfacing ambiguous/missing selector failures at selection boundary.
2. Validator `validateDataAssets()` currently validates unknown explicit refs but does not run scenario-aware ambiguity checks for `map`/`pieceCatalog` selection.
3. Existing active tickets cover seat-catalog parity (`SEATRES-021`) and diagnostic-code split (`SEATRES-022`), but not map/piece validator-compiler selection parity.

## Architecture Check

1. Validator and compiler must enforce the same asset-selection contract to avoid contradictory authoring feedback loops.
2. This remains game-agnostic: selection policy is generic to asset contracts and does not encode game logic.
3. No backward-compatibility aliases/shims: ambiguous selection is a hard failure until selector is explicit.

## What to Change

### 1. Add validator-side selection ambiguity checks for map/piece scenario links

1. In validator scenario data-asset validation, detect and emit deterministic diagnostics for:
   - multiple `map` assets with missing `scenario.mapAssetId`
   - multiple `pieceCatalog` assets with missing `scenario.pieceCatalogAssetId`
2. Keep missing explicit reference diagnostics deterministic with alternatives.

### 2. Add parity tests for validator vs compiler outcomes

1. Add tests asserting validator and compiler both reject the same ambiguity scenarios.
2. Ensure selector-provided docs continue to validate/compile without regression.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add parity assertions if needed)

## Out of Scope

- Seat-catalog-specific validator parity work already covered by `SEATRES-021`
- Runtime/kernel selection behavior
- Runner/visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Validator emits direct ambiguity diagnostics for multi-map/no-selector and multi-pieceCatalog/no-selector scenario cases.
2. Equivalent docs fail in compiler with matching root-cause category (selection ambiguity), not downstream incidental errors.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator and compiler selection semantics are contract-parity for map/piece scenario-linked assets.
2. Asset selection failures are surfaced at selection boundary with deterministic alternatives when available.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add map/piece multi-asset/no-selector ambiguity cases and selector-present controls.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — add parity checks that compile-path ambiguity category aligns with validator expectations.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`
