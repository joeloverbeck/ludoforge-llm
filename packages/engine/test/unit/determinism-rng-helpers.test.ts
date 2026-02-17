import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertDeterministic, assertRngRoundTrip, createRng, nextInt } from '../../src/kernel/index.js';

describe('determinism RNG helpers', () => {
  it('assertDeterministic passes for stable RNG-driven function', () => {
    const fn = (initialRng: ReturnType<typeof createRng>): readonly number[] => {
      const values: number[] = [];
      let rng = initialRng;

      for (let i = 0; i < 6; i += 1) {
        const [value, nextRng] = nextInt(rng, 0, 100);
        values.push(value);
        rng = nextRng;
      }

      return values;
    };

    assert.doesNotThrow(() => assertDeterministic(fn, 42n));
  });

  it('assertDeterministic fails for intentionally unstable compare target', () => {
    let counter = 0;

    const unstable = () => {
      counter += 1;
      return counter;
    };

    assert.throws(() => assertDeterministic(unstable, 42n));
  });

  it('assertRngRoundTrip passes on representative step counts', () => {
    assert.doesNotThrow(() => assertRngRoundTrip(createRng(1n), 0));
    assert.doesNotThrow(() => assertRngRoundTrip(createRng(2n), 1));
    assert.doesNotThrow(() => assertRngRoundTrip(createRng(3n), 64));
  });

  it('assertRngRoundTrip rejects negative step count', () => {
    assert.throws(() => assertRngRoundTrip(createRng(4n), -1), RangeError);
  });
});
