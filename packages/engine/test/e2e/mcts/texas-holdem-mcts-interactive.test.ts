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
  resolveBudgetProfile,
  runGame,
  serializeTrace,
  type Agent,
  type LeafEvaluator,
} from './mcts-test-helpers.js';

/**
 * MCTS interactive profile tests — uses heuristic evaluation.
 *
 * The interactive profile defaults to `leafEvaluator: { type: 'heuristic' }`.
 * Core tests always run. Extended tests are gated behind RUN_MCTS_E2E.
 */

describe('texas hold\'em MCTS interactive profile e2e', () => {
  // ── Core smoke tests (always run) ──────────────────────────────────────

  it('completes 2-player game with MCTS interactive agents', () => {
    const def = compileTexasDef();
    const trace = loadTrace(def, 201, createMctsAgents(2, 'interactive'), 2, FAST_MAX_TURNS);
    assertValidStopReason(trace);
  });

  it('interactive profile uses heuristic leaf evaluator', () => {
    const config = resolveBudgetProfile('interactive');
    assert.equal(
      (config.leafEvaluator?.type ?? 'heuristic'),
      'heuristic',
      'interactive profile should use heuristic leaf evaluator',
    );
  });

  it('same seed + same MCTS config produces identical trace', () => {
    const def = compileTexasDef();
    const seed = 501;
    const playerCount = 2;
    const maxTurns = 10;

    const agentsA = createMctsAgents(playerCount, 'interactive');
    const agentsB = createMctsAgents(playerCount, 'interactive');

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
     * Create deterministic interactive-profile agents with a specific leaf evaluator.
     * Uses a fixed iteration count WITHOUT a time limit — wall-clock limits
     * cause non-deterministic iteration counts across runs.
     */
    const createDeterministicInteractiveWithEvaluator = (count: number, evaluator: LeafEvaluator): readonly Agent[] =>
      Array.from({ length: count }, () =>
        new MctsAgent({ ...resolveBudgetProfile('interactive'), leafEvaluator: evaluator, iterations: 50, minIterations: 50 }),
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

        const agentsA = createDeterministicInteractiveWithEvaluator(playerCount, evaluator);
        const agentsB = createDeterministicInteractiveWithEvaluator(playerCount, evaluator);

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

  it('MCTS interactive completes 2-player game within wall-clock budget', () => {
    const def = compileTexasDef();
    const start = Date.now();
    const trace = loadTrace(def, 701, createMctsAgents(2, 'interactive'), 2, FAST_MAX_TURNS);
    const elapsed = Date.now() - start;

    assert.ok(trace.moves.length > 0, 'trace should contain moves');
    // Generous bound: 300 seconds for a 200-turn tournament
    // (allows headroom when running alongside determinism tests)
    assert.ok(elapsed < 300_000, `MCTS interactive 2-player took ${elapsed}ms, expected < 300000ms`);
  });

  // ── Extended tests (gated behind RUN_MCTS_E2E) ────────────────────────

  describe('extended tournaments', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes 3-player tournament with MCTS interactive agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 301, createMctsAgents(3, 'interactive'), 3, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes 6-player tournament with MCTS interactive agents', () => {
        const def = compileTexasDef();
        const trace = loadTrace(def, 601, createMctsAgents(6, 'interactive'), 6, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes 3-player tournament with MCTS interactive agents', () => {});
      it.skip('[slow] completes 6-player tournament with MCTS interactive agents', () => {});
    }
  });

  describe('mixed agent tournaments', () => {
    if (RUN_MCTS_E2E) {
      it('[slow] completes tournament with MCTS interactive vs random agents', () => {
        const def = compileTexasDef();
        const agents: readonly Agent[] = [
          new MctsAgent(resolveBudgetProfile('interactive')),
          new RandomAgent(),
        ];
        const trace = loadTrace(def, 401, agents, 2, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });

      it('[slow] completes tournament with MCTS interactive vs greedy agents', () => {
        const def = compileTexasDef();
        const agents: readonly Agent[] = [
          new MctsAgent(resolveBudgetProfile('interactive')),
          new GreedyAgent(),
        ];
        const trace = loadTrace(def, 402, agents, 2, FAST_MAX_TURNS);
        assertValidStopReason(trace);
      });
    } else {
      it.skip('[slow] completes tournament with MCTS interactive vs random agents', () => {});
      it.skip('[slow] completes tournament with MCTS interactive vs greedy agents', () => {});
    }
  });
});
