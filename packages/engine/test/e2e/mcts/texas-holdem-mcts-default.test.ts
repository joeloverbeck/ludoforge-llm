import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_TURNS,
  RUN_MCTS_E2E,
  assertValidStopReason,
  compileTexasDef,
  createTimeBudgetedDefaultAgents,
  loadTrace,
} from './mcts-test-helpers.js';

/**
 * MCTS default preset tests — uses epsilon-greedy rollout which exercises
 * the evaluateState → runtime threading fix.
 *
 * All default preset tests use time-budgeted agents (timeLimitMs: 1000,
 * minIterations: 4) to prevent test timeouts while still exercising
 * epsilon-greedy rollouts.
 *
 * Core tests always run. Extended tests are gated behind RUN_MCTS_E2E.
 */

describe('texas hold\'em MCTS default preset e2e', () => {
  // ── Core smoke test (always runs) ──────────────────────────────────────

  it('completes 2-player game with MCTS default agents', () => {
    const def = compileTexasDef();
    const trace = loadTrace(def, 202, createTimeBudgetedDefaultAgents(2), 2, DEFAULT_MAX_TURNS);
    assertValidStopReason(trace);
  });

  // ── Extended tests (gated behind RUN_MCTS_E2E) ────────────────────────

  describe('extended tournaments', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes 3-player tournament with MCTS default agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 302, createTimeBudgetedDefaultAgents(3), 3, DEFAULT_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes 6-player tournament with MCTS default agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 602, createTimeBudgetedDefaultAgents(6), 6, DEFAULT_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes 3-player tournament with MCTS default agents', () => {});
      it.skip('[slow] completes 6-player tournament with MCTS default agents', () => {});
    }
  });
});
