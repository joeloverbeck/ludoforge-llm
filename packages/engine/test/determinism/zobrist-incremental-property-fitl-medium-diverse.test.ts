import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FITL_MEDIUM_DRIFT_MAX_TURNS,
  FITL_MEDIUM_DIVERSE_SEEDS,
  FITL_PLAYER_COUNT,
  createFitlRuntime,
  runVerifiedGame,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('Zobrist incremental property tests — FITL medium diverse drift sweep', () => {
  it('6 diverse random-play games with interval verification', () => {
    const { def, runtime } = createFitlRuntime();
    let totalMoves = 0;

    for (const seed of FITL_MEDIUM_DIVERSE_SEEDS) {
      totalMoves += runVerifiedGame(def, seed, FITL_PLAYER_COUNT, FITL_MEDIUM_DRIFT_MAX_TURNS, runtime);
    }

    assert.ok(totalMoves > 60, `Expected > 60 total moves, got ${totalMoves}`);
  });
});
