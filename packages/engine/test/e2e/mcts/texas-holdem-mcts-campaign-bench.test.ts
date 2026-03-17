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
  createMctsAgentsWithEvaluator,
  formatSearchDiagnostics,
  runGame,
  runPositionSearch,
  runTimedGame,
  serializeTrace,
  type LeafEvaluator,
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

  describe('dual-evaluator campaign: rollout-full vs rollout-hybrid', () => {
    const FULL_EVALUATOR: LeafEvaluator = { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'full' };
    const HYBRID_EVALUATOR: LeafEvaluator = { type: 'rollout', maxSimulationDepth: 48, policy: 'random', mode: 'hybrid' };
    const evaluatorEntries: readonly { name: string; evaluator: LeafEvaluator }[] = [
      { name: 'rollout-full', evaluator: FULL_EVALUATOR },
      { name: 'rollout-hybrid', evaluator: HYBRID_EVALUATOR },
    ];

    it('runs head-to-head campaign and reports diagnostics', () => {
      const def = compileTexasDef();

      const evalStats: Record<string, {
        totalMs: number;
        totalMoves: number;
        terminalCount: number;
        maxTurnsCount: number;
      }> = {};

      for (const { name } of evaluatorEntries) {
        evalStats[name] = { totalMs: 0, totalMoves: 0, terminalCount: 0, maxTurnsCount: 0 };
      }

      for (const seed of CAMPAIGN_SEEDS) {
        for (const { name, evaluator } of evaluatorEntries) {
          const agents = createMctsAgentsWithEvaluator(CAMPAIGN_PLAYER_COUNT, 'fast', evaluator);
          const result = runTimedGame(def, seed, agents, CAMPAIGN_MAX_TURNS, CAMPAIGN_PLAYER_COUNT);
          const stats = evalStats[name]!;
          evalStats[name] = {
            totalMs: stats.totalMs + result.elapsedMs,
            totalMoves: stats.totalMoves + result.trace.moves.length,
            terminalCount: stats.terminalCount + (result.trace.stopReason === 'terminal' ? 1 : 0),
            maxTurnsCount: stats.maxTurnsCount + (result.trace.stopReason === 'maxTurns' ? 1 : 0),
          };
        }
      }

      // Log campaign summary.
      for (const { name } of evaluatorEntries) {
        const stats = evalStats[name]!;
        const meanMs = Math.round(stats.totalMs / CAMPAIGN_SEEDS.length);
        console.log(
          `[campaign] ${name}: totalMs=${stats.totalMs}, meanMs=${meanMs}, ` +
          `totalMoves=${stats.totalMoves}, terminal=${stats.terminalCount}, ` +
          `maxTurns=${stats.maxTurnsCount}`,
        );
      }

      const fullStats = evalStats['rollout-full']!;
      const hybridStats = evalStats['rollout-hybrid']!;

      // Hybrid should be faster overall.
      console.log(
        `[campaign] speedup: ${(fullStats.totalMs / Math.max(hybridStats.totalMs, 1)).toFixed(2)}x`,
      );

      assert.ok(
        hybridStats.totalMs <= fullStats.totalMs,
        `hybrid campaign (${hybridStats.totalMs}ms) should be faster than full (${fullStats.totalMs}ms)`,
      );
    });

    it('rollout-hybrid is not more than 5% weaker than rollout-full (move count proxy)', () => {
      const def = compileTexasDef();

      // Use total moves as a quality proxy: more moves = longer games = better play.
      // A drastically weaker agent would make obviously bad decisions leading to
      // shorter games (fewer moves before terminal).
      let fullTotalMoves = 0;
      let hybridTotalMoves = 0;

      for (const seed of CAMPAIGN_SEEDS) {
        const fullAgents = createMctsAgentsWithEvaluator(CAMPAIGN_PLAYER_COUNT, 'fast', FULL_EVALUATOR);
        const hybridAgents = createMctsAgentsWithEvaluator(CAMPAIGN_PLAYER_COUNT, 'fast', HYBRID_EVALUATOR);

        const fullTrace = runGame(def, seed, fullAgents, CAMPAIGN_MAX_TURNS, CAMPAIGN_PLAYER_COUNT);
        const hybridTrace = runGame(def, seed, hybridAgents, CAMPAIGN_MAX_TURNS, CAMPAIGN_PLAYER_COUNT);

        fullTotalMoves += fullTrace.moves.length;
        hybridTotalMoves += hybridTrace.moves.length;
      }

      const qualityRatio = hybridTotalMoves / Math.max(fullTotalMoves, 1);
      console.log(
        `[campaign] quality ratio (hybrid/full moves): ${qualityRatio.toFixed(3)} ` +
        `(hybrid=${hybridTotalMoves}, full=${fullTotalMoves})`,
      );

      // Hybrid should not be more than 5% weaker.
      assert.ok(
        qualityRatio >= 0.95,
        `hybrid quality ratio ${qualityRatio.toFixed(3)} is below 0.95 threshold`,
      );
    });

    it('logs per-position diagnostics summary', () => {
      const def = compileTexasDef();
      const diagSeeds = CAMPAIGN_SEEDS.slice(0, 3);

      for (const seed of diagSeeds) {
        for (const { name, evaluator } of evaluatorEntries) {
          const result = runPositionSearch(def, seed, CAMPAIGN_PLAYER_COUNT, 'fast', evaluator);
          console.log(
            `[campaign-diag] seed=${seed} ${name}:\n${formatSearchDiagnostics(result.diagnostics)}`,
          );
        }
      }

      // This test is for logging — no assertion beyond successful execution.
      assert.ok(true, 'diagnostics summary logged');
    });
  });
});
