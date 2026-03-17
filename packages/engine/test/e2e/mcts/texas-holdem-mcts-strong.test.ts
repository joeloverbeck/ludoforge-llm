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
  type LeafEvaluator,
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
 * Create deterministic strong-preset agents with a specific leaf evaluator.
 * Uses a fixed iteration count WITHOUT a time limit for determinism.
 */
const createDeterministicStrongWithEvaluator = (count: number, evaluator: LeafEvaluator): readonly MctsAgent[] =>
  Array.from({ length: count }, () =>
    new MctsAgent({ ...resolvePreset('strong'), leafEvaluator: evaluator, iterations: 50, minIterations: 50 }),
  );

describe('texas hold\'em MCTS strong preset e2e', () => {
  it('strong preset uses heuristic leaf evaluator', () => {
    const config = resolvePreset('strong');
    assert.equal(
      (config.leafEvaluator?.type ?? 'heuristic'),
      'heuristic',
      'strong preset should use heuristic leaf evaluator',
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

        const agentsA = createDeterministicStrongWithEvaluator(playerCount, evaluator);
        const agentsB = createDeterministicStrongWithEvaluator(playerCount, evaluator);

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
    it('[slow] completes 2-player tournament with MCTS strong agents', () => {
      const def = compileTexasDef();
      const trace = loadTrace(def, 203, createTimeBudgetedStrongAgents(2), 2, DEFAULT_MAX_TURNS);
      assertValidStopReason(trace);
    });
  } else {
    it.skip('[slow] completes 2-player tournament with MCTS strong agents', () => {});
  }
});
