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
  type LeafEvaluator,
} from './mcts-test-helpers.js';

/**
 * MCTS fast preset tests — uses hybrid rollout mode with MAST playout policy.
 *
 * The fast preset defaults to `leafEvaluator: { type: 'heuristic' }`.
 * Core tests always run. Extended tests are gated behind RUN_MCTS_E2E.
 */

describe('texas hold\'em MCTS fast preset e2e', () => {
  // ── Core smoke tests (always run) ──────────────────────────────────────

  it('completes 2-player game with MCTS fast agents', () => {
    const def = compileTexasDef();
    const trace = loadTrace(def, 201, createMctsAgents(2, 'fast'), 2, FAST_MAX_TURNS);
    assertValidStopReason(trace);
  });

  it('fast preset uses heuristic leaf evaluator', () => {
    const config = resolvePreset('fast');
    assert.equal(
      (config.leafEvaluator?.type ?? 'heuristic'),
      'heuristic',
      'fast preset should use heuristic leaf evaluator',
    );
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

  describe('determinism by leaf evaluator', () => {
    /**
     * Create deterministic fast-preset agents with a specific leaf evaluator.
     * Uses a fixed iteration count WITHOUT a time limit — wall-clock limits
     * cause non-deterministic iteration counts across runs.
     */
    const createDeterministicFastWithEvaluator = (count: number, evaluator: LeafEvaluator): readonly Agent[] =>
      Array.from({ length: count }, () =>
        new MctsAgent({ ...resolvePreset('fast'), leafEvaluator: evaluator, iterations: 50, minIterations: 50 }),
      );

    const evaluators: readonly { name: string; evaluator: LeafEvaluator }[] = [
      { name: 'rollout-full', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'full' } },
      { name: 'rollout-hybrid', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'hybrid' } },
      { name: 'heuristic', evaluator: { type: 'heuristic' } },
    ];
    for (const { name, evaluator } of evaluators) {
      it(`deterministic within ${name} evaluator`, () => {
        const def = compileTexasDef();
        const seed = 701;
        const playerCount = 2;
        const maxTurns = 3;

        const agentsA = createDeterministicFastWithEvaluator(playerCount, evaluator);
        const agentsB = createDeterministicFastWithEvaluator(playerCount, evaluator);

        const traceA = runGame(def, seed, agentsA, maxTurns, playerCount);
        const traceB = runGame(def, seed, agentsB, maxTurns, playerCount);

        assert.deepEqual(
          traceA.moves.map((entry) => entry.move),
          traceB.moves.map((entry) => entry.move),
          `${name}: same seed should produce same moves`,
        );
        assert.equal(
          traceA.finalState.stateHash,
          traceB.finalState.stateHash,
          `${name}: same seed should produce same final state`,
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
