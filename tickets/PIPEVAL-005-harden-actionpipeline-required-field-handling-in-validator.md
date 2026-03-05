# PIPEVAL-005: Harden ActionPipeline required-field handling in validator

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/validate-gamedef-extensions.ts`, diagnostics registration
**Deps**: `archive/tickets/PIPEVAL-001-defensive-guard-costeffects-in-pipeline-validation.md`

## Problem

`validateActionPipelines` still assumes some required `ActionPipelineDef` fields are always present (`stages`, `targeting`) and can throw on malformed payloads before emitting diagnostics. This violates the validator invariant that malformed `GameDef` input should produce diagnostics, not runtime exceptions.

## Assumption Reassessment (2026-03-05)

1. `ActionPipelineDef.stages` and `ActionPipelineDef.targeting` are required in types, but malformed `as unknown as GameDef` inputs can omit them.
2. Current code reads `actionPipeline.stages.length` and `actionPipeline.targeting.filter` without a defensive normalization step.
3. Existing active tickets (`PIPEVAL-003`, `PIPEVAL-004`) do not cover required-field hardening for `stages`/`targeting`; scope is distinct and additive.

## Architecture Check

1. Normalize malformed pipeline payload shapes once at validator entry, then validate against normalized values. This is cleaner and more robust than scattered ad-hoc null checks.
2. Keep behavior game-agnostic: field-shape validation is generic kernel validation, with no game-specific branches.
3. No backward-compatibility aliasing/shims: malformed payloads are diagnosed with explicit diagnostics; valid payload behavior is unchanged.

## What to Change

### 1. Normalize required pipeline collections/objects before use

In `validateActionPipelines`, derive normalized locals:

- `const stages = actionPipeline.stages ?? []`
- `const targeting = actionPipeline.targeting ?? {}`

Use `stages` and `targeting` for all downstream validation so malformed payloads cannot throw.

### 2. Emit explicit diagnostics for missing required fields

When `actionPipeline.stages` or `actionPipeline.targeting` is missing/invalid shape, emit error diagnostics instead of throwing.

Candidate codes:
- `ACTION_PIPELINE_STAGES_MISSING`
- `ACTION_PIPELINE_TARGETING_MISSING`

Register any new codes in the project’s diagnostic registries/contract tests if required by existing policy checks.

### 3. Preserve existing validation semantics for valid payloads

Maintain current diagnostics for empty `stages`, invalid `atomicity`, unknown `actionId`, and AST validations. The change is strictly crash-hardening + explicit malformed-field diagnostics.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/reference-diagnostic-codes.ts` (modify if new codes are contract-tracked)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/kernel/reference-diagnostic-codes.test.ts` (modify if registry parity requires)

## Out of Scope

- `linkedWindows` reference validation (covered by `archive/tickets/PIPEVAL-003-validate-pipeline-linkedwindows-against-overridewindows.md`)
- `accompanyingOps` reference validation (covered by `tickets/PIPEVAL-004-validate-pipeline-accompanyingops-against-actions.md`)
- Broad validator-wide refactors outside `validateActionPipelines`

## Acceptance Criteria

### Tests That Must Pass

1. Missing `actionPipelines[*].stages` does not throw and produces explicit diagnostic(s).
2. Missing `actionPipelines[*].targeting` does not throw and produces explicit diagnostic(s).
3. Existing valid pipeline fixtures continue to validate as before (no regression diagnostics).
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. `validateGameDef` remains total (non-throwing) for malformed `actionPipelines` entries.
2. Kernel validation remains game-agnostic and independent of visual config concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add malformed pipeline tests for missing `stages` and missing `targeting`, asserting no throw and expected diagnostics.
2. `packages/engine/test/unit/kernel/reference-diagnostic-codes.test.ts` — update only if new diagnostic code registration is required.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

