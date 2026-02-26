# ENGINEARCH-043: Add explicit addVar boolean-target regression coverage for global/pvar scopes

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator unit-test hardening
**Deps**: none

## Problem

Recent zoneVar diagnostic-ownership cleanup removed boolean-target diagnostics for `addVar` zoneVar paths, but current tests do not explicitly assert that `ADDVAR_BOOLEAN_TARGET_INVALID` still fires for `global` and `pvar` scopes. This leaves a regression hole in validator behavior contracts.

## Assumption Reassessment (2026-02-26)

1. `addVar` boolean-target diagnostics are still expected for `globalVars` and `perPlayerVars` boolean definitions.
2. `validate-gamedef.test.ts` currently asserts negative zoneVar behavior (`ADDVAR_BOOLEAN_TARGET_INVALID` absent for invalid boolean zoneVars) but lacks dedicated positive tests for non-zone scopes.
3. **Mismatch + correction**: diagnostic ownership moved correctly for zoneVar, but guardrail tests for global/pvar behavior parity are missing and should be added.

## Architecture Check

1. Explicit positive-scope tests are cleaner than relying on incidental coverage; they pin intent at the contract boundary.
2. This is game-agnostic validator coverage and does not introduce game-specific logic into `GameDef` or simulation.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Add focused validator tests for global/pvar boolean addVar targets

Add unit tests that construct minimal invalid `addVar` effects targeting:
- `scope: 'global'` with a boolean global var
- `scope: 'pvar'` with a boolean per-player var

and assert `ADDVAR_BOOLEAN_TARGET_INVALID` appears at the expected path.

### 2. Keep zoneVar ownership assertion unchanged

Retain existing assertions that invalid boolean zoneVars emit structure-layer diagnostics (`ZONE_VAR_TYPE_INVALID`) and do not emit zoneVar addVar boolean-target diagnostics.

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
