# SEATRES-021: Align validator seatCatalog selection with compiler selection semantics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator/compile seat-catalog selection parity for cross-asset checks
**Deps**: archive/tickets/SEATRES-012-enforce-seat-catalog-references-across-piece-and-scenario-assets.md

## Problem

Seat-reference validation in `validateDataAssets()` currently requires explicit `scenario.seatCatalogAssetId`. Compiler seat-reference checks use selected-seat-catalog semantics (explicit selector or single-catalog inference). This can produce validator/compile parity gaps for the same `GameSpecDoc`.

## Assumption Reassessment (2026-03-01)

1. Compiler derives selected seat catalog via selector/inference and validates seat references against that selected canonical seat set.
2. Validator currently skips canonical seat-reference checks when `scenario.seatCatalogAssetId` is omitted, even when selection is inferable.
3. Active tickets `SEATRES-013` through `SEATRES-019` do not cover validator-vs-compiler seat-catalog selection parity.

## Architecture Check

1. Selection-policy parity between validator and compiler reduces drift and prevents contradictory acceptance/rejection outcomes.
2. This preserves boundaries: GameSpecDoc remains data source; validator/compiler apply shared game-agnostic selection contracts.
3. No backward-compat shims; docs that violate canonical selection constraints should fail deterministically.

## What to Change

### 1. Introduce shared seat-catalog selection policy for validator cross-asset checks

1. For validator scenario cross-asset seat checks, resolve seat catalog using same policy class as compiler (explicit selector preferred, single-catalog inference allowed, ambiguity/missing handled deterministically).
2. Apply same policy to piece-catalog pairing used by canonical seat-reference checks.

### 2. Emit deterministic selection diagnostics in validator path where needed

1. Add/emit explicit diagnostics when validator cannot resolve seat catalog for a scenario due to ambiguity/missing selector.
2. Avoid downstream incidental seat-reference noise if selection itself failed.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify only if shared helper extraction is introduced)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add parity case if needed)

## Out of Scope

- Runtime seat-resolution behavior
- Turn-flow/coup runtime invariant work
- Visual config/runner behavior

## Acceptance Criteria

### Tests That Must Pass

1. Validator and compiler agree on seat-reference validity for docs with omitted but inferable seat-catalog selector.
2. Ambiguous/missing seat-catalog selection in validator path emits direct deterministic selection diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-catalog selection semantics are consistent across validator and compiler.
2. Cross-asset seat checks remain canonical-seat, game-agnostic, and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add omitted-selector + single-seat-catalog inference parity case.  
Rationale: locks validator behavior to canonical selection policy.
2. `packages/engine/test/unit/validate-spec-scenario.test.ts` — add multi-seat-catalog ambiguous selection case with deterministic diagnostic.  
Rationale: prevents silent skips and validator/compile divergence.
3. `packages/engine/test/unit/compiler-structured-results.test.ts` — parity assertion for equivalent compile outcome where relevant.  
Rationale: ensures both entry points apply same contract.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
