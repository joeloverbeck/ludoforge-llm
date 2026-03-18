# 66MCTSCOMEVAFRA-002: Layer 1 Evaluator — categoryCompetence

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The coarsest competence check — "did the agent pick a reasonable operation type?" — needs to be wrapped in the `CompetenceEvaluator` interface so it can be composed with other evaluators in scenarios. This is functionally equivalent to the existing `assertMoveCategory` but composable.

## Assumption Reassessment (2026-03-18)

1. The competence framework core from ticket 001 already exists. `CompetenceEvalContext`, `CompetenceEvalResult`, `CompetenceEvaluator`, and `budgetRank()` are already implemented in `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`.
2. `CompetenceScenario` already exists in `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts`, including `budgets` typed as `readonly MctsBudgetProfile[]` and optional `engineeredState`.
3. `assertMoveCategory` exists in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts` and still drives the existing interactive/turn/background crash-sanity tests. This ticket should add a composable evaluator, not replace those files wholesale.
4. `move.actionId` is still the correct comparison surface. It is an `ActionId` branded string in engine types and existing helpers consistently normalize it through `String(move.actionId)`.
5. Budget gating is a runner concern, not evaluator-local behavior. The evaluator should declare `minBudget: 'interactive'`; skip/pass behavior belongs to the scenario runner that compares `budgetRank(testBudget)` vs `budgetRank(ev.minBudget)`.
6. The current `MctsBudgetProfile` ordering is `interactive < turn < background < analysis`. This ticket should not duplicate a narrower budget model or assume only three profiles exist.
7. The existing competence helper tests live under `packages/engine/test/e2e/mcts-fitl/`, not under `packages/engine/test/unit/e2e-helpers/`. New coverage should follow the established location unless there is a strong reason to split the lane.

## Architecture Check

1. Adding `categoryCompetence()` is still the right architectural move. It consolidates competence assertions behind one evaluator interface, which is cleaner than maintaining a parallel world of bespoke assertion helpers once scenario composition begins.
2. The evaluator should stay minimal and generic: action-id membership plus clear diagnostics. It should not absorb scenario-runner concerns such as skip handling, budget comparison, or scenario orchestration.
3. Keeping `assertMoveCategory` for the legacy crash/sanity suites is acceptable for now. Those files are existing coarse gates; this ticket's value is enabling the new competence architecture, not forcing an immediate migration of unrelated tests.
4. `categoryCompetence()` is generic enough that it could eventually move to a broader test-framework module if another game adopts the same competence framework. For now, adding it to `fitl-competence-evaluators.ts` is the cleanest incremental step because that file already owns the evaluator contracts and budget utility.
5. No production changes are justified here. This remains test-only infrastructure.

## What to Change

### 1. Add `categoryCompetence` factory to `fitl-competence-evaluators.ts`

```typescript
categoryCompetence(acceptableActionIds: readonly string[]): CompetenceEvaluator
```

- `name`: `'categoryCompetence'`
- `minBudget`: `'interactive'`
- `evaluate`: returns pass if `String(ctx.move.actionId)` is in `acceptableActionIds`, fail otherwise with explanation listing the expected vs actual actionId.

Implementation constraints:

- Keep the evaluator pure.
- Reuse the existing `CompetenceEvaluator` / `CompetenceEvalResult` types directly.
- Do not add alias APIs or alternate action-category abstraction layers. The current architecture already standardizes on `actionId`.

### 2. Unit tests for `categoryCompetence`

Add focused tests with synthetic `CompetenceEvalContext` objects:

| Test | Description |
|------|-------------|
| pass-when-actionId-in-set | `move.actionId = 'rally'`, acceptableActionIds includes `'rally'` → pass |
| fail-when-actionId-not-in-set | `move.actionId = 'pass'`, acceptableActionIds = `['rally', 'terror']` → fail with explanation |
| metadata-is-correct | evaluator name is `categoryCompetence` and `minBudget` is `'interactive'` |
| explanation-lists-expected-set | failure explanation includes actual `actionId` and expected values for diagnosis |

Scope note:

- Do not test budget skipping inside this evaluator test. Skip behavior belongs to the competence runner introduced later; this ticket only needs to verify the evaluator's declared `minBudget` metadata and evaluation logic.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add `categoryCompetence`)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (new)

## Out of Scope

- Layer 2/3 evaluators (tickets 003–007)
- Scenario definitions (tickets 008, 008b)
- Production code changes
- Replacing existing `assertMoveCategory` usage in other test files
- Implementing or changing competence-runner skip semantics

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-competence-evaluators.test.ts`: `categoryCompetence` pass case — actionId in set → `passed: true`.
2. `fitl-competence-evaluators.test.ts`: `categoryCompetence` fail case — actionId not in set → `passed: false`, explanation mentions actual and expected.
3. `fitl-competence-evaluators.test.ts`: evaluator metadata — `name === 'categoryCompetence'` and `minBudget === 'interactive'`.
4. `pnpm run typecheck` — no type errors.
5. `pnpm run lint` — no lint errors.
6. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. `categoryCompetence` is a pure function of `CompetenceEvalContext`.
3. `categoryCompetence` does not own skip handling. Budget-gated skipping remains the responsibility of the competence runner that consumes `minBudget`.
4. The evaluator compares against canonical `actionId` strings only; no secondary aliasing or category indirection is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — focused evaluator tests for `categoryCompetence`

### Commands

1. `pnpm run build`
2. `node --test dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
3. `pnpm run typecheck`
4. `pnpm run lint`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added `categoryCompetence()` to `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` as a pure, composable action-id evaluator with stable metadata and diagnostic explanations.
  - Added `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` covering pass behavior, fail behavior, and evaluator metadata.
  - Corrected the ticket scope before implementation so it matched the already-landed competence framework from ticket 001 and the repo's current test layout.
- Deviations from original plan:
  - Kept the new tests in `packages/engine/test/e2e/mcts-fitl/` instead of introducing a new `unit/e2e-helpers` location, because the existing competence helper tests already live there.
  - Did not add budget-skip assertions to the evaluator test, because skip semantics belong to the future competence runner rather than to `categoryCompetence()` itself.
- Verification results:
  - `pnpm run build` passed.
  - `node --test dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js` passed.
  - `pnpm run typecheck` passed.
  - `pnpm run lint` passed.
  - `pnpm -F @ludoforge/engine test` passed (`# pass 438`, `# fail 0`).
