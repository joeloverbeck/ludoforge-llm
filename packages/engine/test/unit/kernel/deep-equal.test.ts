import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deepEqual } from '../../../src/kernel/deep-equal.js';

describe('deepEqual', () => {
  it('treats nested plain objects as equal regardless of key insertion order', () => {
    assert.equal(
      deepEqual(
        { foo: 1, bar: { baz: [1, 2, 3] } },
        { bar: { baz: [1, 2, 3] }, foo: 1 },
      ),
      true,
    );
  });

  it('compares bigint values inside nested runtime-like payloads', () => {
    assert.equal(
      deepEqual(
        { hash: 3n, nested: { draws: [1n, 2n] } },
        { hash: 3n, nested: { draws: [1n, 2n] } },
      ),
      true,
    );
    assert.equal(
      deepEqual(
        { hash: 3n, nested: { draws: [1n, 2n] } },
        { hash: 4n, nested: { draws: [1n, 2n] } },
      ),
      false,
    );
  });

  it('distinguishes typed-array payload differences', () => {
    assert.equal(
      deepEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
      true,
    );
    assert.equal(
      deepEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])),
      false,
    );
  });
});
