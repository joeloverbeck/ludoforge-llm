# TOKFILT-003: Add complete token-filter surface regression coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel validator tests
**Deps**: archive/tickets/TOKFILT-001-kernel-token-filter-prop-validation-parity.md, archive/tickets/TOKFILT-002-compiler-token-filter-prop-contract-strictness.md

## Problem

Current regression coverage does not explicitly pin unknown token-filter prop diagnostics on all token-filter-bearing kernel validation surfaces. This leaves room for future drift where one surface stops validating prop names.

## Assumption Reassessment (2026-03-01)

1. `validate-gamedef.test.ts` already covers unknown-prop behavior for `tokensInZone` and `tokensInMapSpaces`.
2. There are still no direct unknown-prop behavior-validation tests for `tokensInAdjacentZones`, `effect.reveal.filter`, and `effect.conceal.filter`.
3. `compile-conditions.test.ts` already includes `tokensInAdjacentZones` lowering parity coverage, so the gap tracked by this ticket is kernel behavior-validation regression coverage, not compiler lowering.
4. Kernel behavior validation currently applies token-filter prop checks on five surfaces: `tokensInZone.filter`, `tokensInAdjacentZones.filter`, `tokensInMapSpaces.filter`, `reveal.filter`, `conceal.filter`.

## Architecture Check

1. Surface-complete contract tests are beneficial over current architecture because token-filter prop validation is centralized and shared (`validateTokenFilterPredicates`) but invoked from multiple query/effect entry points; per-surface regression tests guard against call-site drift.
2. No architecture change is required in engine code; strengthening tests is the cleanest robust/extensible step for this ticket.
3. Tests remain game-agnostic and enforce strict unknown-prop rejection (no compatibility aliases).

## What to Change

### 1. Add kernel validator regression tests for missing surfaces

Add explicit unknown token-filter prop rejection tests for:

1. `tokensInAdjacentZones.filter`
2. `effect.reveal.filter`
3. `effect.conceal.filter`

### 2. Add positive controls for allowed props on those surfaces

Ensure each added surface includes acceptance assertions for intrinsic `id` and/or declared props.

### 3. Keep diagnostic path/code stability checks

Assert both diagnostic code and diagnostic path for each surface to prevent accidental path drift.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Changing runtime/filter execution semantics
- Compiler context derivation policy (TOKFILT-002)
- Runner/UI/`visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Unknown token-filter props are rejected on all token-filter-bearing query/effect surfaces currently supported by kernel behavior validation.
2. Intrinsic `id` and declared props remain accepted on those surfaces.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Contract coverage is exhaustive for current kernel token-filter surfaces.
2. Diagnostic code/path remain deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add unknown-prop + acceptance tests for `tokensInAdjacentZones`.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — add unknown-prop + acceptance tests for `reveal.filter`.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — add unknown-prop + acceptance tests for `conceal.filter`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm turbo test`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-01
- **What changed**:
  - Reassessed and corrected assumptions/scope to reflect current code/test reality.
  - Added missing kernel behavior-validation regression tests for unknown token-filter props on:
    - `tokensInAdjacentZones.filter`
    - `effects[].reveal.filter`
    - `effects[].conceal.filter`
  - Added acceptance tests on those same surfaces for intrinsic `id` and declared props.
- **Deviations from original plan**:
  - Kept scope strictly in `validate-gamedef.test.ts`; no compiler test edits were needed because compiler already had `tokensInAdjacentZones` lowering parity coverage.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
