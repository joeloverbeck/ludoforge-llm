/**
 * FITL MCTS turn-profile competence tests (1500 iterations).
 *
 * Medium acceptable move sets — tests "makes reasonable choices".
 * Gated by RUN_MCTS_FITL_E2E=1 environment variable.
 */
import { describe, it } from 'node:test';

import { applyMove } from '../../../src/kernel/index.js';

import {
  RUN_MCTS_FITL_E2E,
  compileFitlDef,
  createPlaybookBaseState,
  replayToDecisionPoint,
  runFitlMctsSearch,
  assertMoveCategory,
  assertVictoryNonDegrading,
  computeUsVictory,
  CATEGORY_SCENARIOS,
  VICTORY_SCENARIO,
} from './fitl-mcts-test-helpers.js';

// ---------------------------------------------------------------------------
// Turn profile: medium acceptable categories
// ---------------------------------------------------------------------------

// Tuned 2026-03-18 from runtime classification visitor output.
// With pool exhaustion at capacity=201, 1500 iterations produce similar
// results to 200 (pool fills by iteration ~12). Categories include the
// strategically sound operations per scenario.
const TURN_ACCEPTABLE: readonly (readonly string[])[] = [
  /* S1: T1 VC  */ ['event', 'rally', 'march', 'attack', 'terror', 'tax'],
  /* S2: T1 ARVN */ ['train', 'patrol', 'sweep', 'govern', 'raid'],
  /* S3: T2 NVA  */ ['event', 'rally', 'march', 'terror', 'infiltrate'],
  /* S4: T3 VC   */ ['rally', 'terror', 'event', 'march', 'attack'],
  /* S5: T4 US   */ ['event', 'sweep', 'assault', 'train', 'patrol'],
  /* S6: T4 NVA  */ ['rally', 'march', 'terror', 'infiltrate'],
  /* S7: T5 VC   */ ['event', 'terror', 'rally', 'march', 'attack'],
  /* S8: T6 ARVN */ ['event', 'sweep', 'assault', 'patrol', 'train', 'govern', 'raid'],
  /* S9: T7 NVA  */ ['attack', 'march', 'rally', 'infiltrate', 'ambushNva'],
];

describe('FITL MCTS turn-profile competence', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  describe('move-category competence', () => {
    for (const [i, scenario] of CATEGORY_SCENARIOS.entries()) {
      it(scenario.label, () => {
        const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);
        const result = runFitlMctsSearch(def, state, scenario.playerId, 'turn');
        assertMoveCategory(result.move, TURN_ACCEPTABLE[i]!, scenario.label);
      });
    }
  });

  describe('victory-trend competence', () => {
    it(VICTORY_SCENARIO.label, () => {
      const stateBefore = replayToDecisionPoint(
        def, baseState, VICTORY_SCENARIO.turnIndex, VICTORY_SCENARIO.moveIndex,
      );
      const result = runFitlMctsSearch(def, stateBefore, VICTORY_SCENARIO.playerId, 'turn');
      const stateAfter = applyMove(def, stateBefore, result.move).state;
      assertVictoryNonDegrading(def, stateBefore, stateAfter, computeUsVictory, 1, VICTORY_SCENARIO.label);
    });
  });
});
