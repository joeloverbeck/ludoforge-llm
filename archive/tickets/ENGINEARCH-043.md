# ENGINEARCH-043: Add explicit addVar boolean-target regression coverage for global/pvar scopes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator unit-test hardening
**Deps**: none

## Problem

Recent zoneVar diagnostic-ownership cleanup removed boolean-target diagnostics for `addVar` zoneVar paths, but current tests do not explicitly assert that `ADDVAR_BOOLEAN_TARGET_INVALID` still fires for `global` and `pvar` scopes. This leaves a regression hole in validator behavior contracts.

## Assumption Reassessment (2026-02-26)

1. `ADDVAR_BOOLEAN_TARGET_INVALID` is currently implemented in `packages/engine/src/kernel/validate-gamedef-behavior.ts` for `addVar` targets with scope `global` and `pvar` when the target variable type is boolean.
2. `validate-gamedef.test.ts` currently asserts zoneVar ownership behavior (`ZONE_VAR_TYPE_INVALID` present and `ADDVAR_BOOLEAN_TARGET_INVALID` absent for zoneVar boolean targets).
3. **Mismatch + correction**: the implementation is already correct, but positive regression coverage is missing for boolean `global` and `pvar` targets. This ticket is test hardening only.

## Architecture Check

1. Adding explicit positive-scope tests is better than relying on implicit behavior because it protects the validator contract at the exact boundary where regressions can happen.
2. This work is strictly game-agnostic validation coverage and keeps all ownership in shared validator modules.
3. The current architecture (structure-layer zoneVar typing + behavior-layer non-zone boolean addVar guard) is cleaner and more extensible than collapsing all scope logic into one layer; no architecture change is needed beyond test hardening.

## What to Change

### 1. Add focused validator tests for global/pvar boolean addVar targets

Add unit tests that construct minimal invalid `addVar` effects targeting:
- `scope: 'global'` with a boolean global var
- `scope: 'pvar'` with a boolean per-player var

and assert `ADDVAR_BOOLEAN_TARGET_INVALID` appears at the expected path.

### 2. Keep zoneVar ownership assertion unchanged

Retain existing assertions that invalid boolean zoneVars emit structure-layer diagnostics (`ZONE_VAR_TYPE_INVALID`) and do not emit zoneVar addVar boolean-target diagnostics.

### 3. Scope confirmation

No runtime/kernel behavior changes. No schema changes. No production code edits expected.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime effect semantics changes
- TransferVar diagnostics changes
- CNL compile-path diagnostic behavior

## Acceptance Criteria

### Tests That Must Pass

1. `ADDVAR_BOOLEAN_TARGET_INVALID` is explicitly asserted for boolean `global` addVar targets.
2. `ADDVAR_BOOLEAN_TARGET_INVALID` is explicitly asserted for boolean `pvar` addVar targets.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Boolean addVar diagnostic behavior remains explicit and deterministic for non-zone scopes.
2. ZoneVar int-only contract ownership remains at structure validation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add positive `global` boolean addVar diagnostic assertion.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — add positive `pvar` boolean addVar diagnostic assertion.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Reassessed and corrected ticket assumptions to reflect current implementation ownership in `validate-gamedef-behavior.ts`.
  - Added explicit validator regression tests for boolean `addVar` targets in `global` and `pvar` scopes.
- Deviations from original plan:
  - None on implementation scope; this remained test-only hardening.
  - Clarified architecture assessment in-ticket before implementation.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (287/287).
  - `pnpm -F @ludoforge/engine lint` passed.
