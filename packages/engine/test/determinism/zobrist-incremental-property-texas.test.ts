import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DIVERSE_SEEDS,
  TEXAS_MAX_TURNS,
  TEXAS_PLAYER_COUNT,
  createTexasRuntime,
  runVerifiedGame,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('Zobrist incremental property tests — Texas Hold\'em random play', () => {
  it('25 random-play games with full verification', () => {
    const { def, runtime } = createTexasRuntime();
    let totalMoves = 0;

    for (let seed = 1; seed <= 25; seed += 1) {
      totalMoves += runVerifiedGame(def, seed, TEXAS_PLAYER_COUNT, TEXAS_MAX_TURNS, runtime);
    }

    assert.ok(totalMoves > 250, `Expected > 250 total moves, got ${totalMoves}`);
  });

  it('10 additional games with diverse seed range', () => {
    const { def, runtime } = createTexasRuntime();
    let totalMoves = 0;

    for (const seed of DIVERSE_SEEDS) {
      totalMoves += runVerifiedGame(def, seed, TEXAS_PLAYER_COUNT, TEXAS_MAX_TURNS, runtime);
    }

    assert.ok(totalMoves > 100, `Expected > 100 total moves, got ${totalMoves}`);
  });
});
