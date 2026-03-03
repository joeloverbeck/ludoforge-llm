# SEATRES-056: Add CNL identifier-normalization single-source boundary guard

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL architecture guardrail test policy
**Deps**: archive/tickets/SEATRES/SEATRES-039-unify-cnl-identifier-normalization-and-selection-alternatives.md

## Problem

The architecture now relies on a single canonical `normalizeIdentifier` utility in `identifier-utils.ts`. Without an explicit guard, future refactors can accidentally reintroduce local copies or prohibited imports, recreating compile/validator coupling drift.

## Assumption Reassessment (2026-03-03)

1. Canonical identifier normalization currently exists only in `packages/engine/src/cnl/identifier-utils.ts`. **Verified.**
2. There is currently no dedicated lint/policy test preventing duplicate `normalizeIdentifier` implementations in CNL source. **Verified.**
3. No active ticket in `tickets/*` currently scopes this specific architectural guardrail. **Verified.**

## Architecture Check

1. A static policy guard is cleaner than relying on reviewer memory to preserve single-source normalization.
2. The guard is game-agnostic infrastructure enforcement and keeps game-specific behavior in `GameSpecDoc` data, not engine code paths.
3. No backwards-compatibility aliasing/shims; this codifies the current strict architecture as an invariant.

## What to Change

### 1. Add single-source normalization policy test

Add a lint-style unit test that scans `packages/engine/src/cnl` and asserts:
- exactly one exported `normalizeIdentifier` implementation (in `identifier-utils.ts`)
- no local `normalizeIdentifier` function definitions in other CNL modules

### 2. Add import-boundary assertions

In the same test (or companion test), assert that CNL modules do not import `normalizeIdentifier` from non-canonical modules (for example `validate-spec-shared.ts` or `compile-lowering.ts`).

## Files to Touch

- `packages/engine/test/unit/lint/` (modify/add new policy test)

## Out of Scope

- Changing normalization semantics
- Broad normalization refactors outside identifier-id scope
- Runtime/kernel behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails if any non-canonical CNL file defines `normalizeIdentifier`.
2. Policy test fails if any CNL file imports `normalizeIdentifier` from non-canonical modules.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Identifier normalization remains single-source within CNL.
2. Compile/validator/shared selection flows consume the same canonical normalization contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/<new-normalization-policy-test>.test.ts` — add source-scan assertions for definition/import boundary. Rationale: prevents architectural regression via static enforcement.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/<new-normalization-policy-test>.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
