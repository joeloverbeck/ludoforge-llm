# 66MCTSCOMEVAFRA-001: Core Competence Evaluation Types + Engineered State Helper

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: Spec 63 (runtime move classification) — already merged

## Problem

The MCTS competence test framework needs foundational types and a state-engineering helper before any evaluators or scenarios can be built. These types must be game-agnostic (no FITL-specific fields) so the framework can later support Texas Hold'em or other games.

## Assumption Reassessment (2026-03-18)

1. `CompetenceEvalContext` needs `ValidatedGameDef` — confirmed type exists in `packages/engine/src/kernel/index.ts`.
2. `MctsSearchDiagnostics` is exported from `packages/engine/src/agents/index.ts` — confirmed in `fitl-mcts-test-helpers.ts` imports.
3. `MctsBudgetProfile` type exists in agents exports — confirmed in `fitl-mcts-test-helpers.ts` imports.
4. `GameState` uses `zones: Record<string, Token[]>`, `markers: Record<string, Record<string, string>>`, `globalVars: Record<string, number | boolean>` — confirmed from kernel types.
5. `PlayerId` is a branded number type — confirmed from helper constants (`0 as PlayerId`).

## Architecture Check

1. Types are pure interfaces with no logic — minimal risk, maximum reuse.
2. All types are game-agnostic. FITL knowledge lives only in evaluator implementations (later tickets).
3. `engineerScenarioState` modifies only the `GameState` data bag via immutable spread — no kernel mutation.

## What to Change

### 1. Create `fitl-competence-evaluators.ts` with core types

New file with four type/interface exports:

- `CompetenceEvalContext` — context passed to every evaluator (def, stateBefore, move, stateAfter, playerId, diagnostics, budget)
- `CompetenceEvalResult` — result of a single evaluation (evaluatorName, passed, explanation, score?)
- `CompetenceEvaluator` — evaluator interface (name, minBudget, evaluate function)
- `budgetRank()` — utility function mapping budget string to numeric rank for comparison

### 2. Create `fitl-competence-scenarios.ts` with scenario descriptor type

- `CompetenceScenario` — scenario descriptor (id, label, turnIndex, moveIndex, playerId, budgets, evaluators, optional engineeredState)

### 3. Add `engineerScenarioState` helper to `fitl-mcts-test-helpers.ts`

Function that creates a modified `GameState` by applying overrides to globalVars, perPlayerVars, zone tokens, and markers. Returns a new immutable state — no mutation.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (new)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` (new)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts` (modify — add `engineerScenarioState`)

## Out of Scope

- Evaluator implementations (tickets 002–007)
- Scenario definitions (tickets 008, 008b)
- Test runner / test lane (ticket 008)
- Production code changes of any kind
- Documentation (ticket 009)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` — new files compile cleanly with no type errors.
2. `pnpm turbo lint` — no lint errors in new or modified files.
3. `pnpm -F @ludoforge/engine test` — existing suite still passes (no regressions from helper addition).
4. A simple smoke test (can be inline in a later ticket) that `engineerScenarioState` returns a new state with overridden globalVars and zone tokens.

### Invariants

1. No production source code changes — all new code is under `packages/engine/test/`.
2. `CompetenceEvaluator`, `CompetenceEvalContext`, `CompetenceEvalResult` have zero FITL-specific fields.
3. `engineerScenarioState` returns a new object — never mutates the input `baseState`.
4. `budgetRank` maps `'interactive' → 0`, `'turn' → 1`, `'background' → 2`.

## Test Plan

### New/Modified Tests

1. No dedicated test file in this ticket — types are validated by typecheck. `engineerScenarioState` is exercised by ticket 008b's integration tests.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`
