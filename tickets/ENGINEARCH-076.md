# ENGINEARCH-076: Add focused regression test for forEach static-bind decision scoping

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: None (ENGINEARCH-075 is a nice-to-have but independent)

## Problem

The production fix for forEach iteration decision-ID scoping (static-bind `chooseOne`/`chooseN` inside forEach reusing the same decision ID across iterations) lacks a focused unit test. The fix is exercised indirectly by the FITL golden test (Turn 8 commitment) and an adapted existing test in `legal-choices.test.ts`, but neither directly tests the specific bug scenario in isolation.

A regression test should exercise: a `forEach` iterating N times where inner `chooseOne` or `chooseN` uses a static bind (no `{$loopVar}` template), and verify that each iteration produces a distinct scoped decision ID (`$bind[0]`, `$bind[1]`, etc.).

## Assumption Reassessment (2026-02-26)

1. `effects-choice.ts` now appends `ctx.iterationPath` to decision IDs when `composeDecisionId` returns the raw `internalDecisionId` (i.e., no template resolution). Confirmed.
2. `effects-control.ts` sets `iterationPath: '[${iterIdx}]'` per forEach iteration. Confirmed.
3. The existing adapted test in `legal-choices.test.ts` (line ~1724) tests a single iteration path `[0]` and `[1]` but through the full `legalChoicesDiscover` pipeline, not isolating the scoping mechanism.

## Architecture Check

1. A dedicated test in `legal-choices.test.ts` (or a new `forEach-decision-scoping.test.ts`) directly targeting the specific scenario improves regression safety for a critical fix.
2. No game-specific logic. The test uses synthetic action definitions with forEach + static-bind chooseOne.
3. No backwards-compatibility concerns.

## What to Change

### 1. Add test case to `legal-choices.test.ts`

Add a test "scopes static-bind chooseOne decision IDs per forEach iteration" that:
- Defines an action with `chooseN` (select target spaces) followed by `forEach` over the selected spaces, with an inner `chooseOne` using a static bind like `$mode`
- Calls `legalChoicesDiscover` incrementally:
  - First call: resolves `chooseN` targets → returns pending `$mode[0]`
  - Second call: provides `$mode[0]` → returns pending `$mode[1]`
  - Third call: provides `$mode[1]` → returns complete
- Asserts each pending decision has a distinct, correctly-scoped `decisionId`

### 2. Add test for nested forEach scoping

Add a test "accumulates iteration paths for nested forEach" that:
- Defines a double-nested forEach with a static-bind chooseOne in the inner loop
- Verifies decision IDs include accumulated paths like `$choice[0][0]`, `$choice[0][1]`, `$choice[1][0]`

## Files to Touch

- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify — add test cases)

## Out of Scope

- Changing production code (this ticket is test-only)
- Testing template-resolved binds (already well-covered by existing tests)
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

1. New test: "scopes static-bind chooseOne decision IDs per forEach iteration"
2. New test: "accumulates iteration paths for nested forEach"
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Each forEach iteration must produce a distinct `decisionId` for static-bind inner decisions
2. Nested forEach must accumulate iteration indices (e.g., `[outer][inner]`)
1. Compound timing invariants behave identically in standard validated execution and skip-validation execution contexts.
2. No behavior regression for existing operation pipeline legality/cost preflight checks.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Pipeline/compound preflight has one authoritative implementation path.
2. `skipValidation` cannot bypass compound timing constraints.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — add 2 test cases covering single and nested forEach with static-bind decisions

### Commands

1. `cd packages/engine && node --test dist/test/unit/kernel/legal-choices.test.js`
2. `pnpm turbo test --force`
1. `packages/engine/test/unit/kernel/apply-move.test.ts` — parity assertions for shared preflight behavior
2. `packages/engine/test/integration/*` or `packages/engine/test/e2e/*` — optional parity regression if unit-only coverage is insufficient

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js"`
3. `pnpm -F @ludoforge/engine test`
