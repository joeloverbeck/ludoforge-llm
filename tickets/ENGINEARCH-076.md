# ENGINEARCH-076: Unify compound/pipeline preflight to remove duplicated kernel validation paths

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel `apply-move.ts` preflight structure + unit regression tests
**Deps**: ENGINEARCH-072 (archived)

## Problem

`apply-move.ts` currently resolves pipeline dispatch and compound timing validity in both `validateMove` and `executeMoveAction`. The duplicate path exists to support `skipValidation` execution flows, but duplicated dispatch/validation logic increases drift risk (future edits can diverge between validation-time and execution-time behavior).

This is an architectural cleanliness issue in core engine flow: one conceptual preflight is represented twice.

## Assumption Reassessment (2026-02-26)

1. `validateMove` computes preflight pipeline context and runs compound timing validation.
2. `executeMoveAction` recomputes pipeline dispatch and reruns compound timing validation.
3. `applyMoveCore` supports `skipValidation: true` (simultaneous commit path), so execution must still be protected by invariant checks.
4. Mismatch + correction: both invariants and pipeline selection should be sourced from a single shared preflight helper/result object, then consumed by both validate and execute flows.

## Architecture Check

1. A single preflight resolver reduces cognitive load and prevents accidental divergence in legality/execution semantics.
2. The refactor is game-agnostic kernel architecture; it does not encode game-specific behavior.
3. No compatibility shims/aliasing: strict behavior is preserved while internals are simplified.

## What to Change

### 1. Introduce a shared move preflight resolver

Create an internal helper (or small struct) in `apply-move.ts` that returns:
- resolved action
- execution player (when available)
- matched action pipeline/derived execution profile
- validated compound timing result

Use this as the source of truth for both validation and execution paths.

### 2. Rewire `validateMove` and `executeMoveAction`

- `validateMove` should consume the shared preflight data instead of recomputing overlapping pieces.
- `executeMoveAction` should consume the same preflight output when available and only compute missing runtime fields as needed.
- Ensure `skipValidation: true` paths still enforce compound/pipeline invariants through the shared helper.

### 3. Add regression coverage for drift-prone paths

Add tests that exercise both normal and `skipValidation`-driven execution behavior (e.g., simultaneous commit) to prove invariant parity.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/integration/` or `packages/engine/test/e2e/` (modify if needed for simultaneous path parity)

## Out of Scope

- Changes to compound move feature semantics
- New runtime reason codes beyond existing taxonomy

## Acceptance Criteria

### Tests That Must Pass

1. Compound timing invariants behave identically in standard validated execution and skip-validation execution contexts.
2. No behavior regression for existing operation pipeline legality/cost preflight checks.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Pipeline/compound preflight has one authoritative implementation path.
2. `skipValidation` cannot bypass compound timing constraints.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — parity assertions for shared preflight behavior
2. `packages/engine/test/integration/*` or `packages/engine/test/e2e/*` — optional parity regression if unit-only coverage is insufficient

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js"`
3. `pnpm -F @ludoforge/engine test`
