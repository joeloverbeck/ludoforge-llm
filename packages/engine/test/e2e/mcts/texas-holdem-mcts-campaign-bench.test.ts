/**
 * Campaign benchmark for MCTS fast-preset performance on Texas Hold'em.
 *
 * This file is NOT part of CI test lanes — it exists solely as the
 * measurement harness for the prod-perf-mcts-agent campaign.  It exercises
 * the real Texas Hold'em production spec with the fast MCTS preset,
 * targeting a ~2-3 minute total runtime so the improvement loop can
 * iterate quickly.
 *
 * Core tests:
 *   1. 2-player game, 10 turns (primary workload — ~2 minutes)
 *   2. Determinism check, 3 turns (lightweight — ~35 seconds)
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileTexasDef,
  createMctsAgents,
  runGame,
  serializeTrace,
} from './mcts-test-helpers.js';

const BENCH_MAX_TURNS = 10;

describe('texas hold\'em MCTS fast campaign benchmark', () => {
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
});
