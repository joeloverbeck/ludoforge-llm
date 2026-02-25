# ENGINEARCH-035: Restore exhaustive valid-scope coverage for setVar/addVar schema tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit-test contract coverage hardening
**Deps**: none

## Problem

Recent matrix-driven schema tests improved drift resistance for invalid endpoint shapes, but reduced explicit positive coverage for `setVar`/`addVar` valid scope payloads (`global`, `pvar`, `zoneVar`). This creates a test blind spot where valid-branch regressions could slip through while invalid-shape checks still pass.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/test/unit/schemas-ast.test.ts` derives `setVar`/`addVar` endpoint-shape checks from `buildDiscriminatedEndpointMatrix`.
2. `buildDiscriminatedEndpointMatrix` currently returns:
   - invalid `from`/`to` permutations for forbidden/missing branch fields
   - one valid control case: `from=pvar`, `to=zoneVar`
3. **Verified discrepancy**: `setVar`/`addVar` tests select only one endpoint from each matrix case, so their valid branch currently covers only `pvar` from the control case, not all valid scopes.
4. Existing file-level parse examples provide incidental validity coverage (`setVar` global, `addVar` pvar) but still do not provide explicit exhaustive `global`/`pvar`/`zoneVar` acceptance checks per operation.

## Architecture Check

1. Keeping matrix-driven invalid checks is still the strongest anti-drift mechanism for required/forbidden field contracts.
2. Adding explicit positive scope-acceptance checks for single-endpoint operations (`setVar`, `addVar`) is more robust than inferring validity from one matrix control case.
3. Preferred test architecture: reuse shared constants/helpers for scope payload construction to stay DRY while preserving explicitness.
4. This remains game-agnostic kernel contract work; no game-specific logic, aliases, or backward-compatibility shims are introduced.

## What to Change

### 1. Reinstate explicit valid payload assertions per scope

Add explicit positive assertions for `setVar` and `addVar` across all valid scopes:
- `global`
- `pvar`
- `zoneVar`

### 2. Keep matrix-driven invalid checks unchanged

Retain matrix-based invalid/forbidden field checks to preserve anti-drift breadth.

### 3. Keep test structure maintainable

Implement the explicit positive cases with shared payload builders/constants (in-file or helper-level) to avoid duplicating scope-shape literals.

## Files to Touch

- `packages/engine/test/unit/schemas-ast.test.ts` (modify)

## Out of Scope

- Engine runtime/schema implementation changes
- Trace schema contract changes

## Acceptance Criteria

### Tests That Must Pass

1. `setVar` schema test explicitly validates all three valid scoped payloads.
2. `addVar` schema test explicitly validates all three valid scoped payloads.
3. Existing matrix invalid-shape checks continue to pass unchanged.
4. Focused suite: `pnpm -F @ludoforge/engine build && node --test dist/test/unit/schemas-ast.test.js`
5. Engine lint/typecheck/test quality gate remains green.

### Invariants

1. Scope-contract tests verify both forbidden-field rejection and valid-branch acceptance.
2. Coverage is contract-centric and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — add explicit valid `global`/`pvar`/`zoneVar` cases for `setVar`.
2. `packages/engine/test/unit/schemas-ast.test.ts` — add explicit valid `global`/`pvar`/`zoneVar` cases for `addVar`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/schemas-ast.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine typecheck`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Updated `packages/engine/test/unit/schemas-ast.test.ts` to add explicit positive coverage for `setVar` and `addVar` across all valid scopes (`global`, `pvar`, `zoneVar`).
  - Kept existing matrix-driven invalid endpoint checks for both operations unchanged.
  - Introduced a shared `validScopedVarEndpoints` fixture in the test file to avoid duplicated scope payload literals.
- **Deviations from original plan**:
  - No functional deviation; implementation followed plan and additionally clarified assumptions/scope wording in this ticket before code changes.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/schemas-ast.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine test` passed (`278` passed, `0` failed).
