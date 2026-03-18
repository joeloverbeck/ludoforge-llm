# 66MCTSCOMEVAFRA-003: Layer 2 Evaluators — victoryProgress + victoryDefense

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

Layer 2 evaluators check whether the MCTS agent's move closes the gap to victory or maintains a defensive lead. These are threshold-aware — a move from opposition 33→35 (winning for VC) is recognized as more significant than 10→12. Without these, optimization could silently degrade decision quality while looking "faster."

## Assumption Reassessment (2026-03-18)

1. Victory compute functions exist: `computeUsVictory`, `computeNvaVictory`, `computeVcVictory`, `computeArvnVictory` — confirmed in `fitl-mcts-test-helpers.ts:150-164`.
2. FITL victory thresholds: US=50, ARVN=50, NVA=18, VC=35 — from spec section 3.2.1, sourced from `data/games/fire-in-the-lake/91-victory-standings.md`.
3. `computeVictoryMarker` is the kernel API used — confirmed in helper imports.
4. `assertVictoryNonDegrading` already exists at line 1032 — this ticket creates a composable evaluator version.

## Architecture Check

1. `victoryProgress` wraps the distance-to-threshold logic in the evaluator interface.
2. `victoryDefense` adds comparative logic (own distance vs opponent distance).
3. Both accept `computeVictory` function as parameter — game-agnostic factory, FITL-specific when called with FITL compute functions.
4. `tolerance` parameter allows for minor trade-offs (e.g., spending resources for future gains).

## What to Change

### 1. `victoryProgress` evaluator factory

```typescript
victoryProgress(
  computeVictory: (def: GameDef, state: GameState) => number,
  threshold: number,
  tolerance: number,
): CompetenceEvaluator
```

- `name`: `'victoryProgress'`
- `minBudget`: `'turn'`
- Logic:
  - `distBefore = threshold - computeVictory(def, stateBefore)`
  - `distAfter = threshold - computeVictory(def, stateAfter)`
  - `passed = distAfter <= distBefore + tolerance`
  - `score = distBefore - distAfter` (positive = progress)
- Explanation includes before/after distances and delta.

### 2. `victoryDefense` evaluator factory

```typescript
victoryDefense(
  computeOwnVictory: (def: GameDef, state: GameState) => number,
  computeOpponentVictory: (def: GameDef, state: GameState) => number,
  ownThreshold: number,
  opponentThreshold: number,
  tolerance: number,
): CompetenceEvaluator
```

- `name`: `'victoryDefense'`
- `minBudget`: `'turn'`
- Logic: faction's distance-to-victory should remain smaller than (or not significantly worse relative to) the opponent's distance-to-victory.
- Used in defensive scenarios like S13.

### 3. Unit tests

| Test | Evaluator | Description |
|------|-----------|-------------|
| progress-positive | `victoryProgress` | Score moved from 30→33 toward threshold 35 → pass, score=3 |
| progress-neutral | `victoryProgress` | Score unchanged (30→30), tolerance=2 → pass, score=0 |
| progress-regression | `victoryProgress` | Score dropped from 30→27, tolerance=2 → fail (delta=-3 > tolerance) |
| progress-threshold-crossing | `victoryProgress` | Score moved from 34→36, threshold=35 → pass, score=2 |
| defense-lead-maintained | `victoryDefense` | Own distance < opponent distance, stays that way → pass |
| defense-lead-lost | `victoryDefense` | Own distance was smaller, now larger → fail |
| defense-tolerance | `victoryDefense` | Lead shrinks within tolerance → pass |
| budget-gating-skip | Both | Budget `'interactive'` < minBudget `'turn'` → skip (pass) |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 2 evaluator factories)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add 8 tests)

## Out of Scope

- Layer 3 faction-specific evaluators (tickets 004–007)
- Scenario composition (tickets 008, 008b)
- Production code changes
- Evaluation function / heuristic improvements — these evaluators *measure* quality, not *improve* it

## Acceptance Criteria

### Tests That Must Pass

1. All 8 unit tests listed above pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. Evaluator factories accept generic `(def, state) => number` functions — no FITL imports in the factory itself.
3. `score` field is always populated with the numeric delta.
4. `tolerance` is respected: regression within tolerance still passes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — 8 new test cases

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
