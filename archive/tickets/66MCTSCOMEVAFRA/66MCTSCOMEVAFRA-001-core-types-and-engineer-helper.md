# 66MCTSCOMEVAFRA-001: Core Competence Evaluation Types + Engineered State Helper

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: Spec 63 (runtime move classification) — already merged

## Problem

The MCTS competence test framework needs foundational types and a state-engineering helper before any evaluators or scenarios can be built. These types must be game-agnostic (no FITL-specific fields) so the framework can later support Texas Hold'em or other games.

## Assumption Reassessment (2026-03-18)

1. `CompetenceEvalContext` needs `ValidatedGameDef` — confirmed type exists in `packages/engine/src/kernel/index.ts`.
2. `MctsSearchDiagnostics` is exported from `packages/engine/src/agents/index.ts` — confirmed in `fitl-mcts-test-helpers.ts` imports.
3. `MctsBudgetProfile` type exists in agents exports, and the current union is `'interactive' | 'turn' | 'background' | 'analysis'` — confirmed in `packages/engine/src/agents/mcts/config.ts`.
4. `GameState` is richer than the original ticket assumed. In addition to `zones`, `markers`, and `globalVars`, the helper-relevant mutable data bags are `perPlayerVars` and `zoneVars` — confirmed in `packages/engine/src/kernel/types-core.ts`.
5. `GameState` collections are readonly views (`Readonly<Record<...>>`, `readonly Token[]`), so the helper must clone only the touched bags and preserve referential stability for untouched branches.
6. `PlayerId` is a branded number type — confirmed from kernel types and existing helper constants (`0 as PlayerId`).
7. No competence-framework files exist yet under `packages/engine/test/e2e/mcts-fitl/`; the current FITL helper module still owns only crash/sanity helpers and scenario descriptors.

## Architecture Check

1. Splitting competence-specific contracts into their own test-only modules is still the right direction. It keeps the existing `fitl-mcts-test-helpers.ts` focused on replay/search plumbing and avoids turning it into an all-purpose competence framework dump.
2. The framework boundary should stay game-agnostic, but it should reuse engine-native types directly where they already exist. In particular, scenario budgets and evaluator minimum budgets should use `MctsBudgetProfile` instead of an ad hoc string union so the framework cannot drift from the agent budget model.
3. `engineerScenarioState` belongs in `fitl-mcts-test-helpers.ts` because it is shared state-construction plumbing, not evaluator logic. It should modify only `GameState` data bags via immutable cloning, with untouched branches preserved by reference.
4. Deferring the first behavioral coverage to a later ticket is too weak. This ticket introduces invariants around immutable state engineering and budget ordering, so it should add dedicated tests now.

## What to Change

### 1. Create `fitl-competence-evaluators.ts` with core types

New file with four exports:

- `CompetenceEvalContext` — context passed to every evaluator (def, stateBefore, move, stateAfter, playerId, diagnostics, budget)
- `CompetenceEvalResult` — result of a single evaluation (evaluatorName, passed, explanation, score?)
- `CompetenceEvaluator` — evaluator interface (name, minBudget, evaluate function)
- `budgetRank()` — utility function mapping `MctsBudgetProfile` to numeric rank for comparison, including `'analysis'`

Constraints:

- These contracts must remain game-agnostic.
- `minBudget` should use `MctsBudgetProfile`, not a duplicated literal union.
- `budgetRank()` should preserve the intended search ordering: `interactive < turn < background < analysis`.

### 2. Create `fitl-competence-scenarios.ts` with scenario descriptor type

- `CompetenceScenario` — scenario descriptor (id, label, turnIndex, moveIndex, playerId, budgets, evaluators, optional engineeredState)

Constraints:

- `budgets` should be typed as `readonly MctsBudgetProfile[]`.
- `engineeredState`, when present, should be a pure state builder that receives `(def, baseState)` and returns a new `GameState`.

### 3. Add `engineerScenarioState` helper to `fitl-mcts-test-helpers.ts`

Function that creates a modified `GameState` by applying overrides to:

- `globalVars`
- `perPlayerVars`
- `zoneVars`
- `zones`
- `markers`
- optional `globalMarkers`

Returns a new immutable state without mutating `baseState`.

Implementation constraints:

- Clone only the top-level bags and nested entries that are actually overridden.
- Preserve untouched references so tests can assert targeted immutability behavior.
- Do not add FITL-specific branches or helper semantics beyond generic state-bag overrides.

### 4. Add dedicated tests in this ticket

Add a focused test file for the new helper/types. Typecheck-only coverage is not sufficient because `engineerScenarioState` encodes real behavior.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (new)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` (new)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts` (modify — add `engineerScenarioState`)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-types.test.ts` (new)

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
4. `packages/engine/test/e2e/mcts-fitl/fitl-competence-types.test.ts` exercises `engineerScenarioState` and `budgetRank` directly.

### Invariants

1. No production source code changes — all new code is under `packages/engine/test/`.
2. `CompetenceEvaluator`, `CompetenceEvalContext`, `CompetenceEvalResult` have zero FITL-specific fields.
3. `engineerScenarioState` returns a new object — never mutates the input `baseState`.
4. `engineerScenarioState` can override `globalVars`, `perPlayerVars`, `zoneVars`, `zones`, `markers`, and `globalMarkers` without disturbing untouched branches.
5. `budgetRank` maps `'interactive' → 0`, `'turn' → 1`, `'background' → 2`, `'analysis' → 3`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-types.test.ts`
   Verifies `engineerScenarioState` applies overrides immutably and preserves untouched references.
2. `packages/engine/test/e2e/mcts-fitl/fitl-competence-types.test.ts`
   Verifies `budgetRank` orders all current `MctsBudgetProfile` values correctly.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added `fitl-competence-evaluators.ts` with the core competence contracts plus `budgetRank()`.
  - Added `fitl-competence-scenarios.ts` with the competence scenario descriptor type.
  - Added `engineerScenarioState()` plus generic override typings to `fitl-mcts-test-helpers.ts`.
  - Added `fitl-competence-types.test.ts` covering immutable state engineering and budget ordering.
- Deviations from original plan:
  - Tightened the framework contracts to reuse `MctsBudgetProfile` directly instead of a narrower duplicated string union.
  - Expanded `engineerScenarioState()` to cover `zoneVars` and optional `globalMarkers`, because the current `GameState` surface already exposes them and omitting them would create an unnecessary second helper later.
  - Added dedicated tests in this ticket instead of deferring helper coverage to a later ticket.
- Verification results:
  - `pnpm run build` passed.
  - `pnpm run typecheck` passed.
  - `pnpm run lint` passed.
  - `pnpm -F @ludoforge/engine test` passed on the final rerun after a fresh rebuild (`# pass 438`, `# fail 0`).
