# SEATRES-043: Enforce strict scenario selector failure in token-trait vocabulary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL token-trait vocabulary selection semantics + unit coverage
**Deps**: archive/tickets/SEATRES/SEATRES-024-extract-shared-data-asset-selection-policy-for-compiler-and-validator.md

## Problem

`deriveTokenTraitVocabularyFromGameSpecDoc()` can still derive a vocabulary via singleton piece-catalog inference even when `metadata.defaultScenarioAssetId` is explicitly set but does not resolve. This permissive fallback weakens explicit-selection invariants and makes behavior less predictable for generic GameSpecDoc-driven compilation.

## Assumption Reassessment (2026-03-02)

1. `token-trait-vocabulary.ts` now uses shared scenario-linked selection policy helpers, but does not gate downstream inference on explicit scenario-selector failure.
2. Compiler/validator paths already enforce explicit scenario-selector failures with diagnostics and no dependent inference on failure.
3. No active ticket in `tickets/*` currently scopes strict-failure behavior for token-trait vocabulary derivation.

## Architecture Check

1. Enforcing fail-fast behavior on explicit selector failure is cleaner than permissive fallback because one explicit source of truth (`metadata.defaultScenarioAssetId`) must either resolve or block dependent derivation.
2. This preserves boundaries: GameSpecDoc remains the only game-specific input, while derivation logic remains game-agnostic and deterministic.
3. No backwards-compatibility aliasing/shims: unresolved explicit selectors fail hard for this derivation path.

## What to Change

### 1. Harden token-trait scenario-selection gating

1. In `deriveTokenTraitVocabularyFromGameSpecDoc`, treat explicit scenario-selector `missing-reference` as a hard stop (`null` result), with no singleton fallback to piece-catalog inference.
2. Keep existing behavior for omitted selector (`undefined`) where inference remains allowed per shared selection policy.

### 2. Add strict-failure regression coverage

1. Add/extend token-trait vocabulary unit tests for:
   - explicit unknown `defaultScenarioAssetId` + single pieceCatalog => `null`
   - omitted `defaultScenarioAssetId` + single pieceCatalog => still derives vocabulary
2. Ensure tests explicitly assert this no-fallback contract.

## Files to Touch

- `packages/engine/src/cnl/token-trait-vocabulary.ts` (modify)
- `packages/engine/test/unit/token-trait-vocabulary.test.ts` (modify/add)

## Out of Scope

- Compiler/validator diagnostic code changes
- Runtime/kernel selection behavior changes
- Visual configuration (`visual-config.yaml`) behavior

## Acceptance Criteria

### Tests That Must Pass

1. Token-trait vocabulary returns `null` when explicit `metadata.defaultScenarioAssetId` is unknown, regardless of singleton piece-catalog availability.
2. Token-trait vocabulary still derives from singleton piece catalog when no explicit scenario selector is provided.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Explicit scenario selection in GameSpecDoc is authoritative for token-trait derivation and does not silently fallback.
2. Derivation behavior remains game-agnostic and independent of any game-specific hardcoded branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-trait-vocabulary.test.ts` — add strict explicit-selector-missing test. Rationale: blocks regression to permissive fallback semantics.
2. `packages/engine/test/unit/token-trait-vocabulary.test.ts` — retain/verify omitted-selector singleton inference test. Rationale: preserves intended inference path when selector is not explicitly declared.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/token-trait-vocabulary.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
