import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { budgetRank, type CompetenceEvalResult } from './fitl-competence-evaluators.js';
import { COMPETENCE_SCENARIOS } from './fitl-competence-scenarios.js';
import {
  RUN_MCTS_FITL_E2E,
  compileFitlDef,
  createPlaybookBaseState,
  replayToDecisionPoint,
  runFitlMctsTimedSearch,
} from './fitl-mcts-test-helpers.js';

const formatFailures = (
  results: readonly CompetenceEvalResult[],
): string => results
  .filter((result) => !result.passed)
  .map((result) =>
    `${result.evaluatorName}: ${result.explanation}${result.score === undefined ? '' : ` (score=${result.score})`}`)
  .join('\n');

describe('FITL MCTS competence scenarios', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  for (const scenario of COMPETENCE_SCENARIOS) {
    for (const budget of scenario.budgets) {
      it(`${scenario.id} ${budget} — ${scenario.label}`, () => {
        const stateBefore = scenario.engineeredState === undefined
          ? replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex)
          : scenario.engineeredState(def, baseState);
        const search = runFitlMctsTimedSearch(def, stateBefore, scenario.playerId, budget);

        const results = scenario.evaluators
          .filter((evaluator) => budgetRank(evaluator.minBudget) <= budgetRank(budget))
          .map((evaluator) => evaluator.evaluate({
            def,
            stateBefore,
            move: search.move,
            // FITL MCTS currently returns the selected root action family at these
            // pending decision points, not a fully resolved move that can be applied
            // generically. Interactive e2e competence is therefore limited to
            // pre-resolution-safe evaluators such as categoryCompetence.
            stateAfter: stateBefore,
            playerId: scenario.playerId,
            diagnostics: search.diagnostics,
            budget,
          }));

        const failures = results.filter((result) => !result.passed);
        assert.equal(
          failures.length,
          0,
          `${scenario.id} ${budget} failed for move '${String(search.move.actionId)}'\n${formatFailures(results)}`,
        );
      });
    }
  }
});
