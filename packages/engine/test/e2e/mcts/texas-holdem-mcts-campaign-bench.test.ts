/* eslint-disable no-console */
/**
 * Campaign benchmark for MCTS performance on Texas Hold'em.
 *
 * This file is NOT part of CI test lanes — it exists solely as the
 * measurement harness for the prod-perf-mcts-agent campaign.  It exercises
 * the real Texas Hold'em production spec with the fast MCTS preset,
 * targeting a ~2-3 minute total runtime so the improvement loop can
 * iterate quickly.
 *
 * Core tests:
 *   1. Single-mode benchmark: 2-player game, 10 turns (primary workload)
 *   2. Determinism check, 3 turns (lightweight)
 *   3. Dual-mode campaign: legacy vs hybrid head-to-head comparison
 *   4. Quality regression: hybrid not >5% weaker than legacy
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileTexasDef,
  createMctsAgents,
  createMctsAgentsWithMode,
  formatSearchDiagnostics,
  runGame,
  runPositionSearch,
  runTimedGame,
  serializeTrace,
  type MctsRolloutMode,
} from './mcts-test-helpers.js';

const BENCH_MAX_TURNS = 10;
const CAMPAIGN_SEEDS = [201, 301, 401, 501, 601, 701, 801, 901, 1001, 1101];
const CAMPAIGN_PLAYER_COUNT = 2;
const CAMPAIGN_MAX_TURNS = 5;

describe('texas hold\'em MCTS fast campaign benchmark', () => {
  // ── Single-mode benchmark (existing) ─────────────────────────────────

  it('completes 2-player 10-turn game with MCTS fast agents', () => {
    const def = compileTexasDef();
    const agents = createMctsAgents(2, 'fast');
    const trace = runGame(def, 201, agents, BENCH_MAX_TURNS, 2);

    assert.ok(trace.moves.length > 0, 'trace should contain moves');
    assert.ok(
      trace.stopReason === 'terminal' || trace.stopReason === 'maxTurns',
      `unexpected stop reason: ${trace.stopReason}`,
    );
  });

  it('same seed + same MCTS config produces identical trace', () => {
    const def = compileTexasDef();
    const seed = 501;
    const playerCount = 2;
    const maxTurns = 3;

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

  // ── Dual-mode campaign ───────────────────────────────────────────────

  describe('dual-mode campaign: legacy vs hybrid', () => {
    it('runs head-to-head campaign and reports diagnostics', () => {
      const def = compileTexasDef();
      const modes: readonly MctsRolloutMode[] = ['legacy', 'hybrid'];

      const modeStats: Record<string, {
        totalMs: number;
        totalMoves: number;
        terminalCount: number;
        maxTurnsCount: number;
      }> = {};

      for (const mode of modes) {
        modeStats[mode] = { totalMs: 0, totalMoves: 0, terminalCount: 0, maxTurnsCount: 0 };
      }

      for (const seed of CAMPAIGN_SEEDS) {
        for (const mode of modes) {
          const agents = createMctsAgentsWithMode(CAMPAIGN_PLAYER_COUNT, 'fast', mode);
          const result = runTimedGame(def, seed, agents, CAMPAIGN_MAX_TURNS, CAMPAIGN_PLAYER_COUNT);
          const stats = modeStats[mode]!;
          modeStats[mode] = {
            totalMs: stats.totalMs + result.elapsedMs,
            totalMoves: stats.totalMoves + result.trace.moves.length,
            terminalCount: stats.terminalCount + (result.trace.stopReason === 'terminal' ? 1 : 0),
            maxTurnsCount: stats.maxTurnsCount + (result.trace.stopReason === 'maxTurns' ? 1 : 0),
          };
        }
      }

      // Log campaign summary.
      for (const mode of modes) {
        const stats = modeStats[mode]!;
        const meanMs = Math.round(stats.totalMs / CAMPAIGN_SEEDS.length);
        console.log(
          `[campaign] ${mode}: totalMs=${stats.totalMs}, meanMs=${meanMs}, ` +
          `totalMoves=${stats.totalMoves}, terminal=${stats.terminalCount}, ` +
          `maxTurns=${stats.maxTurnsCount}`,
        );
      }

      const legacyStats = modeStats['legacy']!;
      const hybridStats = modeStats['hybrid']!;

      // Hybrid should be faster overall.
      console.log(
        `[campaign] speedup: ${(legacyStats.totalMs / Math.max(hybridStats.totalMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybridStats.totalMs <= legacyStats.totalMs,
        `hybrid campaign (${hybridStats.totalMs}ms) should be faster than legacy (${legacyStats.totalMs}ms)`,
      );
    });

    it('hybrid is not more than 5% weaker than legacy (move count proxy)', () => {
      const def = compileTexasDef();

      // Use total moves as a quality proxy: more moves = longer games = better play.
      // A drastically weaker agent would make obviously bad decisions leading to
      // shorter games (fewer moves before terminal).
      let legacyTotalMoves = 0;
      let hybridTotalMoves = 0;

      for (const seed of CAMPAIGN_SEEDS) {
        const legacyAgents = createMctsAgentsWithMode(CAMPAIGN_PLAYER_COUNT, 'fast', 'legacy');
        const hybridAgents = createMctsAgentsWithMode(CAMPAIGN_PLAYER_COUNT, 'fast', 'hybrid');

        const legacyTrace = runGame(def, seed, legacyAgents, CAMPAIGN_MAX_TURNS, CAMPAIGN_PLAYER_COUNT);
        const hybridTrace = runGame(def, seed, hybridAgents, CAMPAIGN_MAX_TURNS, CAMPAIGN_PLAYER_COUNT);

        legacyTotalMoves += legacyTrace.moves.length;
        hybridTotalMoves += hybridTrace.moves.length;
      }

      const qualityRatio = hybridTotalMoves / Math.max(legacyTotalMoves, 1);
      console.log(
        `[campaign] quality ratio (hybrid/legacy moves): ${qualityRatio.toFixed(3)} ` +
        `(hybrid=${hybridTotalMoves}, legacy=${legacyTotalMoves})`,
      );

      // Hybrid should not be more than 5% weaker.
      assert.ok(
        qualityRatio >= 0.95,
        `hybrid quality ratio ${qualityRatio.toFixed(3)} is below 0.95 threshold`,
      );
    });

    it('logs per-position diagnostics summary', () => {
      const def = compileTexasDef();
      const modes: readonly MctsRolloutMode[] = ['legacy', 'hybrid'];
      const diagSeeds = CAMPAIGN_SEEDS.slice(0, 3);

      for (const seed of diagSeeds) {
        for (const mode of modes) {
          const result = runPositionSearch(def, seed, CAMPAIGN_PLAYER_COUNT, 'fast', mode);
          console.log(
            `[campaign-diag] seed=${seed} ${mode}:\n${formatSearchDiagnostics(result.diagnostics)}`,
          );
        }
      }

      // This test is for logging — no assertion beyond successful execution.
      assert.ok(true, 'diagnostics summary logged');
    });
  });
});
