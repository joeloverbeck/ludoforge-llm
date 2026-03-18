# Spec 66 — MCTS Competence Evaluation Framework

**Status**: NOT IMPLEMENTED

**Depends on**: Spec 63 (runtime move classification), 62MCTSSEAVIS-019 (pool sizing — enabler, not blocker)

## 0. Problem Statement

### 0.1 Current Tests Don't Test Competence

After the Spec 63 runtime classification fix, all 10 FITL MCTS scenarios complete without crashes. But the "competence" tests are testing crash-freedom, not competence. With pool exhaustion at 201 capacity, the best action receives only 2-3 visits out of 200 iterations — effectively random selection among pending families. The `acceptableCategories` arrays had to be set to "every legal operation" to avoid false failures.

This means the MCTS agent could be making terrible strategic decisions (rallying in the wrong provinces, marching troops away from objectives, attacking where it has no advantage) and the tests would still pass.

### 0.2 Optimization Without Competence Guards Is Dangerous

The next phase of MCTS work involves performance optimization: pool sizing tuning, rollout improvements, evaluation function refinement. Each of these changes can alter which moves the search converges on. Without competence tests that assert *strategic quality*, optimization could silently degrade decision quality while making the search "faster" or "explore more."

The user's requirement: **lock down competent behavior first, then optimize with the competence tests as regression guards.**

### 0.3 What Competence Means for FITL

Competence is not a single metric. It operates at three levels of granularity:

| Level | Question | Example |
|-------|----------|---------|
| **Category** | Did the agent pick a reasonable operation type? | VC picked `rally` (not `pass`) |
| **Victory progress** | Did the move close the gap to the faction's victory threshold? | VC opposition+bases score moved toward threshold of 35 |
| **Strategic quality** | Did the move follow sound faction-specific strategic principles? | VC rallied in a province with an existing base and <4 guerrillas |

The current tests operate only at Level 1. This spec designs a framework that supports all three levels.

## 1. Architecture

### 1.1 Design Principles

1. **Game-agnostic framework, game-specific evaluators.** The competence test runner, scenario descriptor types, and evaluation pipeline are generic. The FITL strategic knowledge lives entirely in test code (`test/e2e/mcts-fitl/`), not in production source.

2. **Budget-stratified assertions.** The same scenario can be tested at different search budgets with different evaluation bars. Low-budget tests (interactive, 200 iterations) assert basic sanity. High-budget tests (background, 5000+ iterations with adequate pool) assert strategic quality. This allows competence tests to exist *before* pool optimization makes them meaningful.

3. **Evaluators are composable functions.** Each evaluator is an independent function with a clear contract. Scenarios compose multiple evaluators. New strategic insights → new evaluator functions → no structural changes.

4. **Deterministic and reproducible.** All tests use fixed seeds. Same code + same seed = same result. Competence tests can be pinned to exact expected outcomes once the search converges reliably.

5. **No production code changes.** This spec covers test infrastructure only. The MCTS agent, kernel, compiler, and GameDef remain unchanged. Strategic knowledge is encoded in test evaluators, not in engine code.

### 1.2 Component Map

```
test/e2e/mcts-fitl/
├── fitl-mcts-test-helpers.ts          # Existing: replay, search, base assertions
├── fitl-competence-evaluators.ts      # NEW: FITL-specific strategic evaluator functions
├── fitl-competence-scenarios.ts       # NEW: scenario descriptors with evaluator composition
├── fitl-competence.test.ts            # NEW: competence test runner
├── fitl-mcts-interactive.test.ts      # Existing: kept as crash/sanity gate
├── fitl-mcts-turn.test.ts             # Existing: kept as crash/sanity gate
└── fitl-mcts-background.test.ts       # Existing: kept as crash/sanity gate
```

### 1.3 Relationship to Existing Tests

The existing profile test files (`fitl-mcts-interactive.test.ts`, `fitl-mcts-turn.test.ts`, `fitl-mcts-background.test.ts`) remain as-is. They serve as crash-freedom and basic category gates. The new competence tests are a separate, more rigorous suite that runs at higher iteration counts and asserts deeper strategic properties.

## 2. Competence Evaluation Types

### 2.1 Core Types

```typescript
// test/e2e/mcts-fitl/fitl-competence-evaluators.ts

import type { GameDef, GameState, Move, PlayerId, ValidatedGameDef } from '../../../src/kernel/index.js';
import type { MctsSearchDiagnostics } from '../../../src/agents/index.js';

/**
 * Context passed to every competence evaluator.
 */
export interface CompetenceEvalContext {
  readonly def: ValidatedGameDef;
  readonly stateBefore: GameState;
  readonly move: Move;
  readonly stateAfter: GameState;
  readonly playerId: PlayerId;
  readonly diagnostics: MctsSearchDiagnostics;
  /** The search budget profile used for this evaluation. */
  readonly budget: string;
}

/**
 * Result of a single competence evaluation.
 */
export interface CompetenceEvalResult {
  readonly evaluatorName: string;
  readonly passed: boolean;
  /** Human-readable explanation of pass/fail. */
  readonly explanation: string;
  /** Numeric score if applicable (e.g., victory delta). */
  readonly score?: number;
}

/**
 * A single competence evaluator function.
 *
 * Evaluators are composable: a scenario can use any combination.
 * Each evaluator declares the minimum budget at which it applies —
 * below that budget, it is skipped (not failed).
 */
export interface CompetenceEvaluator {
  readonly name: string;
  /** Minimum budget profile at which this evaluator is meaningful.
   *  'interactive' < 'turn' < 'background'. Below this, the evaluator
   *  is skipped with a pass result. */
  readonly minBudget: 'interactive' | 'turn' | 'background';
  readonly evaluate: (ctx: CompetenceEvalContext) => CompetenceEvalResult;
}
```

### 2.2 Scenario Descriptors

```typescript
// test/e2e/mcts-fitl/fitl-competence-scenarios.ts

import type { PlayerId } from '../../../src/kernel/index.js';
import type { MctsBudgetProfile } from '../../../src/agents/index.js';
import type { CompetenceEvaluator } from './fitl-competence-evaluators.js';

/**
 * A competence scenario: a specific game position where the MCTS
 * agent must demonstrate competent play.
 *
 * Scenarios are pure data. The test runner applies the evaluators.
 */
export interface CompetenceScenario {
  readonly id: string;
  readonly label: string;
  /** 0-based index into REPLAY_TURNS (from fitl-mcts-test-helpers). */
  readonly turnIndex: number;
  /** 0-based index of the move within that turn that is the decision point. */
  readonly moveIndex: number;
  readonly playerId: PlayerId;
  /** Budget profiles at which to run this scenario.
   *  Each budget produces a separate test case. */
  readonly budgets: readonly MctsBudgetProfile[];
  /** Evaluators to apply at this scenario. Each evaluator self-gates
   *  on its minBudget — evaluators whose minBudget exceeds the
   *  test's budget are skipped, not failed. */
  readonly evaluators: readonly CompetenceEvaluator[];
}
```

## 3. Evaluator Catalog

### 3.1 Layer 1: Category Competence

**Purpose**: Assert the chosen actionId is in an expected set. This is the coarsest check — "did the agent pick a reasonable operation type?"

```
categoryCompetence(acceptableActionIds: readonly string[]): CompetenceEvaluator
```

- `minBudget`: `'interactive'` (always applies)
- `evaluate`: `move.actionId ∈ acceptableActionIds`

This is functionally identical to the existing `assertMoveCategory` but wrapped in the evaluator interface for composability.

### 3.2 Layer 2: Victory Progress & Defense

#### 3.2.1 Victory Progress

**Purpose**: Threshold-aware victory progress evaluator. Measures whether the move closes the gap to the faction's victory threshold. More meaningful than simple delta — recognizes urgency near threshold.

**FITL victory thresholds** (from `data/games/fire-in-the-lake/91-victory-standings.md`):
- US: Support + Available >= **50**
- ARVN: COIN-Controlled Pop + Patronage >= **50**
- NVA: NVA-Controlled Pop + NVA Bases >= **18**
- VC: Opposition + VC Bases >= **35**

```
victoryProgress(
  computeVictory: (def: GameDef, state: GameState) => number,
  threshold: number,
  tolerance: number,
): CompetenceEvaluator
```

- `minBudget`: `'turn'` (needs enough search budget for the move to be non-random)
- Evaluation logic:
  - `distBefore = threshold - computeVictory(def, stateBefore)`
  - `distAfter = threshold - computeVictory(def, stateAfter)`
  - `passed = distAfter <= distBefore + tolerance`
  - `score = distBefore - distAfter` (positive = progress toward victory)
- Reports the distance delta as `score` for diagnostics.

The `computeVictory` function is faction-specific and already exists in `fitl-mcts-test-helpers.ts` (`computeUsVictory`, `computeNvaVictory`, `computeVcVictory`, `computeArvnVictory`).

#### 3.2.2 Victory Defense

**Purpose**: Checks that the faction's lead over opponents is maintained. Used in defensive scenarios where the faction should protect its advantage.

```
victoryDefense(
  computeOwnVictory: (def: GameDef, state: GameState) => number,
  computeOpponentVictory: (def: GameDef, state: GameState) => number,
  ownThreshold: number,
  opponentThreshold: number,
  tolerance: number,
): CompetenceEvaluator
```

- `minBudget`: `'turn'`
- Evaluation logic: the faction's distance-to-victory should remain smaller than (or not significantly worse relative to) the opponent's distance-to-victory.
- Used in scenarios like S13 where the faction is close to winning and needs to defend its position.

### 3.3 Layer 3: Strategic Quality Evaluators

These encode faction-specific strategic principles from the FITL rules (Section 8.5–8.8: Non-Player faction flowcharts) and the factions guide. Each evaluator checks a specific strategic property of the state delta.

#### 3.3.0 Cross-Faction Strategic Evaluators

**Source**: Rules Sections 5-8, faction guide.

| Evaluator | minBudget | Strategic Principle | What It Checks |
|-----------|-----------|-------------------|----------------|
| `resourceDiscipline` | `turn` | "Don't waste resources on low-value operations at 0 resources" | Faction passes (not wastes resources on low-value ops) when resources = 0. NVA/VC pass at 0; ARVN passes if Available < 12 pieces. Detects reckless spending. |
| `monsoonAwareness` | `background` | "Hard constraints during monsoon turn" | During monsoon turn (last card before Coup): no Sweep, no March, no Pivotal Event. Validates the agent recognizes hard constraints. |
| `passStrategicValue` | `background` | "Pass should be strategic, not pointless" | When the agent passes, it should gain resources AND the upcoming card should be weak/irrelevant to the faction. Detects pointless passing vs. strategic passing. |

#### 3.3.1 VC Strategic Evaluators

**Source**: Rules Section 8.5, FITL factions guide.

| Evaluator | Strategic Principle | What It Checks |
|-----------|-------------------|----------------|
| `vcRallyQuality` | "Rally in spaces with VC bases where <4 underground guerrillas" (8.5.2) | After rally: guerrillas placed in base provinces, not random empty spaces |
| `vcTerrorTarget` | "Terror in highest-population spaces with Active/Passive Support" (8.5.1) | After terror: targeted spaces had Support and high population |
| `vcBaseExpansion` | "Place bases wherever 4+ VC guerrillas" (8.5.2) | After rally: if 4+ guerrillas existed anywhere, a base was placed |
| `vcOppositionGrowth` | "VC victory = opposition + bases" | Opposition total increased or maintained |
| `vcResourceManagement` | "Tax when 0 resources, don't tax at >9 unless on LoCs" (8.5.1) | Resources didn't drop to 0 without tax; didn't waste resources on low-value operations |
| `vcSubvertTargeting` | "Subvert removes 2 ARVN cubes or replaces 1 with VC guerrilla" (8.5) | When VC has Underground guerrillas co-located with ARVN cubes, Subvert should target spaces where it flips cubes (only 1 ARVN cube present) or removes max COIN Control |
| `vcTaxEfficiency` | "Tax priority: 2-Econ LoCs first, then 1-Econ LoCs, then Active Support spaces" (8.5.1) | Tax targets 2-Econ LoCs first, then 1-Econ LoCs, then Active Support spaces. Validates resource generation isn't random |

#### 3.3.2 NVA Strategic Evaluators

**Source**: Rules Section 8.6.

| Evaluator | Strategic Principle | What It Checks |
|-----------|-------------------|----------------|
| `nvaAttackConditions` | "Attack when troops alone would add NVA control or remove a base or remove 4+ enemy" (8.6.2) | Attack only executed when conditions met |
| `nvaMarchSouthward` | "March toward population centers in South Vietnam" (8.6.5) | After march: NVA troops closer to SVN population |
| `nvaRallyTrailImprove` | "Rally + improve trail when trail <3 or available >20 troops" (8.6.4) | After rally: trail improved when affordable |
| `nvaControlGrowth` | "NVA victory = NVA-controlled population + NVA bases on map" | NVA control score increased or maintained |
| `nvaInfiltrateValue` | "Infiltrate only if base or 4+ troops placed" (8.6.4) | Infiltrate not wasted on trivial placements |
| `nvaBombardUsage` | "Bombard when >=3 NVA Troops in/adjacent to enemy-occupied space" (8.6) | When NVA has >=3 Troops in a space and >=3 NVA Troops adjacent to a US/ARVN-occupied space, Bombard should be used (not ignored). Bombard is a free piece-removal opportunity |

#### 3.3.3 US Strategic Evaluators

**Source**: Rules Section 8.8.

| Evaluator | Strategic Principle | What It Checks |
|-----------|-------------------|----------------|
| `usSweepActivation` | "Sweep to activate guerrillas, then assault" (8.8.1) | After sweep: previously underground guerrillas now active |
| `usAssaultRemoval` | "Assault where it removes control, bases, or 6+ enemy" (8.8.2) | Assault targeted high-value spaces |
| `usSupportGrowth` | "US victory = support + available pieces" | Support total increased or maintained |
| `usTrailDegradation` | "When Trail >= 3 and Air Strike available, include degradeTrail: yes" (8.8) | Trail degradation is often higher priority than piece removal for US. When Trail >= 3 and Air Strike is available, Air Strike should include trail degradation |
| `usPacification` | "Pacify in highest-population spaces at coup" | Coup pacification targeted max-population spaces |
| `usForcePreservation` | "US should not lose more than 2 pieces per turn from voluntary operations" | US should not Assault into strong NVA positions suicidally. Detects reckless aggression that wastes US pieces |

#### 3.3.4 ARVN Strategic Evaluators

**Source**: Rules Section 8.7.

| Evaluator | Strategic Principle | What It Checks |
|-----------|-------------------|----------------|
| `arvnTrainCubes` | "Train to place ARVN cubes, Rangers in priority spaces" (8.7.1) | After train: cubes placed in strategically important spaces |
| `arvnGovern` | "Govern to increase patronage or aid" (8.7.3) | After govern: patronage increased |
| `arvnControlMaintain` | "ARVN victory = COIN-controlled population + patronage" | COIN control score maintained or improved |
| `arvnSweepRaid` | "Sweep then raid to remove guerrillas and gain resources" (8.7) | After sweep+raid: guerrillas removed, resources gained |
| `arvnLocControl` | "Patrol/Sweep LoCs when Sabotage markers present and Resources >= 3" (8.7) | ARVN should Patrol/Sweep LoCs when Sabotage markers are present and ARVN Resources >= 3. LoC control directly affects Econ earnings at Coup. Sabotage reduces ARVN income |
| `arvnAidPreservation` | "Govern should not drain Aid below Total Econ" (6.2.3) | Govern operations should not drain Aid below Total Econ (which would block US spending). "US may only spend ARVN Resources exceeding Total Econ" |

### 3.4 Evaluator Implementation Pattern

All Layer 3 evaluators follow the same pattern:

```typescript
export function vcRallyQuality(): CompetenceEvaluator {
  return {
    name: 'vcRallyQuality',
    minBudget: 'background',
    evaluate(ctx: CompetenceEvalContext): CompetenceEvalResult {
      // Only evaluate if the move was actually a rally
      if (String(ctx.move.actionId) !== 'rally') {
        return { evaluatorName: 'vcRallyQuality', passed: true, explanation: 'N/A — not a rally move' };
      }

      // Compare stateBefore and stateAfter to check strategic quality:
      // - Were guerrillas placed in spaces with existing VC bases?
      // - Were spaces with <4 underground guerrillas prioritized?
      // ...state delta analysis...

      return {
        evaluatorName: 'vcRallyQuality',
        passed: /* boolean */,
        explanation: /* human-readable */,
        score: /* optional numeric quality score */,
      };
    },
  };
}
```

Key properties:
- Evaluator is skipped (returns pass) if the move type doesn't match (e.g., checking rally quality on an event move).
- State delta analysis uses only kernel APIs (`state.zones`, `state.markers`, `state.globalVars`). No production code changes needed.
- The evaluator is a pure function of `(stateBefore, move, stateAfter)`.

## 4. Test Runner

### 4.1 Structure

```typescript
// test/e2e/mcts-fitl/fitl-competence.test.ts

describe('FITL MCTS competence evaluation', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  for (const scenario of COMPETENCE_SCENARIOS) {
    describe(scenario.label, () => {
      for (const budget of scenario.budgets) {
        it(`${budget} profile`, () => {
          // 1. Replay to decision point
          const stateBefore = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);

          // 2. Run MCTS search
          const result = runFitlMctsSearch(def, stateBefore, scenario.playerId, budget);

          // 3. Apply chosen move
          const stateAfter = applyMove(def, stateBefore, result.move).state;

          // 4. Run all evaluators
          const ctx = { def, stateBefore, move: result.move, stateAfter, playerId: scenario.playerId, diagnostics: result.diagnostics, budget };
          const results = scenario.evaluators.map(ev => {
            if (budgetRank(budget) < budgetRank(ev.minBudget)) {
              return { evaluatorName: ev.name, passed: true, explanation: `Skipped — budget ${budget} < minBudget ${ev.minBudget}` };
            }
            return ev.evaluate(ctx);
          });

          // 5. Assert all evaluators passed
          const failures = results.filter(r => !r.passed);
          assert.ok(failures.length === 0,
            `${scenario.label} @ ${budget}: ${failures.length} evaluator(s) failed:\n` +
            failures.map(f => `  - ${f.evaluatorName}: ${f.explanation}`).join('\n')
          );
        });
      }
    });
  }
});
```

### 4.2 Budget Ranking

```typescript
function budgetRank(budget: string): number {
  switch (budget) {
    case 'interactive': return 0;
    case 'turn': return 1;
    case 'background': return 2;
    default: return -1;
  }
}
```

### 4.3 Test Lane

Add a dedicated test lane for competence tests, gated by `RUN_MCTS_FITL_E2E=1`:

```
"test:e2e:mcts:fitl:competence": "RUN_MCTS_FITL_E2E=1 node scripts/run-tests.mjs --lane e2e:mcts:fitl:competence"
```

## 5. Scenario Design

### 5.1 Initial Scenario Set

The initial scenario set reuses the existing 10 playbook scenarios (S1–S10) but with richer evaluators. Additional scenarios should be added as new strategic situations are identified.

| Scenario | Faction | Game State | Key Strategic Test |
|----------|---------|------------|-------------------|
| S1: T1 VC — Burning Bonze | VC | Turn 1, first eligible | VC should rally/terror, not pass |
| S2: T1 ARVN — post NVA pass | ARVN | Turn 1, ARVN eligible | ARVN should train/govern |
| S3: T2 NVA — Trucks | NVA | Turn 2, first eligible | NVA should rally (trail at 1) or march |
| S4: T3 VC — Green Berets | VC | Turn 3, VC eligible | VC should rally (build presence) |
| S5: T4 US — Gulf of Tonkin | US | Turn 4, US first eligible | US should play event (high-value) |
| S6: T4 NVA — post US event | NVA | Turn 4, NVA eligible | NVA should march/rally into SVN |
| S7: T5 VC — Brinks Hotel | VC | Turn 5, VC first eligible | VC should play event (shaded) or terror |
| S8: T6 ARVN — Henry Cabot Lodge | ARVN | Turn 6, ARVN first eligible | ARVN should sweep/assault |
| S9: T7 NVA — Booby Traps | NVA | Turn 7, NVA eligible | NVA should attack (troops in position) |
| S10: T8 US — coup pacification | US | Turn 8, coup phase | US should pacify highest-pop spaces |
| S11: Near-win VC | VC | Engineered: opposition=33, VC bases=1, scattered guerrillas | VC should Terror aggressively in high-pop Support spaces to cross 35 threshold. Should NOT rally/march (too slow) |
| S12: NVA resource-starved | NVA | Engineered: NVA resources=0, Trail at 2, 15 troops on map | NVA should Pass (gain resource). Any operation at 0 resources is illegal or wasteful. Tests resource awareness |
| S13: US defensive | US | Engineered: Support at 48, Available=3, NVA massing in 2-pop provinces | US should Sweep/Assault to protect Support spaces, not Train. Defensive posture when close to victory and under threat |
| S14: ARVN pre-Coup | ARVN | Playbook Turn 7 + advance to monsoon card | ARVN should Train (place cubes for Redeploy positioning) or Govern (build Patronage before Coup scoring). No Sweep (monsoon) |
| S15: NVA late-game blitz | NVA | Engineered: Trail at 4, 25+ NVA troops available, 10+ guerrillas on map | NVA should March into SVN population centers for Control. Trail at 4 = free march in Laos/Cambodia. Tests recognizing winning conditions |

S11, S12, S13, S15 use the `engineerScenarioState()` helper (see below) that modifies `createPlaybookBaseState()` output with specific global var and zone overrides. S14 reuses existing playbook replay at Turn 7 + advance.

#### 5.1.1 Engineered Scenario State Helper

New helper function in `fitl-mcts-test-helpers.ts`:

```typescript
/**
 * Create an engineered game state by modifying the base playbook state.
 * Used for pressure/edge-case scenarios that can't be reached via normal replay.
 */
export const engineerScenarioState = (
  def: ValidatedGameDef,
  baseState: GameState,
  overrides: {
    globalVars?: Partial<Record<string, number | boolean>>;
    perPlayerVars?: Partial<Record<PlayerId, Partial<Record<string, number>>>>;
    zoneTokenOverrides?: Record<string, Token[]>;
    markerOverrides?: Record<string, Record<string, string>>;
  },
): GameState => { /* ... */ };
```

The `CompetenceScenario` type gains an optional `engineeredState` field:

```typescript
export interface CompetenceScenario {
  // ... existing fields ...
  /** Optional: use an engineered state instead of playbook replay. */
  readonly engineeredState?: (def: ValidatedGameDef, baseState: GameState) => GameState;
}
```

### 5.2 Scenario Composition Example

```typescript
const S1_VC_BURNING_BONZE: CompetenceScenario = {
  id: 'S1',
  label: 'S1: T1 VC — Burning Bonze',
  turnIndex: 0,
  moveIndex: 0,
  playerId: VC_PLAYER,
  budgets: ['interactive', 'turn', 'background'],
  evaluators: [
    // Layer 1: always checked
    categoryCompetence(['event', 'rally', 'march', 'attack', 'terror', 'tax', 'ambushVc']),
    // Layer 2: checked at turn+ budget
    victoryProgress(computeVcVictory, 35, 2),
    // Layer 3: checked at background budget only
    vcRallyQuality(),
    vcOppositionGrowth(),
    vcBaseExpansion(),
  ],
};
```

### 5.3 Adding New Scenarios

New scenarios are added by:
1. Defining a new `CompetenceScenario` entry with the game state setup (turnIndex/moveIndex or a custom state builder).
2. Composing the appropriate evaluators.
3. Adding the scenario to the `COMPETENCE_SCENARIOS` array.

No test runner changes needed. No production code changes. The scenario is pure data.

## 6. Relationship to Pool Sizing Optimization

### 6.1 The Sequencing

```
CURRENT STATE:
  Pool capacity 201 → pool fills by iteration 12 → search cannot converge
  → category tests pass (broad categories) but prove nothing about quality

AFTER THIS SPEC (competence tests defined):
  Layer 1 + Layer 2 pass at interactive/turn budgets
  Layer 3 tests FAIL at background budget (search can't converge due to pool)
  → competence bar is DEFINED but not yet REACHED

AFTER POOL OPTIMIZATION (62MCTSSEAVIS-019):
  Pool capacity adequate → search converges at background budget
  → Layer 3 tests go GREEN (or reveal that the evaluation function needs work)
  → competence bar is REACHED and LOCKED

AFTER FURTHER OPTIMIZATION (rollout, eval function, etc.):
  Any change that degrades Layer 3 results → test failure → caught immediately
  → optimization is goal-directed, not speculative
```

### 6.2 Failure Modes

| If this happens... | Competence tests catch it |
|-------------------|--------------------------|
| Pool optimization makes search pick worse moves | Layer 2 (victory trend) or Layer 3 (strategic quality) fails |
| Evaluation function change favors short-term over long-term | Layer 3 strategic evaluators fail (e.g., NVA not building trail) |
| Rollout change makes all moves look equal | Layer 1 fails (search picks pass) or Layer 2 (victory degrades) |
| Code refactoring breaks decision expansion | Layer 1 fails (crashes or pass-only) |

### 6.3 Failure Escalation Protocol

When competence tests consistently fail at a given budget tier, follow this
diagnostic sequence:

1. **Examine MCTS diagnostics** (visitor events):
   - Pool exhaustion occurring? -> Pool capacity insufficient -> Address in
     62MCTSSEAVIS-019 (pool sizing tickets).
   - Visit distribution flat? -> UCT exploration constant may need tuning.
   - Decision nodes receiving visits? -> If not, decision expansion may be
     broken -> Debug via Spec 62 decision expansion tests.

2. **Examine rollout quality**:
   - Rollout depth reaching terminal states? -> If not, rollout cutoff may
     be too shallow for FITL's game length.
   - Random rollouts producing meaningful signal? -> FITL has 4 factions
     with competing goals; pure random rollouts may converge slowly.

3. **Examine the MCTS evaluation heuristic** (`evaluate-state.ts`):
   - **Current heuristic is victory-threshold-blind.** It scores per-player
     integer variables by range-normalized weight (OWN=10000, OPPONENT=2500)
     but has no concept of distance-to-victory-threshold. A move from
     opposition 33->35 (winning for VC) scores identically to 10->12
     (irrelevant).
   - **Recommended improvement**: Replace generic per-var weighting with
     victory-formula-aware scoring that weights progress toward the
     faction's specific threshold. The `computeVictoryMarker()` kernel
     API and `VictoryFormula` type already exist for this purpose.
   - **Scope**: Heuristic improvements are a separate spec/ticket series.
     Competence tests define the *goal*; heuristic changes are the *means*.

4. **File targeted improvement tickets**:
   - If (1) pool -> pool sizing tickets
   - If (2) rollout -> rollout improvement tickets
   - If (3) heuristic -> new spec for victory-aware MCTS evaluation
   - Each ticket should reference the specific failing competence scenario(s)
     as acceptance criteria.

## 7. Strategic Knowledge Sources

### 7.1 Primary Sources

| Source | Location | Content |
|--------|----------|---------|
| FITL Rules Section 8 | `reports/fire-in-the-lake-rules-section-8.md` | Non-player flowcharts: operation priorities, space selection, piece placement |
| Victory Standings | `data/games/fire-in-the-lake/91-victory-standings.md` | Victory formulas: thresholds, scoring functions per faction |
| Terminal Conditions | `data/games/fire-in-the-lake/90-terminal.md` | Game-ending conditions |
| Rules Sections 1-7 | `reports/fire-in-the-lake-rules-section-*.md` | Core rules: operations, special activities, events |

### 7.2 Knowledge Extraction Process

For each evaluator, the process is:
1. Identify the strategic principle from the rules (e.g., "VC Rally: place guerrillas at bases with <4 underground guerrillas")
2. Translate to a state-delta check: compare `stateBefore.zones` vs `stateAfter.zones` for the relevant token types and locations
3. Define the expected direction (increase/decrease/maintain) and tolerance
4. Implement as a pure function of `CompetenceEvalContext`

## 8. Testing

### 8.1 Unit Tests for Evaluators

Each evaluator should have unit tests with synthetic game states:

```
test/unit/e2e-helpers/fitl-competence-evaluators.test.ts
```

| Test | Description |
|------|-------------|
| evaluator-skip | Evaluator returns pass when move type doesn't match |
| evaluator-pass | Evaluator returns pass on a known-good state delta |
| evaluator-fail | Evaluator returns fail on a known-bad state delta |
| budget-gating | Evaluator skipped when budget < minBudget |
| composition | Multiple evaluators compose correctly in a scenario |

### 8.2 Integration Tests

The competence test file itself (`fitl-competence.test.ts`) is the integration test. It runs real MCTS searches against the compiled FITL game definition and applies evaluators to actual search results.

## 9. Ticket Decomposition

| Ticket | Scope | Deps |
|--------|-------|------|
| 66MCTSCOMP-001 | Core types: `CompetenceEvaluator`, `CompetenceEvalContext`, `CompetenceEvalResult`, `CompetenceScenario` + `engineerScenarioState` helper | None |
| 66MCTSCOMP-002 | Layer 1 evaluator: `categoryCompetence` + unit tests | 001 |
| 66MCTSCOMP-002b | Cross-faction evaluators: `resourceDiscipline`, `monsoonAwareness`, `passStrategicValue` + unit tests | 001 |
| 66MCTSCOMP-003 | Layer 2 evaluators: `victoryProgress`, `victoryDefense` + unit tests | 001 |
| 66MCTSCOMP-004 | VC strategic evaluators (7): `vcRallyQuality`, `vcTerrorTarget`, `vcBaseExpansion`, `vcOppositionGrowth`, `vcResourceManagement` + `vcSubvertTargeting`, `vcTaxEfficiency` + unit tests | 001 |
| 66MCTSCOMP-005 | NVA strategic evaluators (6): `nvaAttackConditions`, `nvaMarchSouthward`, `nvaRallyTrailImprove`, `nvaControlGrowth`, `nvaInfiltrateValue` + `nvaBombardUsage` + unit tests | 001 |
| 66MCTSCOMP-006 | US strategic evaluators (6): `usSweepActivation`, `usAssaultRemoval`, `usSupportGrowth`, `usPacification` + `usTrailDegradation` (replaces `usAirPower`), `usForcePreservation` + unit tests | 001 |
| 66MCTSCOMP-007 | ARVN strategic evaluators (6): `arvnTrainCubes`, `arvnGovern`, `arvnControlMaintain`, `arvnSweepRaid` + `arvnLocControl`, `arvnAidPreservation` + unit tests | 001 |
| 66MCTSCOMP-008 | Playbook scenarios S1-S10 + test runner + test lane | 002, 002b, 003, 004-007 |
| 66MCTSCOMP-008b | Engineered scenarios S11-S15 + `engineerScenarioState` integration tests | 001, 008 |
| 66MCTSCOMP-009 | Documentation: competence testing guide + failure escalation protocol | 008, 008b |

## 10. Invariants

1. **No production code changes.** All competence evaluation code lives in `test/`.
2. **Game-agnostic types.** `CompetenceEvaluator`, `CompetenceEvalContext`, `CompetenceEvalResult` have no FITL-specific fields. FITL knowledge is in evaluator implementations.
3. **Budget-stratified.** Evaluators self-gate on minimum budget. Low-budget tests never fail on high-budget-only evaluators.
4. **Deterministic.** Same seed + same code = same results. Competence tests can be pinned to exact expected outcomes.
5. **Composable.** New evaluators and scenarios are additive. No structural changes to the test runner.
6. **Independent of pool sizing.** The competence bar is defined before pool optimization. Pool optimization success is measured by whether background-tier tests pass.

## 11. Out of Scope

- Pool sizing tuning (62MCTSSEAVIS-019) — this spec defines the goal, that spec provides the means.
- Evaluation function changes — competence tests validate the *result* of evaluation, not the evaluation function itself. However, Section 6.3 documents the escalation path when competence tests reveal heuristic blindness.
- Texas Hold'em competence — a separate spec if needed. The framework is game-agnostic; only the evaluators are FITL-specific.
- Runner AI overlay integration.
- Non-player AI flowchart implementation (Spec 30) — the competence tests validate MCTS search, not the non-player AI bot.

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This specification is preserved as historical design context only and is no longer part of the active architecture plan.
