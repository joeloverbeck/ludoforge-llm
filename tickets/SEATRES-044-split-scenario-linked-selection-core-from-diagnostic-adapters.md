# SEATRES-044: Split scenario-linked selection core from diagnostic adapters

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL shared selection policy API layering + compiler/validator call-site migration
**Deps**: archive/tickets/SEATRES/SEATRES-024-extract-shared-data-asset-selection-policy-for-compiler-and-validator.md

## Problem

The current shared selection policy helper requires a diagnostics array and diagnostic dialect callbacks even for non-diagnostic consumers. This leaks validator/compiler diagnostic concerns into pure selection flows (for example token-trait vocabulary derivation), weakening separation of concerns and making generic policy usage noisier.

## Assumption Reassessment (2026-03-02)

1. `scenario-linked-asset-selection-policy.ts` centralizes selection semantics, but currently couples selection and diagnostic emission in the same API surface.
2. `token-trait-vocabulary.ts` must allocate a throwaway diagnostics array solely to satisfy policy helper signatures.
3. No active ticket in `tickets/*` currently scopes splitting this API into pure selection core + optional diagnostic adapters.

## Architecture Check

1. Separating pure selection from diagnostic emission yields cleaner architecture: deterministic policy decisions can be reused by any game-agnostic subsystem without diagnostic coupling.
2. This preserves GameSpecDoc vs GameDef/runtime boundaries by keeping shared policy generic and avoiding surface-specific leakage.
3. No compatibility aliases/shims: migrate existing callers to the new layered API and remove old coupled signatures.

## What to Change

### 1. Introduce layered policy API

1. Refactor `scenario-linked-asset-selection-policy.ts` into:
   - pure selection functions (no diagnostics dependency)
   - optional adapter helpers to map selection results into diagnostics for compiler/validator surfaces
2. Keep failure-reason/result contracts explicit and typed.

### 2. Migrate current call sites

1. Update compiler and validator to call pure selection + explicit diagnostic adapter handling.
2. Update token-trait vocabulary to call pure selection only (no diagnostics array allocation).
3. Remove deprecated coupled helper signatures after migration.

### 3. Expand contract tests

1. Add/adjust tests to validate:
   - pure selection outputs are unchanged
   - diagnostic adapter behavior remains equivalent for compiler/validator dialects
   - non-diagnostic consumers require no diagnostic plumbing

## Files to Touch

- `packages/engine/src/cnl/scenario-linked-asset-selection-policy.ts` (modify)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/token-trait-vocabulary.ts` (modify)
- `packages/engine/test/unit/data-asset-selection-policy.test.ts` (modify/add)
- `packages/engine/test/unit/token-trait-vocabulary.test.ts` (modify/add)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)

## Out of Scope

- Changing diagnostic taxonomy/code naming
- Kernel/runtime data-asset loading behavior
- Visual configuration (`visual-config.yaml`) concerns

## Acceptance Criteria

### Tests That Must Pass

1. Pure selection helpers are callable without diagnostics objects and preserve current selection semantics.
2. Compiler/validator diagnostics for scenario-linked selection failures remain behaviorally equivalent.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selection policy core is diagnostic-agnostic and reusable across game-agnostic engine paths.
2. Surface-specific diagnostics are produced only by explicit adapter logic, not embedded in policy core.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/data-asset-selection-policy.test.ts` — add pure-core + adapter parity cases. Rationale: locks separation-of-concerns contract and behavior parity.
2. `packages/engine/test/unit/token-trait-vocabulary.test.ts` — assert no diagnostic-coupled invocation required for derivation. Rationale: verifies consumer decoupling.
3. `packages/engine/test/unit/compiler-structured-results.test.ts` and `packages/engine/test/unit/validate-spec-scenario.test.ts` — retain parity assertions for scenario-selector/asset-selection failures. Rationale: ensures migration does not alter externally expected diagnostics.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/data-asset-selection-policy.test.js`
3. `node --test packages/engine/dist/test/unit/token-trait-vocabulary.test.js`
4. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
5. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo typecheck && pnpm turbo lint`
