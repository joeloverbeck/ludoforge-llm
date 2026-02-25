# ENGINEARCH-038: Suppress dependent zoneVar xref diagnostics when zoneVars contract fails

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler section-failure propagation + compile-path tests
**Deps**: none

## Problem

CNL compilation emits `CNL_COMPILER_ZONE_VAR_TYPE_INVALID` for boolean `doc.zoneVars`, but still emits dependent `CNL_XREF_ZONEVAR_MISSING` diagnostics later in the same compile call. This is a misleading cascade: once the `zoneVars` section is contract-invalid, downstream zoneVar references should be treated as dependency-blocked for this pass.

## Assumption Reassessment (2026-02-25)

1. `compileExpandedDoc` currently lowers `doc.zoneVars` through generic `lowerVarDefs`, then applies an additional int-only filter for runtime zoneVars.
2. Because int-only enforcement currently happens after `compileSection`, boolean zoneVars add diagnostics but do not flip the section to failed.
3. `crossValidateSpec` does not currently emit zoneVar-missing diagnostics; those arise from boundary validation (`REF_ZONEVAR_MISSING`) and are canonicalized to `CNL_XREF_ZONEVAR_MISSING`.
4. **Mismatch + correction**: treat int-only zoneVars contract violations as section failure in compiler section state (`sections.zoneVars = null`) so dependent validations are gated consistently.

## Architecture Check

1. Dependency-aware diagnostic gating is cleaner and more robust than emitting known cascades from already-invalid prerequisites.
2. This change stays game-agnostic (compiler contract behavior only) and does not introduce game-specific branching in `GameDef`/runtime.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Fix section-failure propagation for invalid zoneVars in compiler

Update `compileExpandedDoc` so any int-only zoneVars contract error (for example boolean entries) marks the zoneVars section as failed (`sections.zoneVars = null`) while preserving the primary contract diagnostic (`CNL_COMPILER_ZONE_VAR_TYPE_INVALID`).

### 2. Add compile-path regression tests

Add explicit compile tests proving:
- invalid boolean `doc.zoneVars` yields contract error without dependent zoneVar xref cascade from boundary/canonicalized diagnostics.
- valid int `doc.zoneVars` still supports downstream zoneVar references.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)

## Out of Scope

- Runtime validation contract changes in `validateGameDef*`
- Schema contract redesign outside compiler diagnostic gating

## Acceptance Criteria

### Tests That Must Pass

1. Compiler emits `CNL_COMPILER_ZONE_VAR_TYPE_INVALID` for boolean zoneVars and suppresses dependent `CNL_XREF_ZONEVAR_MISSING` in that same failure path.
2. Compiler preserves valid int zoneVars reference behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cross-validation emits diagnostics only when prerequisite sections are available.
2. Primary contract errors remain deterministic and non-cascading.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — boolean `doc.zoneVars` compile test verifies primary contract diagnostic and no dependent canonicalized boundary xref cascade.
2. `packages/engine/test/unit/compile-top-level.test.ts` — valid int `doc.zoneVars` compile test verifies no regression in zoneVar references.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/compile-top-level.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - `compileExpandedDoc` now treats non-int `zoneVars` entries as section-failing contract errors and sets `sections.zoneVars` to `null`.
  - Compile diagnostics now suppress dependent `REF_ZONEVAR_MISSING` / `CNL_XREF_ZONEVAR_MISSING` when `sections.zoneVars` is unavailable.
  - Added two compile-path tests covering suppression for invalid boolean zoneVars and non-regression for valid int zoneVar references.
- Deviations from original plan:
  - The original ticket attributed the cascade to `crossValidateSpec`; reassessment showed the cascade originated from boundary validation canonicalization, so the ticket assumptions/scope were corrected before implementation.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (`279` tests).
  - `pnpm -F @ludoforge/engine lint` passed.
