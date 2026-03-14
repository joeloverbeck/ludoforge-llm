/**
 * FITL MCTS strong-preset competence tests (5000 iterations).
 *
 * Strict acceptable move sets — tests "matches expert-level play".
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
// Strong profile: strict expected categories
// ---------------------------------------------------------------------------

const STRONG_ACCEPTABLE: readonly (readonly string[])[] = [
  /* S1: T1 VC  */ ['event'],
  /* S2: T1 ARVN */ ['train'],
  /* S3: T2 NVA  */ ['rally'],
  /* S4: T3 VC   */ ['rally'],
  /* S5: T4 US   */ ['event'],
  /* S6: T4 NVA  */ ['march'],
  /* S7: T5 VC   */ ['event'],
  /* S8: T6 ARVN */ ['sweep'],
  /* S9: T7 NVA  */ ['attack'],
];

describe('FITL MCTS strong-preset competence', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  describe('move-category competence', () => {
    for (const [i, scenario] of CATEGORY_SCENARIOS.entries()) {
      it(scenario.label, () => {
        const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);
        const result = runFitlMctsSearch(def, state, scenario.playerId, 'strong');
        assertMoveCategory(result.move, STRONG_ACCEPTABLE[i]!, scenario.label);
      });
    }
  });

  describe('victory-trend competence', () => {
    it(VICTORY_SCENARIO.label, () => {
      const stateBefore = replayToDecisionPoint(
        def, baseState, VICTORY_SCENARIO.turnIndex, VICTORY_SCENARIO.moveIndex,
      );
      const result = runFitlMctsSearch(def, stateBefore, VICTORY_SCENARIO.playerId, 'strong');
      const stateAfter = applyMove(def, stateBefore, result.move).state;
      assertVictoryNonDegrading(def, stateBefore, stateAfter, computeUsVictory, 0, VICTORY_SCENARIO.label);
    });
  });
});
