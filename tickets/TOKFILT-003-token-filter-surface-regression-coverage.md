# TOKFILT-003: Add complete token-filter surface regression coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel validator tests (and compiler tests if parity assertions are added)
**Deps**: archive/tickets/TOKFILT-001-kernel-token-filter-prop-validation-parity.md, tickets/TOKFILT-002-compiler-token-filter-prop-contract-strictness.md

## Problem

Current regression coverage does not explicitly pin unknown token-filter prop diagnostics on all token-filter-bearing surfaces. This leaves room for future drift where one surface stops validating prop names.

## Assumption Reassessment (2026-03-01)

1. New unit tests cover unknown-prop behavior for `tokensInZone` and `tokensInMapSpaces`.
2. No direct unknown-prop tests currently pin behavior for `tokensInAdjacentZones`, `reveal.filter`, and `conceal.filter` surfaces.
3. Existing compiler tests focus on `tokensInZone`; cross-surface coverage is not comprehensive.

## Architecture Check

1. Surface-complete tests are the minimum robust guard for contract-level behavior shared across multiple AST/query/effect paths.
2. Tests remain game-agnostic and assert only structural contracts (`prop` validity), not game-specific logic.
3. No compatibility behavior introduced; tests enforce strict failures for unknown props.

## What to Change

### 1. Add kernel validator tests for missing surfaces

Add explicit unknown token-filter prop rejection tests for:

1. `tokensInAdjacentZones.filter`
2. `effect.reveal.filter`
3. `effect.conceal.filter`

### 2. Add positive controls for intrinsic `id` and declared props on those surfaces

Ensure each added surface includes at least one acceptance case for `id` and/or declared props to avoid one-sided regression tests.

### 3. Keep diagnostic path stability checks

Assert both diagnostic code and path for each surface to prevent accidental path drift.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify only if compiler-surface parity checks are added)

## Out of Scope

- Changing runtime/filter execution semantics
- Compiler context derivation policy (TOKFILT-002)
- Runner/UI/`visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Unknown token-filter props are rejected on all token-filter-bearing query/effect surfaces currently supported by kernel validation.
2. Intrinsic `id` remains accepted on those surfaces.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Contract coverage is exhaustive for current token-filter surfaces.
2. Diagnostic code/path remain deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add unknown-prop + acceptance tests for `tokensInAdjacentZones`.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — add unknown-prop + acceptance tests for `reveal.filter`.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — add unknown-prop + acceptance tests for `conceal.filter`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm turbo test && pnpm turbo lint`
