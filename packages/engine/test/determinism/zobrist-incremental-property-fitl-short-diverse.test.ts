// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FITL_PLAYER_COUNT,
  FITL_SHORT_DRIFT_MAX_TURNS,
  FITL_SHORT_DIVERSE_SEEDS,
  createFitlRuntime,
  runVerifiedGame,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('Zobrist incremental property tests — FITL short diverse drift sweep', () => {
  it('8 diverse random-play games with interval verification', () => {
    const { def, runtime } = createFitlRuntime();
    let totalMoves = 0;

    for (const seed of FITL_SHORT_DIVERSE_SEEDS) {
      totalMoves += runVerifiedGame(def, seed, FITL_PLAYER_COUNT, FITL_SHORT_DRIFT_MAX_TURNS, runtime);
    }

    assert.ok(totalMoves > 80, `Expected > 80 total moves, got ${totalMoves}`);
  });
});
