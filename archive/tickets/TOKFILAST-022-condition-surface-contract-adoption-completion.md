# TOKFILAST-022: Complete Condition-Surface Contract Adoption and Coverage Parity

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator condition-path construction + unit coverage
**Deps**: archive/tickets/TOKFILAST-017-conditionast-empty-args-surface-coverage-hardening.md

## Problem

Condition-surface path centralization is partially implemented, but one validator callsite (`actions[].pre`) still constructs condition paths inline. In addition, current cross-surface tests do not yet assert parity for `actionPipelines[].legality` and `actionPipelines[].costValidation`.

## Assumption Reassessment (2026-03-06)

1. A shared condition-surface contract now exists and is used by most validator surfaces.
2. `validate-gamedef-core.ts` still calls `validateConditionAst` for `actions[].pre` with a raw string path, bypassing the contract helper.
3. Current cross-surface empty-args ConditionAST validator test covers action-pipeline `applicability`, `targeting.filter`, and terminal checkpoint surfaces, but not `legality` or `costValidation`; scope must include both.
4. `CONDITION_SURFACE_SUFFIX` already exposes `actionPipelineLegality` and `actionPipelineCostValidation`, so parity can be added by extending the existing table-driven test (no new contract API needed).

## Architecture Check

1. Completing contract adoption removes path-string drift and keeps condition diagnostics deterministic from one source of truth.
2. This remains game-agnostic infrastructure work in validator/test layers; no game-specific logic enters GameDef/runtime/kernel.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Route `actions[].pre` path through condition-surface contract helper

Replace the inline `actions[${actionIndex}].pre` string callsite in validator core with the shared contract path helper.

### 2. Expand action-pipeline condition surface parity tests

Extend the table-driven cross-surface test to assert empty-args diagnostics on:
- `actionPipelines[].legality`
- `actionPipelines[].costValidation`
using existing `CONDITION_SURFACE_SUFFIX` entries.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-core.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Token-filter traversal/operator hardening tickets (`TOKFILAST-018..021`).
- Runtime evaluation semantics changes for ConditionAST.

## Acceptance Criteria

### Tests That Must Pass

1. `actions[].pre` condition diagnostics still resolve to deterministic path/code using shared contract helpers.
2. Empty-args condition diagnostics are explicitly asserted for pipeline `legality` and `costValidation` surfaces.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Top-level validator condition surfaces use the shared condition-surface path contract instead of raw string literals.
2. Validator remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add action-pipeline legality/costValidation surface assertions to lock parity with other condition surfaces.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - `packages/engine/src/kernel/validate-gamedef-core.ts`: replaced inline `actions[${actionIndex}].pre` condition path literal with `conditionSurfacePathForActionPre(actionIndex)`.
  - `packages/engine/test/unit/validate-gamedef.test.ts`: extended the condition-surface empty-args parity table with `actionPipelines.legality` and `actionPipelines.costValidation` cases.
- Deviations from original plan:
  - No deviations in implementation scope.
  - Ticket assumptions were refined before implementation to reflect current test coverage and existing contract suffix support.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
