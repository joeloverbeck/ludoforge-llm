import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeFingerprintValue,
  createStableFingerprintHasher,
  stableFingerprintHex,
} from '../../../src/kernel/stable-fingerprint.js';

describe('stable fingerprint namespace hasher', () => {
  it('matches stableFingerprintHex exactly for representative values', () => {
    const namespace = 'decision-sequence-analysis-v1';
    const hash = createStableFingerprintHasher(namespace);
    const values: readonly unknown[] = [
      null,
      undefined,
      true,
      17,
      'value',
      ['a', 3, false],
      {
        decisionKey: 'target',
        decisionPath: 'main',
        options: [
          { value: 'a', legality: 'legal', resolution: 'available' },
          { value: 'b', legality: 'illegal', illegalReason: 'blocked' },
        ],
        type: 'chooseOne',
      },
      {
        max: 2,
        min: 1,
        selected: ['x'],
        type: 'chooseN',
      },
    ];

    for (const value of values) {
      assert.equal(hash(value), stableFingerprintHex(namespace, value));
    }
  });

  it('preserves namespace separation while reusing the namespace prefix', () => {
    const left = createStableFingerprintHasher('left');
    const right = createStableFingerprintHasher('right');
    const value = { b: 2, a: [1, 'x'] };

    assert.equal(left(value), stableFingerprintHex('left', value));
    assert.equal(right(value), stableFingerprintHex('right', value));
    assert.notEqual(left(value), right(value));
  });

  it('remains canonical for object key order', () => {
    const hash = createStableFingerprintHasher('canonical');

    assert.equal(canonicalizeFingerprintValue({ b: 2, a: 1 }), '{"a":1,"b":2}');
    assert.equal(hash({ b: 2, a: 1 }), hash({ a: 1, b: 2 }));
  });
});
