# SEATRES-058: Extract seat-reference diagnostic suggestion policy module

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL diagnostic policy module boundary
**Deps**: archive/tickets/SEATRES/SEATRES-042-clarify-seat-reference-diagnostic-suggestion-wording.md

## Problem

Seat-reference suggestion policy is centralized as constants but currently lives inside `validate-spec-shared.ts`, which also contains broad validation helpers and schema key lists. This mixed ownership weakens boundary clarity and makes policy evolution harder as diagnostic coverage grows.

## Assumption Reassessment (2026-03-03)

1. Seat-reference fallback suggestion constants are currently defined in `packages/engine/src/cnl/validate-spec-shared.ts` and consumed by compiler/xref/validator paths. **Verified.**
2. Current behavior is functionally correct and tests pass, but ownership is mixed: generic validator utilities and seat-diagnostic language policy coexist in one shared file. **Verified.**
3. Wording coverage for these policies exists across multiple suites, including validator scenario tests (`validate-spec-scenario.test.ts`) in addition to compiler/xref tests. **Verified.**
4. No active ticket in `tickets/` currently scopes extracting seat-reference suggestion policy into a dedicated module. **Verified.**

## Architecture Check

1. A dedicated suggestion-policy module gives a cleaner, explicit boundary for diagnostic language contracts and prevents accidental coupling to unrelated validator internals.
2. This preserves agnostic architecture: policy is compiler/validator/xref infrastructure, not game-specific behavior; GameSpecDoc and visual-config responsibilities remain unchanged.
3. No compatibility aliases or shims; consumers should import canonical symbols from the new module directly.

## What to Change

### 1. Create a dedicated seat-reference suggestion policy module

Add a new CNL module that exports seat-reference suggestion policy constants (including self-or-seat form and selected-catalog form).

### 2. Migrate call sites and remove old exports

Update compiler/xref/validator imports to use the new module, then remove seat suggestion constants from `validate-spec-shared.ts` so there is one canonical policy surface.

### 3. Keep regression coverage green

Ensure existing wording assertions remain valid after import-boundary changes; add/import lint-friendly adjustments as needed.

## Files to Touch

- `packages/engine/src/cnl/seat-reference-diagnostic-suggestion-policy.ts` (new)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (verify/no-op or modify if import-boundary effects require)
- `packages/engine/test/unit/cross-validate.test.ts` (verify/no-op or modify if import-boundary effects require)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (verify/no-op or modify if import-boundary effects require)

## Out of Scope

- Any change to diagnostic codes/messages semantics
- Any seat resolution or scenario selection behavior changes
- Runtime/kernel/simulator behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Compiler/xref/validator seat-reference diagnostics preserve existing wording behavior exactly.
2. No references to seat suggestion policy constants remain in `validate-spec-shared.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Validator scenario coverage remains intact for selected-catalog fallback wording assertions.

### Invariants

1. Diagnostic suggestion policy has a single canonical module owner.
2. GameDef and simulator remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — confirm compiler wording remains unchanged after boundary extraction. Rationale: prevents behavior drift during module move.
2. `packages/engine/test/unit/cross-validate.test.ts` — confirm xref wording remains unchanged after boundary extraction. Rationale: protects multi-surface import migration.
3. `packages/engine/test/unit/validate-spec-scenario.test.ts` — confirm validator wording remains unchanged for selected seat-catalog fallback. Rationale: protects validator diagnostic policy surface from import-boundary regressions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
4. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Added canonical module `packages/engine/src/cnl/seat-reference-diagnostic-suggestion-policy.ts`.
  - Moved seat-reference fallback suggestion constants out of `validate-spec-shared.ts` into that module.
  - Updated consumers to import from the canonical policy module:
    - `packages/engine/src/cnl/compile-data-assets.ts`
    - `packages/engine/src/cnl/cross-validate.ts`
    - `packages/engine/src/cnl/validate-extensions.ts`
  - Corrected ticket assumptions/scope to include existing validator coverage in `validate-spec-scenario.test.ts`.
- **Deviations From Original Plan**:
  - No runtime/diagnostic behavior changes were needed; this remained a strict module-boundary refactor.
  - No test-file edits were required because existing compiler/xref/validator assertions already covered the moved policy constants.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `node --test packages/engine/dist/test/unit/cross-validate.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
