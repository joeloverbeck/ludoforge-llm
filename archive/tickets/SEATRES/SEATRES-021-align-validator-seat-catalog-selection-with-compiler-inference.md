# SEATRES-021: Align validator seatCatalog selection with compiler selection semantics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator/compile seat-catalog selection parity for cross-asset checks
**Deps**: archive/tickets/SEATRES-012-enforce-seat-catalog-references-across-piece-and-scenario-assets.md

## Problem

Seat-reference validation in `validateDataAssets()` currently requires explicit `scenario.seatCatalogAssetId`. Compiler seat-reference checks use selected-seat-catalog semantics (explicit selector or single-catalog inference). This can produce validator/compile parity gaps for the same `GameSpecDoc`.

## Assumption Reassessment (2026-03-01)

1. Compiler derives selected seat catalog via selector/inference and validates seat references against that selected canonical seat set.
2. Validator currently skips canonical seat-reference checks when `scenario.seatCatalogAssetId` is omitted, even when selection is inferable.
3. Additional parity gap: compiler seat checks run against the selected scenario (metadata selector or single-scenario inference), while validator currently scans every scenario independently for seat checks.
4. Existing compiler tests already cover compiler-side seat-catalog ambiguity/missing diagnostics; this ticket should focus validator behavior and validator-vs-compiler parity expectations.

## Architecture Check

1. Selection-policy parity between validator and compiler reduces drift and prevents contradictory acceptance/rejection outcomes.
2. This preserves boundaries: GameSpecDoc remains data source; validator/compiler apply shared game-agnostic selection contracts.
3. No backward-compat shims; docs that violate canonical selection constraints should fail deterministically.

## What to Change

### 1. Align validator scenario + seat-catalog selection policy with compiler semantics

1. For validator canonical seat-reference checks, first select scenario using compiler-equivalent policy (`metadata.defaultScenarioAssetId` preferred, otherwise single-scenario inference, otherwise deterministic selection diagnostic).
2. Resolve seat catalog from selected scenario using compiler-equivalent policy (explicit selector preferred, single-catalog inference allowed, ambiguity/missing handled deterministically).
3. Resolve piece catalog used by canonical seat checks with the same selector/inference policy so piece-catalog seat references are validated under the same selected context.

### 2. Emit deterministic selection diagnostics in validator path where needed

1. Add/emit explicit diagnostics when validator cannot resolve selected scenario and/or selected seat catalog due to ambiguity or missing selector target.
2. Avoid downstream incidental seat-reference noise if selection itself failed.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)

## Out of Scope

- Runtime seat-resolution behavior
- Turn-flow/coup runtime invariant work
- Visual config/runner behavior

## Acceptance Criteria

### Tests That Must Pass

1. Validator and compiler agree on seat-reference validity for docs with omitted but inferable seat-catalog selector.
2. Validator canonical seat checks use selected-scenario context (not all scenarios) for parity with compiler.
3. Ambiguous/missing scenario or seat-catalog selection in validator path emits direct deterministic selection diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-catalog selection semantics are consistent across validator and compiler.
2. Cross-asset seat checks remain canonical-seat, game-agnostic, and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add omitted-selector + single-seat-catalog inference parity case.  
Rationale: locks validator behavior to canonical selection policy.
2. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add multi-seat-catalog ambiguous selection case with deterministic diagnostic and suppression of dependent seat-reference noise.  
Rationale: prevents silent skips and validator/compile divergence.
3. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add multi-scenario/no-selector case to verify selected-scenario gating for seat checks.  
Rationale: ensures validator seat checks follow the same scenario-selection boundary as compiler.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What changed**:
  - Updated validator seat-reference checks to use compiler-equivalent selection semantics:
    - scenario selection via `metadata.defaultScenarioAssetId` or single-scenario inference
    - seatCatalog selection via scenario selector or single-catalog inference
    - pieceCatalog selection via scenario selector or single-catalog inference (for piece-seat canonical checks)
  - Extracted shared data-asset selection policy into `packages/engine/src/cnl/data-asset-selection.ts` and refactored both compiler + validator to use it.
  - Added deterministic validator diagnostics for ambiguous scenario/asset selection in canonical seat-check path.
  - Added validator tests for omitted selector inference, seat-catalog ambiguity suppression behavior, and multi-scenario selector gating.
  - Added dedicated unit tests for shared selection-policy invariants (`packages/engine/test/unit/data-asset-selection.test.ts`).
- **Deviations from original plan**:
  - Compiler-side behavior was not changed semantically, but compiler internals were refactored to consume shared selection policy for long-term architecture cleanliness.
  - Existing validator dedup-across-scenarios test was updated to reflect selected-scenario gating behavior.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
