# PIPEVAL-006: Expand malformed ActionPipeline regression coverage matrix

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Test-only — validator regression coverage
**Deps**: `tickets/PIPEVAL-005-harden-actionpipeline-required-field-handling-in-validator.md`

## Problem

Current pipeline hardening regression coverage is too narrow: it only checks missing `costEffects`. Other malformed required fields in `actionPipelines` can regress undetected if tests do not explicitly assert non-throwing validation behavior and expected diagnostics.

## Assumption Reassessment (2026-03-05)

1. A single non-throwing test exists for missing `costEffects`, but no matrix coverage exists for missing `stages`/`targeting`.
2. `validate-gamedef.test.ts` already carries many malformed-input contract tests and is the correct place for this coverage.
3. This test scope is not duplicative with `PIPEVAL-002` (boilerplate refactor); this ticket focuses on malformed-input invariants and diagnostic expectations.

## Architecture Check

1. Contract tests for malformed inputs are a long-term architecture guardrail: they prevent validator regressions as schema/runtime boundaries evolve.
2. Tests remain game-agnostic and validate generic kernel behavior; no game-specific fixture assumptions are introduced.
3. No compatibility shims: tests lock strict behavior expectations for malformed input handling.

## What to Change

### 1. Add table-driven malformed pipeline tests

Add a compact table-driven suite covering:
- missing `costEffects`
- missing `stages`
- missing `targeting`
- combinations of missing required fields

Each case should assert:
- `validateGameDef` does not throw
- expected diagnostic code/path set includes required-field diagnostics (where applicable)

### 2. Tighten assertions beyond `Array.isArray`

Replace weak assertions with deterministic diagnostic expectations:
- specific diagnostic codes
- stable path anchors (for example `actionPipelines[0].stages`)

### 3. Keep tests DRY with localized helpers

Use local helper(s) in `validate-gamedef.test.ts` to generate malformed pipeline variants without repeating full GameDef scaffolding.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in kernel code
- Non-pipeline malformed-input matrices
- Refactoring broad test scaffolding unrelated to malformed `actionPipelines`

## Acceptance Criteria

### Tests That Must Pass

1. Matrix tests prove malformed `actionPipelines` required-field omissions do not throw.
2. Matrix tests assert expected diagnostics per missing-field case.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Validator malformed-input behavior stays deterministic and non-throwing.
2. Test coverage remains game-agnostic and independent from visual configuration concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add table-driven malformed `actionPipelines` regression cases with explicit diagnostic expectations.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

