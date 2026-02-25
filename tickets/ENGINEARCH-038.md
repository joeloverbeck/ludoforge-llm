# ENGINEARCH-038: Suppress dependent zoneVar xref diagnostics when zoneVars contract fails in compiler

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL compile section-failure gating + compile-path tests
**Deps**: none

## Problem

CNL compilation now emits `CNL_COMPILER_ZONE_VAR_TYPE_INVALID` for boolean `doc.zoneVars`, but still emits dependent `CNL_XREF_ZONEVAR_MISSING` diagnostics from cross-validation in the same pass. This is a misleading cascade: once the zoneVars section is contract-invalid, dependent zoneVar xref checks should be suppressed.

## Assumption Reassessment (2026-02-25)

1. `compileExpandedDoc` currently filters invalid zoneVars after `compileSection` and leaves `sections.zoneVars` as `[]` instead of `null`.
2. `crossValidateSpec` uses section nullability to suppress dependent diagnostics.
3. **Mismatch + correction**: zoneVars contract failures must mark `sections.zoneVars` unavailable (`null`) for cross-validation gating, consistent with compiler policy comments and existing dependency-aware behavior.

## Architecture Check

1. Dependency-aware diagnostic gating is cleaner and more robust than emitting known cascades from already-invalid prerequisites.
2. This change stays game-agnostic (compiler contract behavior only) and does not introduce game-specific branching in `GameDef`/runtime.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Fix section-failure propagation for invalid zoneVars in compiler

Update `compileExpandedDoc` so any zoneVars contract error (including non-int entries) marks the zoneVars section as failed for cross-validation (`sections.zoneVars = null`), while preserving the primary contract diagnostic.

### 2. Add compile-path regression tests

Add explicit compile tests proving:
- invalid boolean `doc.zoneVars` yields contract error without dependent zoneVar xref cascade.
- valid int `doc.zoneVars` still supports downstream zoneVar references.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)

## Out of Scope

- Runtime `validateGameDef` behavior changes
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

1. `packages/engine/test/unit/compile-top-level.test.ts` — boolean `doc.zoneVars` compile test verifies primary contract diagnostic and no dependent xref cascade.
2. `packages/engine/test/unit/compile-top-level.test.ts` — valid int `doc.zoneVars` compile test verifies no regression in zoneVar references.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/compile-top-level.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
