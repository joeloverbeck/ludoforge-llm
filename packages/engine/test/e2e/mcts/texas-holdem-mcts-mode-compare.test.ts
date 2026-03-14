/* eslint-disable no-console */
/**
 * Cross-mode comparison E2E test for MCTS rollout modes.
 *
 * Runs the same Texas Hold'em position through all three modes
 * (legacy, hybrid, direct) and compares speed, diagnostics, and
 * move agreement.
 *
 * Key assertions:
 * - `hybrid` is faster than `legacy` for each preset.
 * - All modes produce deterministic results within themselves.
 * - Move disagreements between modes are logged (not asserted —
 *   different modes may legitimately choose different moves).
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileTexasDef,
  createMctsAgentsWithMode,
  formatSearchDiagnostics,
  runPositionSearch,
  runTimedGame,
  type MctsRolloutMode,
} from './mcts-test-helpers.js';

const MODES: readonly MctsRolloutMode[] = ['legacy', 'hybrid', 'direct'];
const COMPARE_SEED = 1001;
const COMPARE_MAX_TURNS = 5;
const COMPARE_PLAYER_COUNT = 2;

describe('texas hold\'em MCTS mode comparison', () => {
  // ── Single-position diagnostics ──────────────────────────────────────

  describe('single-position diagnostics', () => {
    it('records per-mode diagnostics for fast preset', () => {
      const def = compileTexasDef();
      for (const mode of MODES) {
        const result = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'fast', mode);
        assert.ok(result.iterations > 0, `${mode}: expected >0 iterations`);
        assert.ok(result.diagnostics.rolloutMode === mode, `${mode}: diagnostics should record mode`);
        assert.ok(
          result.diagnostics.rootStopReason !== undefined,
          `${mode}: should have a stop reason`,
        );
        console.log(`[mode-compare] fast/${mode}:\n${formatSearchDiagnostics(result.diagnostics)}`);
      }
    });

    it('records per-mode diagnostics for default preset', () => {
      const def = compileTexasDef();
      for (const mode of MODES) {
        const result = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'default', mode);
        assert.ok(result.iterations > 0, `${mode}: expected >0 iterations`);
        console.log(`[mode-compare] default/${mode}:\n${formatSearchDiagnostics(result.diagnostics)}`);
      }
    });
  });

  // ── Speed comparison ─────────────────────────────────────────────────

  describe('hybrid is faster than legacy', () => {
    it('hybrid is faster than legacy for fast preset (full game)', () => {
      const def = compileTexasDef();
      const legacyAgents = createMctsAgentsWithMode(COMPARE_PLAYER_COUNT, 'fast', 'legacy');
      const hybridAgents = createMctsAgentsWithMode(COMPARE_PLAYER_COUNT, 'fast', 'hybrid');

      const legacy = runTimedGame(def, COMPARE_SEED, legacyAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);
      const hybrid = runTimedGame(def, COMPARE_SEED, hybridAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);

      console.log(
        `[mode-compare] fast game: legacy=${legacy.elapsedMs}ms, hybrid=${hybrid.elapsedMs}ms, ` +
        `speedup=${(legacy.elapsedMs / Math.max(hybrid.elapsedMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybrid.elapsedMs <= legacy.elapsedMs,
        `hybrid (${hybrid.elapsedMs}ms) should be faster than legacy (${legacy.elapsedMs}ms)`,
      );
    });

    it('hybrid is faster than legacy for default preset (full game)', () => {
      const def = compileTexasDef();
      const legacyAgents = createMctsAgentsWithMode(COMPARE_PLAYER_COUNT, 'default', 'legacy');
      const hybridAgents = createMctsAgentsWithMode(COMPARE_PLAYER_COUNT, 'default', 'hybrid');

      const legacy = runTimedGame(def, COMPARE_SEED, legacyAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);
      const hybrid = runTimedGame(def, COMPARE_SEED, hybridAgents, COMPARE_MAX_TURNS, COMPARE_PLAYER_COUNT);

      console.log(
        `[mode-compare] default game: legacy=${legacy.elapsedMs}ms, hybrid=${hybrid.elapsedMs}ms, ` +
        `speedup=${(legacy.elapsedMs / Math.max(hybrid.elapsedMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybrid.elapsedMs <= legacy.elapsedMs,
        `hybrid (${hybrid.elapsedMs}ms) should be faster than legacy (${legacy.elapsedMs}ms)`,
      );
    });

    it('hybrid is faster than legacy for strong preset (single position)', () => {
      const def = compileTexasDef();

      // Strong preset is too slow for full games in CI, use single-position comparison.
      const legacy = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'strong', 'legacy');
      const hybrid = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'strong', 'hybrid');

      console.log(
        `[mode-compare] strong position: legacy=${legacy.elapsedMs}ms, hybrid=${hybrid.elapsedMs}ms, ` +
        `speedup=${(legacy.elapsedMs / Math.max(hybrid.elapsedMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybrid.elapsedMs <= legacy.elapsedMs,
        `hybrid (${hybrid.elapsedMs}ms) should be faster than legacy (${legacy.elapsedMs}ms)`,
      );
    });
  });

  // ── Determinism within each mode ─────────────────────────────────────

  describe('determinism within each mode', () => {
    for (const mode of MODES) {
      it(`${mode} mode produces deterministic results (same seed = same move)`, () => {
        const def = compileTexasDef();

        const resultA = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'fast', mode);
        const resultB = runPositionSearch(def, COMPARE_SEED, COMPARE_PLAYER_COUNT, 'fast', mode);

        assert.deepEqual(
          resultA.move,
          resultB.move,
          `${mode}: same seed should produce same move`,
        );
        assert.equal(
          resultA.iterations,
          resultB.iterations,
          `${mode}: same seed should produce same iteration count`,
        );
      });
    }
  });

  // ── Move agreement logging ───────────────────────────────────────────

  describe('move agreement between modes', () => {
    it('logs move agreement/disagreement between legacy and hybrid', () => {
      const def = compileTexasDef();
      const seeds = [1001, 1002, 1003, 1004, 1005];
      let agreements = 0;

      for (const seed of seeds) {
        const legacy = runPositionSearch(def, seed, COMPARE_PLAYER_COUNT, 'fast', 'legacy');
        const hybrid = runPositionSearch(def, seed, COMPARE_PLAYER_COUNT, 'fast', 'hybrid');

        const agree = JSON.stringify(legacy.move) === JSON.stringify(hybrid.move);
        if (agree) {
          agreements += 1;
        } else {
          console.log(
            `[mode-compare] seed=${seed}: move disagreement — ` +
            `legacy=${JSON.stringify(legacy.move)}, hybrid=${JSON.stringify(hybrid.move)}`,
          );
        }
      }

      console.log(
        `[mode-compare] move agreement: ${agreements}/${seeds.length} ` +
        `(${Math.round((agreements / seeds.length) * 100)}%)`,
      );

      // Log only — different modes may legitimately choose different moves.
      assert.ok(true, 'move agreement logged for manual review');
    });
  });
});
