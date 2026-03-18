/* eslint-disable no-console */
/**
 * Cross-evaluator comparison E2E test for MCTS leaf evaluators.
 *
 * Runs the same Texas Hold'em position through all evaluator variants
 * (rollout-full, rollout-hybrid, heuristic) and compares speed,
 * diagnostics, and move agreement.
 *
 * Key assertions:
 * - `rollout-hybrid` is faster than `rollout-full` for each profile.
 * - All evaluators produce deterministic results within themselves.
 * - Move disagreements between evaluators are logged (not asserted —
 *   different evaluators may legitimately choose different moves).
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileTexasDef,
  createMctsAgentsWithEvaluator,
  formatSearchDiagnostics,
  runPositionSearch,
  runTimedGame,
  type LeafEvaluator,
} from './mcts-test-helpers.js';

const EVALUATORS: readonly { name: string; evaluator: LeafEvaluator }[] = [
  { name: 'rollout-full', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'full' } },
  { name: 'rollout-hybrid', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'hybrid' } },
  { name: 'heuristic', evaluator: { type: 'heuristic' } },
];
const COMPARE_SEED = 1001;
const COMPARE_MAX_TURNS = 5;
const COMPARE_PLAYER_COUNT = 2;

const ROLLOUT_FULL: LeafEvaluator = { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'full' };
const ROLLOUT_HYBRID: LeafEvaluator = { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'hybrid' };

describe('texas hold\'em MCTS evaluator comparison', () => {
  // ── Single-position diagnostics ──────────────────────────────────────

  describe('single-position diagnostics', () => {
    it('records per-evaluator diagnostics for interactive profile', () => {
      const def = compileTexasDef();
      for (const { name, evaluator } of EVALUATORS) {
        const result = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'interactive', evaluator);
        assert.ok(result.iterations > 0, `${name}: expected >0 iterations`);
        assert.ok(
          result.diagnostics.leafEvaluatorType !== undefined,
          `${name}: diagnostics should record evaluator type`,
        );
        assert.ok(
          result.diagnostics.rootStopReason !== undefined,
          `${name}: should have a stop reason`,
        );
        console.log(`[evaluator-compare] interactive/${name}:\n${formatSearchDiagnostics(result.diagnostics)}`);
      }
    });

    it('records per-evaluator diagnostics for turn profile', () => {
      const def = compileTexasDef();
      for (const { name, evaluator } of EVALUATORS) {
        const result = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'turn', evaluator);
        assert.ok(result.iterations > 0, `${name}: expected >0 iterations`);
        console.log(`[evaluator-compare] turn/${name}:\n${formatSearchDiagnostics(result.diagnostics)}`);
      }
    });
  });

  // ── Speed comparison ─────────────────────────────────────────────────

  describe('rollout-hybrid is faster than rollout-full', () => {
    it('rollout-hybrid is faster than rollout-full for interactive profile (full game)', () => {
      const def = compileTexasDef();
      const fullAgents = createMctsAgentsWithEvaluator(COMPARE_PLAYER_COUNT, 'interactive', ROLLOUT_FULL);
      const hybridAgents = createMctsAgentsWithEvaluator(COMPARE_PLAYER_COUNT, 'interactive', ROLLOUT_HYBRID);

      const full = runTimedGame(def, COMPARE_SEED, fullAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);
      const hybrid = runTimedGame(def, COMPARE_SEED, hybridAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);

      console.log(
        `[evaluator-compare] interactive game: full=${full.elapsedMs}ms, hybrid=${hybrid.elapsedMs}ms, ` +
        `speedup=${(full.elapsedMs / Math.max(hybrid.elapsedMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybrid.elapsedMs <= full.elapsedMs,
        `hybrid (${hybrid.elapsedMs}ms) should be faster than full (${full.elapsedMs}ms)`,
      );
    });

    it('rollout-hybrid is faster than rollout-full for turn profile (full game)', () => {
      const def = compileTexasDef();
      const fullAgents = createMctsAgentsWithEvaluator(COMPARE_PLAYER_COUNT, 'turn', ROLLOUT_FULL);
      const hybridAgents = createMctsAgentsWithEvaluator(COMPARE_PLAYER_COUNT, 'turn', ROLLOUT_HYBRID);

      const full = runTimedGame(def, COMPARE_SEED, fullAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);
      const hybrid = runTimedGame(def, COMPARE_SEED, hybridAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);

      console.log(
        `[evaluator-compare] turn game: full=${full.elapsedMs}ms, hybrid=${hybrid.elapsedMs}ms, ` +
        `speedup=${(full.elapsedMs / Math.max(hybrid.elapsedMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybrid.elapsedMs <= full.elapsedMs,
        `hybrid (${hybrid.elapsedMs}ms) should be faster than full (${full.elapsedMs}ms)`,
      );
    });

    it('rollout-hybrid is faster than rollout-full for background profile (single position)', () => {
      const def = compileTexasDef();

      // Background profile is too slow for full games in CI, use single-position comparison.
      const full = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'background', ROLLOUT_FULL);
      const hybrid = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'background', ROLLOUT_HYBRID);

      console.log(
        `[evaluator-compare] background position: full=${full.elapsedMs}ms, hybrid=${hybrid.elapsedMs}ms, ` +
        `speedup=${(full.elapsedMs / Math.max(hybrid.elapsedMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybrid.elapsedMs <= full.elapsedMs,
        `hybrid (${hybrid.elapsedMs}ms) should be faster than full (${full.elapsedMs}ms)`,
      );
    });
  });

  // ── Determinism within each evaluator ─────────────────────────────────

  describe('determinism within each evaluator', () => {
    for (const { name, evaluator } of EVALUATORS) {
      it(`${name} evaluator produces deterministic results (same seed = same move)`, () => {
        const def = compileTexasDef();

        const resultA = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'interactive', evaluator);
        const resultB = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'interactive', evaluator);

        assert.deepEqual(
          resultA.move,
          resultB.move,
          `${name}: same seed should produce same move`,
        );
        assert.equal(
          resultA.iterations,
          resultB.iterations,
          `${name}: same seed should produce same iteration count`,
        );
      });
    }
  });

  // ── Move agreement logging ───────────────────────────────────────────

  describe('move agreement between evaluators', () => {
    it('logs move agreement/disagreement between rollout-full and rollout-hybrid', () => {
      const def = compileTexasDef();
      const seeds = [1001, 1002, 1003, 1004, 1005];
      let agreements = 0;

      for (const seed of seeds) {
        const full = runPositionSearch(def, seed, COMPARE_PLAYER_COUNT, 'interactive', ROLLOUT_FULL);
        const hybrid = runPositionSearch(def, seed, COMPARE_PLAYER_COUNT, 'interactive', ROLLOUT_HYBRID);

        const agree = JSON.stringify(full.move) === JSON.stringify(hybrid.move);
        if (agree) {
          agreements += 1;
        } else {
          console.log(
            `[evaluator-compare] seed=${seed}: move disagreement — ` +
            `full=${JSON.stringify(full.move)}, hybrid=${JSON.stringify(hybrid.move)}`,
          );
        }
      }

      console.log(
        `[evaluator-compare] move agreement: ${agreements}/${seeds.length} ` +
        `(${Math.round((agreements / seeds.length) * 100)}%)`,
      );

      // Log only — different evaluators may legitimately choose different moves.
      assert.ok(true, 'move agreement logged for manual review');
    });
  });
});
