/**
 * FITL MCTS default-preset competence tests (1500 iterations).
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
// Default profile: medium acceptable categories
// ---------------------------------------------------------------------------

const DEFAULT_ACCEPTABLE: readonly (readonly string[])[] = [
  /* S1: T1 VC  */ ['event', 'terror'],
  /* S2: T1 ARVN */ ['train', 'patrol'],
  /* S3: T2 NVA  */ ['rally', 'march'],
  /* S4: T3 VC   */ ['rally', 'terror', 'event'],
  /* S5: T4 US   */ ['event', 'sweep'],
  /* S6: T4 NVA  */ ['march', 'rally'],
  /* S7: T5 VC   */ ['event', 'terror'],
  /* S8: T6 ARVN */ ['sweep', 'assault'],
  /* S9: T7 NVA  */ ['attack', 'march'],
];

describe('FITL MCTS default-preset competence', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  describe('move-category competence', () => {
    for (const [i, scenario] of CATEGORY_SCENARIOS.entries()) {
      it(scenario.label, () => {
        const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);
        const result = runFitlMctsSearch(def, state, scenario.playerId, 'default');
        assertMoveCategory(result.move, DEFAULT_ACCEPTABLE[i]!, scenario.label);
      });
    }
  });

  describe('victory-trend competence', () => {
    it(VICTORY_SCENARIO.label, () => {
      const stateBefore = replayToDecisionPoint(
        def, baseState, VICTORY_SCENARIO.turnIndex, VICTORY_SCENARIO.moveIndex,
      );
      const result = runFitlMctsSearch(def, stateBefore, VICTORY_SCENARIO.playerId, 'default');
      const stateAfter = applyMove(def, stateBefore, result.move).state;
      assertVictoryNonDegrading(def, stateBefore, stateAfter, computeUsVictory, 1, VICTORY_SCENARIO.label);
    });
  });
});
