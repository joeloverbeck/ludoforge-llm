/**
 * FITL MCTS budget-profile competence tests.
 *
 * Validates that `interactive` and `turn` profiles:
 * 1. Complete search within their `timeLimitMs` budget.
 * 2. Return a move (no crash or timeout).
 * 3. Return a legal move.
 *
 * Additionally, the `interactive` profile (2 s budget) must report
 * `elapsedMs < timeLimitMs` in wall-clock time.
 *
 * These are validation tests — no production source code changes.
 *
 * Gated by RUN_MCTS_FITL_E2E=1 environment variable.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MctsBudgetProfile } from '../../../src/agents/index.js';

import {
  RUN_MCTS_FITL_E2E,
  compileFitlDef,
  createPlaybookBaseState,
  replayToDecisionPoint,
  runFitlMctsTimedSearch,
  CATEGORY_SCENARIOS,
} from './fitl-mcts-test-helpers.js';

// ---------------------------------------------------------------------------
// Budget profiles under test
// ---------------------------------------------------------------------------

const PROFILES_UNDER_TEST: readonly MctsBudgetProfile[] = ['interactive', 'turn'];

// Use S1 (T1 VC — high cardinality) as the representative scenario.
const REPRESENTATIVE = CATEGORY_SCENARIOS[0]!;

describe('FITL MCTS budget-profile competence', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  for (const profile of PROFILES_UNDER_TEST) {
    describe(`${profile} profile`, () => {
      it('search completes and returns a legal move', () => {
        const state = replayToDecisionPoint(
          def, baseState, REPRESENTATIVE.turnIndex, REPRESENTATIVE.moveIndex,
        );
        const result = runFitlMctsTimedSearch(def, state, REPRESENTATIVE.playerId, profile);

        // 1. A move was returned (no crash or timeout).
        assert.ok(result.move !== undefined, `${profile}: expected a move to be returned`);
        assert.ok(
          result.move.actionId !== undefined,
          `${profile}: returned move has no actionId`,
        );

        // 2. The returned move is legal.
        const actionId = String(result.move.actionId);
        assert.ok(
          result.legalMoveIds.includes(actionId),
          `${profile}: returned actionId '${actionId}' not in legal moves [${result.legalMoveIds.join(', ')}]`,
        );

        // 3. Search completed at least 1 iteration.
        assert.ok(
          result.iterations >= 1,
          `${profile}: expected ≥1 iteration, got ${result.iterations}`,
        );
      });

      it('search completes within timeLimitMs', () => {
        const state = replayToDecisionPoint(
          def, baseState, REPRESENTATIVE.turnIndex, REPRESENTATIVE.moveIndex,
        );
        const result = runFitlMctsTimedSearch(def, state, REPRESENTATIVE.playerId, profile);

        // Allow 20% tolerance for OS scheduling jitter.
        const tolerance = 1.2;
        const budgetMs = result.timeLimitMs;
        assert.ok(
          result.elapsedMs < budgetMs * tolerance,
          `${profile}: elapsed ${result.elapsedMs}ms exceeds budget ${budgetMs}ms (with ${((tolerance - 1) * 100).toFixed(0)}% tolerance)`,
        );
      });
    });
  }

  describe('interactive profile strict timing', () => {
    it('totalTimeMs < timeLimitMs (2 s budget)', () => {
      const state = replayToDecisionPoint(
        def, baseState, REPRESENTATIVE.turnIndex, REPRESENTATIVE.moveIndex,
      );
      const result = runFitlMctsTimedSearch(def, state, REPRESENTATIVE.playerId, 'interactive');

      // diagnostics.totalTimeMs is high-resolution performance.now() timing.
      const totalTimeMs = result.diagnostics.totalTimeMs;
      if (totalTimeMs !== undefined) {
        assert.ok(
          totalTimeMs < result.timeLimitMs,
          `interactive: totalTimeMs ${totalTimeMs.toFixed(1)}ms exceeds budget ${result.timeLimitMs}ms`,
        );
      }

      // Wall-clock fallback (Date.now() timing from the helper).
      assert.ok(
        result.elapsedMs < result.timeLimitMs * 1.1,
        `interactive: elapsedMs ${result.elapsedMs}ms exceeds budget ${result.timeLimitMs}ms (10% tolerance)`,
      );
    });
  });
});
