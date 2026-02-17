import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRng, nextInt } from '../../src/kernel/index.js';

describe('prng nextInt', () => {
  it('nextInt(rng, 0, 0) always returns 0', () => {
    let rng = createRng(42n);

    for (let i = 0; i < 100; i += 1) {
      const [value, nextRng] = nextInt(rng, 0, 0);
      assert.equal(value, 0);
      rng = nextRng;
    }
  });

  it('nextInt(rng, 5, 5) always returns 5', () => {
    let rng = createRng(99n);

    for (let i = 0; i < 100; i += 1) {
      const [value, nextRng] = nextInt(rng, 5, 5);
      assert.equal(value, 5);
      rng = nextRng;
    }
  });

  it('nextInt(rng, 0, 1) returns both outcomes over repeated calls', () => {
    let rng = createRng(42n);
    let sawZero = false;
    let sawOne = false;

    for (let i = 0; i < 200; i += 1) {
      const [value, nextRng] = nextInt(rng, 0, 1);
      if (value === 0) {
        sawZero = true;
      }
      if (value === 1) {
        sawOne = true;
      }
      rng = nextRng;
    }

    assert.equal(sawZero, true);
    assert.equal(sawOne, true);
  });

  it('throws RangeError for invalid bounds', () => {
    const rng = createRng(7n);

    assert.throws(() => nextInt(rng, 2, 1), RangeError);
    assert.throws(() => nextInt(rng, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2), RangeError);
    assert.throws(() => nextInt(rng, 0.5, 2), RangeError);
    assert.throws(() => nextInt(rng, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), RangeError);
  });
});
