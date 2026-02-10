import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRng, deserialize, fork, nextInt, serialize, stepRng } from '../../src/kernel/index.js';

const drawRaw = (rng: ReturnType<typeof createRng>, steps: number): readonly bigint[] => {
  const out: bigint[] = [];
  let cursor = rng;

  for (let i = 0; i < steps; i += 1) {
    const [value, nextRng] = stepRng(cursor);
    out.push(value);
    cursor = nextRng;
  }

  return out;
};

describe('prng round-trip and fork', () => {
  it('serialize/deserialize round-trip preserves future generated sequence', () => {
    let rng = createRng(42n);

    for (let i = 0; i < 7; i += 1) {
      const [, nextRng] = stepRng(rng);
      rng = nextRng;
    }

    const state = serialize(rng);
    const restored = deserialize(state);

    assert.deepEqual(drawRaw(rng, 12), drawRaw(restored, 12));
  });

  it('deserialize rejects unsupported algorithm/version combinations', () => {
    const valid = serialize(createRng(42n));

    assert.throws(
      () =>
        deserialize({
          ...valid,
          algorithm: 'xoshiro256ss',
        } as unknown as typeof valid),
      RangeError,
    );

    assert.throws(
      () =>
        deserialize({
          ...valid,
          version: 2,
        } as unknown as typeof valid),
      RangeError,
    );
  });

  it('fork creates deterministic child streams that diverge from each other and parent continuation', () => {
    const rng = createRng(99n);
    const parentStateSnapshot = [...rng.state.state];
    const [left, right] = fork(rng);

    assert.deepEqual(rng.state.state, parentStateSnapshot);

    const leftValues = drawRaw(left, 8);
    const rightValues = drawRaw(right, 8);
    const parentValues = drawRaw(rng, 8);

    assert.notDeepEqual(leftValues, rightValues);
    assert.notDeepEqual(leftValues, parentValues);
    assert.notDeepEqual(rightValues, parentValues);

    const [leftAgain, rightAgain] = fork(createRng(99n));
    assert.deepEqual(drawRaw(leftAgain, 8), leftValues);
    assert.deepEqual(drawRaw(rightAgain, 8), rightValues);
  });

  it('serialize and fork do not mutate parent RNG state', () => {
    const rng = createRng(123n);
    const snapshot = [...rng.state.state];

    void serialize(rng);
    void fork(rng);

    assert.deepEqual(rng.state.state, snapshot);
  });

  it('deserialized RNG remains compatible with nextInt', () => {
    const rng = createRng(5n);
    const restored = deserialize(serialize(rng));
    const [value] = nextInt(restored, 10, 20);

    assert.equal(value >= 10 && value <= 20, true);
  });
});
