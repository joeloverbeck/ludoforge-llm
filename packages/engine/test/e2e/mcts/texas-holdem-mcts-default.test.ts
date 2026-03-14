import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_TURNS,
  MctsAgent,
  RUN_MCTS_E2E,
  assertValidStopReason,
  compileTexasDef,
  createTimeBudgetedDefaultAgents,
  loadTrace,
  resolvePreset,
  runGame,
  type MctsRolloutMode,
} from './mcts-test-helpers.js';

/**
 * MCTS default preset tests — uses hybrid rollout mode with MAST playout
 * policy. The default preset exercises deeper search than fast.
 *
 * All default preset tests use time-budgeted agents (timeLimitMs: 1000,
 * minIterations: 4) to prevent test timeouts while still exercising
 * the hybrid rollout path.
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

  it('default preset uses hybrid mode and mast policy', () => {
    const config = resolvePreset('default');
    assert.equal(config.rolloutMode, 'hybrid', 'default preset should use hybrid mode');
    assert.equal(config.rolloutPolicy, 'mast', 'default preset should use mast policy');
  });

  // ── Mode-parameterized determinism ─────────────────────────────────────

  describe('determinism by rollout mode', () => {
    /**
     * Create deterministic default-preset agents with a specific rollout mode.
     * Uses a small fixed iteration count WITHOUT a time limit — wall-clock
     * limits cause non-deterministic iteration counts across runs.
     */
    const createDeterministicWithMode = (count: number, mode: MctsRolloutMode): readonly MctsAgent[] =>
      Array.from({ length: count }, () =>
        new MctsAgent({ ...resolvePreset('default'), rolloutMode: mode, iterations: 50, minIterations: 50 }),
      );

    const modes: readonly MctsRolloutMode[] = ['legacy', 'hybrid', 'direct'];
    for (const mode of modes) {
      it(`deterministic within ${mode} mode`, () => {
        const def = compileTexasDef();
        const seed = 702;
        const playerCount = 2;
        const maxTurns = 3;

        const agentsA = createDeterministicWithMode(playerCount, mode);
        const agentsB = createDeterministicWithMode(playerCount, mode);

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
