/**
 * FITL MCTS fast-preset competence tests (200 iterations).
 *
 * Broad acceptable move sets — tests "don't be incompetent".
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
// Fast profile: broad acceptable categories
// ---------------------------------------------------------------------------

const FAST_ACCEPTABLE: readonly (readonly string[])[] = [
  /* S1: T1 VC  */ ['event', 'terror', 'rally'],
  /* S2: T1 ARVN */ ['train', 'patrol', 'sweep', 'assault'],
  /* S3: T2 NVA  */ ['rally', 'march', 'attack'],
  /* S4: T3 VC   */ ['rally', 'terror', 'event', 'march'],
  /* S5: T4 US   */ ['event', 'sweep', 'assault'],
  /* S6: T4 NVA  */ ['march', 'rally', 'attack'],
  /* S7: T5 VC   */ ['event', 'terror', 'rally'],
  /* S8: T6 ARVN */ ['sweep', 'assault', 'patrol', 'train'],
  /* S9: T7 NVA  */ ['attack', 'march', 'rally'],
];

describe('FITL MCTS fast-preset competence', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  describe('move-category competence', () => {
    for (const [i, scenario] of CATEGORY_SCENARIOS.entries()) {
      it(scenario.label, () => {
        const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);
        const result = runFitlMctsSearch(def, state, scenario.playerId, 'fast');
        assertMoveCategory(result.move, FAST_ACCEPTABLE[i]!, scenario.label);
      });
    }
  });

  describe('victory-trend competence', () => {
    it(VICTORY_SCENARIO.label, () => {
      const stateBefore = replayToDecisionPoint(
        def, baseState, VICTORY_SCENARIO.turnIndex, VICTORY_SCENARIO.moveIndex,
      );
      const result = runFitlMctsSearch(def, stateBefore, VICTORY_SCENARIO.playerId, 'fast');
      const stateAfter = applyMove(def, stateBefore, result.move).state;
      assertVictoryNonDegrading(def, stateBefore, stateAfter, computeUsVictory, 3, VICTORY_SCENARIO.label);
    });
  });
});
