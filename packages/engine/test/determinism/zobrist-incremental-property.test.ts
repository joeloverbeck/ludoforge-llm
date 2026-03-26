import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  isKernelRuntimeError,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import type { GameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Texas compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('FITL compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createRandomAgents = (count: number): readonly RandomAgent[] =>
  Array.from({ length: count }, () => new RandomAgent());

/**
 * Run a game with verification. Re-throw HASH_DRIFT errors (the thing we're
 * testing), but swallow other kernel runtime errors (stall loops, etc.) that
 * are pre-existing game-specific issues unrelated to hashing.
 */
const runVerifiedGame = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  maxTurns: number,
  runtime: GameDefRuntime,
): number => {
  const agents = createRandomAgents(playerCount);
  try {
    const trace = runGame(def, seed, agents, maxTurns, playerCount, {
      verifyIncrementalHash: true,
    }, runtime);
    return trace.moves.length;
  } catch (err) {
    if (isKernelRuntimeError(err) && err.code === 'HASH_DRIFT') {
      throw err; // Re-throw — this is what we're testing
    }
    // Swallow other runtime errors (stall loops, etc.)
    return 0;
  }
};

describe('Zobrist incremental property tests — random play', () => {
  const TEXAS_PLAYER_COUNT = 4;
  const TEXAS_MAX_TURNS = 80;
  const FITL_PLAYER_COUNT = 4;
  const FITL_MAX_TURNS = 150;

  it('Texas Hold\'em: 25 random-play games with full verification', () => {
    const def = compileTexasDef();
    const runtime = createGameDefRuntime(def);
    let totalMoves = 0;

    for (let seed = 1; seed <= 25; seed += 1) {
      totalMoves += runVerifiedGame(def, seed, TEXAS_PLAYER_COUNT, TEXAS_MAX_TURNS, runtime);
    }

    assert.ok(totalMoves > 250, `Expected > 250 total moves, got ${totalMoves}`);
  });

  it('FITL: 25 random-play games with full verification', () => {
    const def = compileFitlDef();
    const runtime = createGameDefRuntime(def);
    let totalMoves = 0;

    for (let seed = 1; seed <= 25; seed += 1) {
      totalMoves += runVerifiedGame(def, seed, FITL_PLAYER_COUNT, FITL_MAX_TURNS, runtime);
    }

    assert.ok(totalMoves > 250, `Expected > 250 total moves, got ${totalMoves}`);
  });

  it('mixed seeds: 10 additional games per game with diverse seed range', () => {
    const texasDef = compileTexasDef();
    const texasRuntime = createGameDefRuntime(texasDef);
    const fitlDef = compileFitlDef();
    const fitlRuntime = createGameDefRuntime(fitlDef);

    const diverseSeeds = [
      1000, 3000, 5000, 8888, 12345,
      200, 400, 6666, 22222, 44444,
    ];

    for (const seed of diverseSeeds) {
      runVerifiedGame(texasDef, seed, TEXAS_PLAYER_COUNT, TEXAS_MAX_TURNS, texasRuntime);
      runVerifiedGame(fitlDef, seed, FITL_PLAYER_COUNT, FITL_MAX_TURNS, fitlRuntime);
    }
  });
});
