# 101STRACONPRO-005: Cross-game validation & FITL integration test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — tests only
**Deps**: `tickets/101STRACONPRO-002.md`, `tickets/101STRACONPRO-003.md`, `tickets/101STRACONPRO-004.md`

## Problem

The strategic condition system needs end-to-end validation: compiler diagnostics for invalid conditions, cross-game correctness (games without conditions compile cleanly), FITL integration (pivotal event proximity scoring compiles, evaluates, and influences move selection), and cross-condition reference behavior (composite conditions, cycle detection).

## Assumption Reassessment (2026-03-31)

1. FITL production spec compiles via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed.
2. Existing policy integration tests in `packages/engine/test/integration/agents/policy-annotation-e2e.test.ts` show the pattern for end-to-end agent policy testing. Confirmed.
3. Existing agent test files in `packages/engine/test/unit/agents/` cover policy-surface, policy-eval, policy-runtime patterns. Confirmed.
4. Texas Hold'em spec compiles cleanly and serves as the engine-agnosticism validation game. Confirmed.

## Architecture Check

1. Integration tests validate the full pipeline: YAML → compile → evaluate → score. No shortcuts.
2. FITL tests use approximate strategic conditions authored in the test, not kernel `ConditionAST` — maintaining the boundary between policy expressions and kernel conditions.
3. Cross-game tests prove strategic conditions are optional and don't break games that don't use them.

## What to Change

### 1. Cross-game compilation test

- Compile Texas Hold'em spec (no strategic conditions) — must compile cleanly with `strategicConditions: {}` in output
- Compile FITL spec (no strategic conditions in production profile yet) — must compile cleanly
- Confirm `strategicConditions` field is an empty record in both cases

### 2. Compiler diagnostic tests

- Invalid condition: non-boolean `target` → compiler error
- Invalid condition: non-numeric `proximity.current` → compiler error
- Invalid condition: `threshold <= 0` → compiler error
- Ref to non-existent condition: `condition.nonExistent.satisfied` → compiler error
- Ref to `condition.X.proximity` when X has no proximity defined → compiler error

### 3. FITL integration test

Build a test spec (or extend a fixture) with:
- A strategic condition approximating Card 124's (VC pivotal) `playCondition`: `gte(add(count(vc-guerrillas), count(vc-bases)), 15)`
- A score term referencing `condition.vcPivotalReady.proximity`
- Verify:
  - Condition compiles successfully
  - Proximity correctly reflects guerrilla + base count in a test state
  - Score term using `condition.vcPivotalReady.proximity` produces correct scores
  - Actions that change token counts produce nonzero proximity delta when combined with preview refs

### 4. Cross-condition reference test

- Condition A references condition B's `satisfied` field — compiles correctly
- Condition B references condition A's `proximity` field — creates a cycle → compiler diagnostic
- Composite condition using `min` of two sub-condition proximities — evaluates correctly

### 5. Dependency tracking test

- Compiled score term referencing `condition.X.proximity` has `X` in its `dependencies.strategicConditions`
- Compiled condition referencing `condition.Y.satisfied` has `Y` in its dependency refs

### 6. Score term integration test

- A score term with `condition.X.proximity` in its `value` expression produces correct numeric scores
- The score influences move selection: candidate actions receive different scores based on condition proximity

## Files to Touch

- `packages/engine/test/integration/agents/strategic-condition-e2e.test.ts` (new) — FITL integration, cross-game, score term integration
- `packages/engine/test/unit/compile-agents-strategic-condition.test.ts` (modify — created in ticket 002) — add compiler diagnostic tests if not already covered
- `packages/engine/test/unit/agents/policy-eval-strategic-condition.test.ts` (modify — created in ticket 004) — add cross-condition evaluation tests if not already covered

## Out of Scope

- Modifying FITL production profile YAML to include strategic conditions (future work — authors add conditions when ready)
- Preview-based condition evaluation pipeline tests (covered by existing Spec 98 preview mechanism)
- Performance benchmarking of condition evaluation

## Acceptance Criteria

### Tests That Must Pass

1. Texas Hold'em compiles cleanly with empty `strategicConditions`
2. FITL compiles cleanly with empty `strategicConditions`
3. All 5 compiler diagnostic cases produce appropriate errors
4. VC pivotal condition compiles and evaluates correct proximity for test states
5. Score term using `condition.vcPivotalReady.proximity` produces correct scores
6. Cross-condition reference compiles and evaluates correctly
7. Cyclic cross-condition reference produces compiler diagnostic
8. Dependency tracking correctly lists referenced strategic conditions
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Games without strategic conditions compile identically to before (no behavioral change)
2. Strategic condition evaluation is deterministic for the same game state
3. No FITL-specific logic in engine code — all game-specific content is in test YAML fixtures

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/strategic-condition-e2e.test.ts` — new file: cross-game compilation, FITL integration, score term integration, cross-condition references, dependency tracking
2. `packages/engine/test/unit/compile-agents-strategic-condition.test.ts` — extend with diagnostic edge cases if needed
3. `packages/engine/test/unit/agents/policy-eval-strategic-condition.test.ts` — extend with cross-condition evaluation if needed

### Commands

1. `node --test packages/engine/test/integration/agents/strategic-condition-e2e.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
