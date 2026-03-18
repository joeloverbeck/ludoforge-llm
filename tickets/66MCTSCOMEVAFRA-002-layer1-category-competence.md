# 66MCTSCOMEVAFRA-002: Layer 1 Evaluator — categoryCompetence

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The coarsest competence check — "did the agent pick a reasonable operation type?" — needs to be wrapped in the `CompetenceEvaluator` interface so it can be composed with other evaluators in scenarios. This is functionally equivalent to the existing `assertMoveCategory` but composable.

## Assumption Reassessment (2026-03-18)

1. `assertMoveCategory` exists in `fitl-mcts-test-helpers.ts:1016` — confirmed: checks `move.actionId` against an array of expected strings.
2. `move.actionId` is an `ActionId` (branded string) — confirmed: uses `asActionId()` and `String(move.actionId)` pattern.
3. `minBudget` for category checks is `'interactive'` — per spec 3.1, always applies regardless of budget.

## Architecture Check

1. Wraps existing logic in the evaluator interface — no new strategic knowledge.
2. `minBudget: 'interactive'` means this evaluator always runs, even at lowest budget.
3. Pure function, no side effects, no FITL-specific logic in the evaluator factory itself.

## What to Change

### 1. Add `categoryCompetence` factory to `fitl-competence-evaluators.ts`

```typescript
categoryCompetence(acceptableActionIds: readonly string[]): CompetenceEvaluator
```

- `name`: `'categoryCompetence'`
- `minBudget`: `'interactive'`
- `evaluate`: returns pass if `String(ctx.move.actionId)` is in `acceptableActionIds`, fail otherwise with explanation listing the expected vs actual actionId.

### 2. Unit tests for `categoryCompetence`

New test file with synthetic `CompetenceEvalContext` objects:

| Test | Description |
|------|-------------|
| pass-when-actionId-in-set | `move.actionId = 'rally'`, acceptableActionIds includes `'rally'` → pass |
| fail-when-actionId-not-in-set | `move.actionId = 'pass'`, acceptableActionIds = `['rally', 'terror']` → fail with explanation |
| budget-gating-always-runs | Budget is `'interactive'`, evaluator runs (not skipped) |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add `categoryCompetence`)
- `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` (new)

## Out of Scope

- Layer 2/3 evaluators (tickets 003–007)
- Scenario definitions (tickets 008, 008b)
- Production code changes
- Replacing existing `assertMoveCategory` usage in other test files

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-competence-evaluators.test.ts`: `categoryCompetence` pass case — actionId in set → `passed: true`.
2. `fitl-competence-evaluators.test.ts`: `categoryCompetence` fail case — actionId not in set → `passed: false`, explanation mentions actual and expected.
3. `fitl-competence-evaluators.test.ts`: budget gating — evaluator with `minBudget: 'interactive'` is never skipped.
4. `pnpm turbo typecheck` — no type errors.
5. `pnpm turbo lint` — no lint errors.
6. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. `categoryCompetence` is a pure function of `CompetenceEvalContext`.
3. Evaluator returns `passed: true` with `'N/A'` explanation if the evaluator is skipped due to budget gating (though this evaluator is never skipped — `minBudget: 'interactive'`).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` — unit tests for `categoryCompetence`

### Commands

1. `pnpm turbo build && node --test dist/test/unit/e2e-helpers/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
