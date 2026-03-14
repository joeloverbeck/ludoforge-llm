import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_TURNS,
  MctsAgent,
  RUN_MCTS_E2E,
  assertValidStopReason,
  compileTexasDef,
  loadTrace,
  resolvePreset,
  runGame,
  type MctsRolloutMode,
} from './mcts-test-helpers.js';

/**
 * MCTS strong preset tests — uses hybrid rollout mode with MAST playout
 * policy and aggressive iteration counts.
 *
 * All strong preset tests are gated behind RUN_MCTS_E2E because they are
 * inherently expensive. Determinism tests use time-budgeted overrides.
 */

/** Create strong agents with a tight time budget for smoke tests. */
const createTimeBudgetedStrongAgents = (count: number): readonly MctsAgent[] =>
  Array.from({ length: count }, () =>
    new MctsAgent({ ...resolvePreset('strong'), timeLimitMs: 2_000, minIterations: 4 }),
  );

/**
 * Create deterministic strong-preset agents with a specific rollout mode.
 * Uses a fixed iteration count WITHOUT a time limit for determinism.
 */
const createDeterministicStrongWithMode = (count: number, mode: MctsRolloutMode): readonly MctsAgent[] =>
  Array.from({ length: count }, () =>
    new MctsAgent({ ...resolvePreset('strong'), rolloutMode: mode, iterations: 50, minIterations: 50 }),
  );

describe('texas hold\'em MCTS strong preset e2e', () => {
  it('strong preset uses hybrid mode and mast policy', () => {
    const config = resolvePreset('strong');
    assert.equal(config.rolloutMode, 'hybrid', 'strong preset should use hybrid mode');
    assert.equal(config.rolloutPolicy, 'mast', 'strong preset should use mast policy');
  });

  // ── Mode-parameterized determinism ─────────────────────────────────────

  describe('determinism by rollout mode', () => {
    const modes: readonly MctsRolloutMode[] = ['legacy', 'hybrid', 'direct'];
    for (const mode of modes) {
      it(`deterministic within ${mode} mode`, () => {
        const def = compileTexasDef();
        const seed = 703;
        const playerCount = 2;
        const maxTurns = 3;

        const agentsA = createDeterministicStrongWithMode(playerCount, mode);
        const agentsB = createDeterministicStrongWithMode(playerCount, mode);

        const traceA = runGame(def, seed, agentsA, maxTurns, playerCount);
        const traceB = runGame(def, seed, agentsB, maxTurns, playerCount);

        assert.deepEqual(
          traceA.moves.map((entry) => entry.move),
          traceB.moves.map((entry) => entry.move),
          `${mode}: same seed should produce same moves`,
        );
        assert.equal(
          traceA.finalState.stateHash,
          traceB.finalState.stateHash,
          `${mode}: same seed should produce same final state`,
        );
      });
    }
  });

  // ── Extended tests (gated behind RUN_MCTS_E2E) ────────────────────────

  if (RUN_MCTS_E2E) {
    it('[slow] completes 2-player tournament with MCTS strong agents', () => {
      const def = compileTexasDef();
      const trace = loadTrace(def, 203, createTimeBudgetedStrongAgents(2), 2, DEFAULT_MAX_TURNS);
      assertValidStopReason(trace);
    });
  } else {
    it.skip('[slow] completes 2-player tournament with MCTS strong agents', () => {});
  }
});
