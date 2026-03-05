# PIPEVAL-006: Expand malformed ActionPipeline regression coverage matrix

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Test-only — validator regression coverage
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-005-harden-actionpipeline-required-field-handling-in-validator.md`

## Problem

Current pipeline hardening regression coverage is too narrow: it only checks missing `costEffects`. Other malformed required fields in `actionPipelines` can regress undetected if tests do not explicitly assert non-throwing validation behavior and expected diagnostics.

## Assumption Reassessment (2026-03-05)

1. `validate-gamedef.test.ts` already includes explicit non-throwing malformed pipeline tests for:
   - missing `costEffects`
   - missing `stages` (+ `ACTION_PIPELINE_STAGES_MISSING`)
   - missing `targeting` (+ `ACTION_PIPELINE_TARGETING_MISSING`)
   - `stages: null` / `targeting: null` runtime-shape hardening
2. The current gap is not absence of coverage, but lack of a compact matrix across omission combinations and weak assertion shape in the missing-`costEffects` case (`Array.isArray` only).
3. `validate-gamedef.test.ts` remains the correct location; scope is still test-only and non-duplicative with `PIPEVAL-002` (boilerplate helpers) and `PIPEVAL-005` (validator behavior hardening).

## Architecture Check

1. Consolidating repeated malformed-field tests into a table-driven matrix improves long-term maintainability without changing validator behavior.
2. Deterministic assertions on `(code, path)` pairs are stronger architecture guardrails than structural assertions like `Array.isArray`.
3. Tests remain game-agnostic and validate generic kernel behavior; no compatibility shims or game-specific branches.

## What to Change

### 1. Replace scattered omission tests with one table-driven matrix

Cover omission permutations in one compact suite:
- missing `costEffects`
- missing `stages`
- missing `targeting`
- missing `stages` + `targeting`
- missing `costEffects` + `stages` + `targeting`

Each row must assert:
- `validateGameDef` does not throw
- expected `(diagnostic code, path)` pairs are present for omitted required fields
- unexpected required-field diagnostics are absent

### 2. Remove weak assertion shape in missing-`costEffects` case

Eliminate the current `Array.isArray`-only assertion and replace it with deterministic diagnostic expectations tied to stable paths.

### 3. Keep tests DRY with localized helpers

Use a local helper to build malformed pipeline variants by field omission so full GameDef scaffolding is not repeated per case.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in kernel code
- Non-pipeline malformed-input matrices
- Refactoring broad test scaffolding unrelated to malformed `actionPipelines`

## Acceptance Criteria

### Tests That Must Pass

1. Table-driven matrix proves malformed `actionPipelines` omission permutations do not throw.
2. Matrix rows assert exact expected `(code, path)` required-field diagnostics and absence expectations.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Validator malformed-input behavior stays deterministic and non-throwing.
2. Test coverage remains game-agnostic and independent from visual configuration concerns.
3. Ticket remains test-only: no validator runtime behavior changes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add table-driven malformed `actionPipelines` regression cases with explicit diagnostic expectations.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Replaced three separate omission tests plus the weak missing-`costEffects` assertion with one table-driven omission matrix in `validate-gamedef.test.ts`.
  - Added a local helper (`withMalformedPipelineOmissions`) to generate malformed `actionPipelines` variants without repeated GameDef scaffolding.
  - Matrix now covers omission permutations:
    - missing `costEffects`
    - missing `stages`
    - missing `targeting`
    - missing `stages` + `targeting`
    - missing `costEffects` + `stages` + `targeting`
  - Strengthened assertions to deterministic required-field checks by exact `(code, path)` pairs for:
    - `ACTION_PIPELINE_STAGES_MISSING` at `actionPipelines[0].stages`
    - `ACTION_PIPELINE_TARGETING_MISSING` at `actionPipelines[0].targeting`
  - Added explicit absence assertions where diagnostics should not appear.
- **Deviations from original plan**:
  - Reassessed assumptions first and corrected stale ticket claims before implementation: existing explicit tests for missing `stages`/`targeting` were already present.
  - Scope remained test-only, with no runtime validator changes.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` ✅
  - `pnpm turbo test --force` ✅
  - `pnpm turbo lint` ✅
