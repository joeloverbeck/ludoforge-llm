import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FAST_MAX_TURNS,
  GreedyAgent,
  MctsAgent,
  RandomAgent,
  RUN_MCTS_E2E,
  assertValidStopReason,
  compileTexasDef,
  createMctsAgents,
  loadTrace,
  resolvePreset,
  runGame,
  serializeTrace,
  type Agent,
  type MctsRolloutMode,
} from './mcts-test-helpers.js';

/**
 * MCTS fast preset tests — uses hybrid rollout mode with MAST playout policy.
 *
 * The fast preset defaults to `rolloutMode: 'hybrid'` and `rolloutPolicy: 'mast'`.
 * Core tests always run. Extended tests are gated behind RUN_MCTS_E2E.
 */

describe('texas hold\'em MCTS fast preset e2e', () => {
  // ── Core smoke tests (always run) ──────────────────────────────────────

  it('completes 2-player game with MCTS fast agents', () => {
    const def = compileTexasDef();
    const trace = loadTrace(def, 201, createMctsAgents(2, 'fast'), 2, FAST_MAX_TURNS);
    assertValidStopReason(trace);
  });

  it('fast preset uses direct mode and mast policy', () => {
    const config = resolvePreset('fast');
    assert.equal(config.rolloutMode, 'direct', 'fast preset should use direct mode');
    assert.equal(config.rolloutPolicy, 'mast', 'fast preset should use mast policy');
  });

  it('same seed + same MCTS config produces identical trace', () => {
    const def = compileTexasDef();
    const seed = 501;
    const playerCount = 2;
    const maxTurns = 10;

    const agentsA = createMctsAgents(playerCount, 'fast');
    const agentsB = createMctsAgents(playerCount, 'fast');

    const traceA = runGame(def, seed, agentsA, maxTurns, playerCount);
    const traceB = runGame(def, seed, agentsB, maxTurns, playerCount);

    assert.deepEqual(
      traceA.moves.map((entry) => entry.move),
      traceB.moves.map((entry) => entry.move),
    );
    assert.equal(traceA.finalState.stateHash, traceB.finalState.stateHash);
    assert.deepEqual(serializeTrace(traceA), serializeTrace(traceB));
  });

  // ── Mode-parameterized determinism ─────────────────────────────────────

  describe('determinism by rollout mode', () => {
    /**
     * Create deterministic fast-preset agents with a specific rollout mode.
     * Uses a fixed iteration count WITHOUT a time limit — wall-clock limits
     * cause non-deterministic iteration counts across runs.
     */
    const createDeterministicFastWithMode = (count: number, mode: MctsRolloutMode): readonly Agent[] =>
      Array.from({ length: count }, () =>
        new MctsAgent({ ...resolvePreset('fast'), rolloutMode: mode, iterations: 50, minIterations: 50 }),
      );

    const modes: readonly MctsRolloutMode[] = ['legacy', 'hybrid', 'direct'];
    for (const mode of modes) {
      it(`deterministic within ${mode} mode`, () => {
        const def = compileTexasDef();
        const seed = 701;
        const playerCount = 2;
        const maxTurns = 3;

        const agentsA = createDeterministicFastWithMode(playerCount, mode);
        const agentsB = createDeterministicFastWithMode(playerCount, mode);

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

  it('MCTS fast completes 2-player game within wall-clock budget', () => {
    const def = compileTexasDef();
    const start = Date.now();
    const trace = loadTrace(def, 701, createMctsAgents(2, 'fast'), 2, FAST_MAX_TURNS);
    const elapsed = Date.now() - start;

    assert.ok(trace.moves.length > 0, 'trace should contain moves');
    // Generous bound: 300 seconds for a 200-turn tournament
    // (allows headroom when running alongside determinism tests)
    assert.ok(elapsed < 300_000, `MCTS fast 2-player took ${elapsed}ms, expected < 300000ms`);
  });

  // ── Extended tests (gated behind RUN_MCTS_E2E) ────────────────────────

  describe('extended tournaments', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes 3-player tournament with MCTS fast agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 301, createMctsAgents(3, 'fast'), 3, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes 6-player tournament with MCTS fast agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 601, createMctsAgents(6, 'fast'), 6, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes 3-player tournament with MCTS fast agents', () => {});
      it.skip('[slow] completes 6-player tournament with MCTS fast agents', () => {});
    }
  });

  describe('mixed agent tournaments', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes tournament with MCTS fast vs random agents', () => {
        const def = compileTexasDef();
        const agents: readonly Agent[] = [
          new MctsAgent(resolvePreset('fast')),
          new RandomAgent(),
        ];
        const trace = loadTrace(def, 401, agents, 2, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes tournament with MCTS fast vs greedy agents', () => {
        const def = compileTexasDef();
        const agents: readonly Agent[] = [
          new MctsAgent(resolvePreset('fast')),
          new GreedyAgent(),
        ];
        const trace = loadTrace(def, 402, agents, 2, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes tournament with MCTS fast vs random agents', () => {});
      it.skip('[slow] completes tournament with MCTS fast vs greedy agents', () => {});
    }
  });
});
