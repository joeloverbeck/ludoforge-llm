# FITLRULES2-013: Strengthen Turn-Flow Action-Class Mapping Semantics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL cross-validation and compiler diagnostics
**Deps**: `specs/00-fitl-implementation-order.md`, `reports/fire-in-the-lake-rules-section-2.md`

## Problem

The current map validation ensures key/type correctness and action existence, but does not enforce stronger semantic invariants. This allows under-classified or misclassified actions that degrade turn-flow behavior at runtime.

## Assumption Reassessment (2026-02-23)

1. Compiler/validator checks map structure and class literal validity.
2. Cross-validation currently checks only that mapped action ids exist.
3. Mismatch correction: add semantic invariants for required mappings and class coherence with action capabilities.

## Architecture Check

1. Strong semantic validation at compile time is cleaner than deferring surprises to runtime legality.
2. Game-specific mapping data stays in `GameSpecDoc`; simulation remains generic by consuming validated normalized contracts.
3. No compatibility shims: invalid or incomplete mappings are hard errors.

## What to Change

### 1. Add semantic mapping invariants

Introduce diagnostics for:
- declared pass action not mapped to `pass`
- declared card event action not mapped to `event`
- required turn-flow-participating action ids missing from map

### 2. Define participation rule centrally

Add one reusable rule for what actions are considered turn-flow-participating in card-driven mode, and use it consistently in compile/cross-validation.

### 3. Improve diagnostics quality

Emit precise paths and actionable suggestions for missing or misclassified action mappings.

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Runtime legality algorithm redesign
- Runner visualization contract changes
- FITL action redesign beyond fixing invalid mappings discovered by diagnostics

## Acceptance Criteria

### Tests That Must Pass

1. Missing required mappings fail compile with clear path-level diagnostics.
2. Misclassified pass/event mappings fail compile with explicit correction guidance.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Card-driven turn-flow map is semantically complete for all required participating actions.
2. Validation/compile logic remains game-agnostic and reusable for any card-driven game.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate.test.ts` — missing/unknown/misclassified mapping diagnostics.
2. `packages/engine/test/unit/compile-top-level.test.ts` — blocking compile outcomes for semantic mapping violations.
3. `packages/engine/test/unit/validate-spec.test.ts` — structural + semantic map validation coverage.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
