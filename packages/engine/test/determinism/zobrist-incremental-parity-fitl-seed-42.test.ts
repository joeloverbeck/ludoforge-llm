// @test-class: architectural-invariant
import { describe, it } from 'node:test';

import { runFitlZobristIncrementalParitySeed } from './zobrist-incremental-parity-fitl-helper.js';

describe('Zobrist incremental parity - FITL seed 42', () => {
  it('incremental hash matches full recompute every move', () => {
    runFitlZobristIncrementalParitySeed(42);
  });
});
