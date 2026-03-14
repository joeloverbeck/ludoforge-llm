import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_TURNS,
  RUN_MCTS_E2E,
  assertValidStopReason,
  compileTexasDef,
  createMctsAgents,
  loadTrace,
} from './mcts-test-helpers.js';

/**
 * MCTS strong preset tests — full MCTS with aggressive iteration counts.
 *
 * All strong preset tests are gated behind RUN_MCTS_E2E because they are
 * inherently expensive.
 */

describe('texas hold\'em MCTS strong preset e2e', () => {
  if (RUN_MCTS_E2E) {
    it('[slow] completes 2-player tournament with MCTS strong agents', () => {
      const def = compileTexasDef();
      const trace = loadTrace(def, 203, createMctsAgents(2, 'strong'), 2, DEFAULT_MAX_TURNS);
      assertValidStopReason(trace);
    });
  } else {
    it.skip('[slow] completes 2-player tournament with MCTS strong agents', () => {});
  }
});
