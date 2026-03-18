import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_TURNS,
  MctsAgent,
  RUN_MCTS_E2E,
  assertValidStopReason,
  compileTexasDef,
  loadTrace,
  resolveBudgetProfile,
  runGame,
  type LeafEvaluator,
} from './mcts-test-helpers.js';

/**
 * MCTS background profile tests — uses heuristic evaluation with aggressive
 * iteration counts.
 *
 * All background profile tests are gated behind RUN_MCTS_E2E because they are
 * inherently expensive. Determinism tests use time-budgeted overrides.
 */

/** Create background agents with a tight time budget for smoke tests. */
const createTimeBudgetedBackgroundAgents = (count: number): readonly MctsAgent[] =>
  Array.from({ length: count }, () =>
    new MctsAgent({ ...resolveBudgetProfile('background'), timeLimitMs: 2_000, minIterations: 4 }),
  );

/**
 * Create deterministic background-profile agents with a specific leaf evaluator.
 * Uses a fixed iteration count WITHOUT a time limit for determinism.
 */
const createDeterministicBackgroundWithEvaluator = (count: number, evaluator: LeafEvaluator): readonly MctsAgent[] =>
  Array.from({ length: count }, () =>
    new MctsAgent({ ...resolveBudgetProfile('background'), leafEvaluator: evaluator, iterations: 50, minIterations: 50 }),
  );

describe('texas hold\'em MCTS background profile e2e', () => {
  it('background profile uses heuristic leaf evaluator', () => {
    const config = resolveBudgetProfile('background');
    assert.equal(
      (config.leafEvaluator?.type ?? 'heuristic'),
      'heuristic',
      'background profile should use heuristic leaf evaluator',
    );
  });

  // ── Mode-parameterized determinism ─────────────────────────────────────

  describe('determinism by leaf evaluator', () => {
    const evaluators: readonly { name: string; evaluator: LeafEvaluator }[] = [
      { name: 'rollout-full', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'full' } },
      { name: 'rollout-hybrid', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'hybrid' } },
      { name: 'heuristic', evaluator: { type: 'heuristic' } },
    ];
    for (const { name, evaluator } of evaluators) {
      it(`deterministic within ${name} evaluator`, () => {
        const def = compileTexasDef();
        const seed = 703;
        const playerCount = 2;
        const maxTurns = 3;

        const agentsA = createDeterministicBackgroundWithEvaluator(playerCount, evaluator);
        const agentsB = createDeterministicBackgroundWithEvaluator(playerCount, evaluator);

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

  // ── Extended tests (gated behind RUN_MCTS_E2E) ────────────────────────

  if (RUN_MCTS_E2E) {
    it('[slow] completes 2-player tournament with MCTS background agents', () => {
      const def = compileTexasDef();
      const trace = loadTrace(def, 203, createTimeBudgetedBackgroundAgents(2), 2, DEFAULT_MAX_TURNS);
      assertValidStopReason(trace);
    });
  } else {
    it.skip('[slow] completes 2-player tournament with MCTS background agents', () => {});
  }
});
