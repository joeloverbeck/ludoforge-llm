import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRng, nextInt } from '../../../src/kernel/index.js';

describe('prng nextInt property-style checks', () => {
  it('returns values within [min, max] for seeded table-driven ranges', () => {
    const seeds = [1n, 2n, 42n, 123456789n];
    const ranges: readonly [number, number][] = [
      [0, 0],
      [0, 1],
      [-5, 5],
      [10, 99],
      [-1000, -900],
      [Number.MAX_SAFE_INTEGER - 1000, Number.MAX_SAFE_INTEGER],
      [-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER + 1000],
    ];

    for (const seed of seeds) {
      for (const [min, max] of ranges) {
        let rng = createRng(seed);

        for (let draw = 0; draw < 200; draw += 1) {
          const [value, nextRng] = nextInt(rng, min, max);
          assert.equal(value >= min, true);
          assert.equal(value <= max, true);
          rng = nextRng;
        }
      }
    }
  });

  it('shows rough uniformity for nextInt(rng, 0, 9) over 1000 draws', () => {
    let rng = createRng(42n);
    const counts = Array.from({ length: 10 }, () => 0);

    for (let i = 0; i < 1000; i += 1) {
      const [value, nextRng] = nextInt(rng, 0, 9);
      const bucket = counts.at(value);
      if (bucket === undefined) {
        throw new Error(`Unexpected bucket index: ${value}`);
      }
      counts[value] = bucket + 1;
      rng = nextRng;
    }

    counts.forEach((count) => {
      assert.equal(count >= 50, true);
    });
  });
});
