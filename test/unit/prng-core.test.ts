import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRng, stepRng } from '../../src/kernel/index.js';

const firstOutputs = (seed: bigint, count: number): readonly bigint[] => {
  let rng = createRng(seed);
  const outputs: bigint[] = [];

  for (let i = 0; i < count; i += 1) {
    const [value, nextRng] = stepRng(rng);
    outputs.push(value);
    rng = nextRng;
  }

  return outputs;
};

describe('prng core', () => {
  it('seed 42n produces the expected first 10 raw outputs (golden vector)', () => {
    const values = firstOutputs(42n, 10);

    assert.deepEqual(values, [
      0xba5909abdeb2f2e0n,
      0x6131c7d2a2dabe94n,
      0x6182f1eef548858bn,
      0xb0bc3847b67e2341n,
      0xcb17407ae4b8eb69n,
      0x3d40033d07461314n,
      0x93303d371ab134f4n,
      0xd3e6eb4d4ca98a92n,
      0x26452e031502d22fn,
      0xf48ea7255567cf30n,
    ]);
  });

  it('seed 42n and 43n produce different first 10 outputs', () => {
    const values42 = firstOutputs(42n, 10);
    const values43 = firstOutputs(43n, 10);

    assert.notDeepEqual(values42, values43);
  });

  it('step returns a new state object without mutating the previous state', () => {
    const rng = createRng(42n);
    const initialStateSnapshot = [...rng.state.state];
    const [first, nextRng] = stepRng(rng);

    assert.notEqual(rng, nextRng);
    assert.notEqual(rng.state, nextRng.state);
    assert.notEqual(rng.state.state, nextRng.state.state);
    assert.deepEqual(rng.state.state, initialStateSnapshot);
    assert.equal(typeof first, 'bigint');
  });
});
