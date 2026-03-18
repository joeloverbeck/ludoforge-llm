# 66MCTSCOMEVAFRA-003: Layer 2 Evaluators — victoryProgress + victoryDefense

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

Layer 2 evaluators check whether the MCTS agent's move closes the gap to victory or maintains a defensive lead. These are threshold-aware — a move from opposition 33→35 (winning for VC) is recognized as more significant than 10→12. Without these, optimization could silently degrade decision quality while looking "faster."

## Assumption Reassessment (2026-03-18)

1. The target evaluator module already exists and is active at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`. It currently contains `categoryCompetence`, `resourceDiscipline`, `monsoonAwareness`, `passStrategicValue`, and `budgetRank`.
2. The focused evaluator test file already exists at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts`. The older spec text referring to `test/unit/e2e-helpers/...` does not match the current tree.
3. Victory compute functions exist as reusable test helpers: `computeUsVictory`, `computeNvaVictory`, `computeVcVictory`, `computeArvnVictory` in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts`.
4. Those helpers are thin wrappers over the kernel API `computeVictoryMarker`, so this ticket should reuse those functions rather than duplicate victory math.
5. FITL victory thresholds remain US=50, ARVN=50, NVA=18, VC=35, sourced from `data/games/fire-in-the-lake/91-victory-standings.md` and echoed in Spec 66 section 3.2.1.
6. `assertVictoryNonDegrading` still exists and is still used by `fitl-mcts-interactive.test.ts`, `fitl-mcts-turn.test.ts`, and `fitl-mcts-background.test.ts`. This ticket does not remove or replace those callers; it adds composable Layer 2 evaluators that later scenario-runner tickets can adopt.
7. `MctsBudgetProfile` now includes `'analysis'` in addition to `'interactive' | 'turn' | 'background'`. New evaluator code must stay compatible with the current profile type.

## Architecture Check

1. Adding Layer 2 evaluators is still architecturally beneficial versus the current `assertVictoryNonDegrading` helper because the existing helper only checks raw non-regression for one scenario and cannot compose with the evaluator pipeline from Spec 66.
2. The clean shape is evaluator factories over generic victory functions, not FITL-specific branching. That keeps the evaluator interface reusable and aligns with the game-agnostic framework described in Spec 66.
3. The implementation should centralize threshold-distance math in a small private helper so `victoryProgress` and `victoryDefense` share one definition of distance-to-victory and explanation formatting.
4. `victoryDefense` should compare relative pressure, not just absolute own non-regression. The useful invariant is whether the acting faction remains closer to victory than the opponent, or degrades only within tolerance.
5. This ticket should stay inside the existing evaluator/test module pair. Moving logic into production code or rewriting current MCTS E2E suites would be architectural overreach for this slice.

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
- Scope correction: clamp nothing and do not special-case threshold crossing. Negative distances after crossing the threshold are acceptable because they preserve the same monotonic interpretation: smaller distance is always better.

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
- Logic:
  - `ownLeadBefore = opponentDistBefore - ownDistBefore`
  - `ownLeadAfter = opponentDistAfter - ownDistAfter`
  - `passed = ownLeadAfter >= ownLeadBefore - tolerance`
  - `score = ownLeadAfter - ownLeadBefore` (positive = defensive improvement)
- Explanation includes both factions' before/after distances plus lead delta.
- Used in defensive scenarios like S13.
- Scope correction: this evaluator measures relative victory posture, not board control directly. Faction-specific defensive heuristics remain for later tickets.

### 3. Unit tests

| Test | Evaluator | Description |
|------|-----------|-------------|
| progress-positive | `victoryProgress` | Score moved from 30→33 toward threshold 35 → pass, score=3 |
| progress-neutral-within-tolerance | `victoryProgress` | Score unchanged at 30 with tolerance=2 → pass, score=0 |
| progress-regression-beyond-tolerance | `victoryProgress` | Score dropped from 30→27 with tolerance=2 → fail |
| progress-threshold-crossing | `victoryProgress` | Score moved from 34→36, threshold=35 → pass, score=2 |
| defense-lead-maintained | `victoryDefense` | Acting faction remains closer to victory than opponent → pass |
| defense-lead-lost | `victoryDefense` | Acting faction's relative lead collapses beyond tolerance → fail |
| defense-tolerance-window | `victoryDefense` | Relative lead shrinks but stays within tolerance → pass |
| metadata-stability | Both | Expose stable `name` and `minBudget='turn'` metadata |

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

1. All focused evaluator tests listed above pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. Evaluator factories accept generic `(def, state) => number` functions — no FITL imports in the factory itself.
3. `score` field is always populated with the numeric delta for both evaluators.
4. `tolerance` is respected: regression within tolerance still passes.
5. Existing `assertVictoryNonDegrading` callers remain untouched in this ticket; migration to evaluator composition belongs to later scenario-runner tickets.
6. The implementation remains compatible with the current `MctsBudgetProfile` union, including `'analysis'`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — add focused Layer 2 evaluator tests alongside the existing Layer 1 / 2b tests

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added `victoryProgress()` and `victoryDefense()` to `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` as composable Layer 2 evaluator factories over generic `(def, state) => number` victory functions.
  - Centralized the shared distance-to-threshold calculation in a private helper so both evaluators use one consistent notion of victory distance.
  - Kept `assertVictoryNonDegrading` and its current MCTS E2E callers unchanged; this ticket adds the evaluator-layer abstraction without prematurely rewriting the existing scenario suites.
  - Expanded `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` with focused synthetic before/after state coverage for progress, regression tolerance, threshold crossing, defensive lead maintenance, defensive lead loss, and stable evaluator metadata.
- Deviations from original plan:
  - Replaced the original \"budget-gating-skip\" test idea with metadata coverage because budget gating is owned by the scenario runner, not the evaluator factories themselves.
  - Explicitly retained the existing `assertVictoryNonDegrading` helper in active E2E suites instead of treating it as replaced by this ticket.
  - Chose relative-lead scoring for `victoryDefense` (`opponentDist - ownDist`) so the evaluator measures defensive posture directly rather than only raw own-score preservation.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine` passed.
  - `node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm -F @ludoforge/engine test` passed (`# pass 438`, `# fail 0`).
