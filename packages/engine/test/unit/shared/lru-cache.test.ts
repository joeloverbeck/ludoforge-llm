// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LruCache } from '../../../src/shared/lru-cache.js';

describe('LruCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LruCache<string, number>(2);

    cache.set('a', 1);

    assert.equal(cache.get('a'), 1);
    assert.equal(cache.size, 1);
  });

  it('evicts the least recently used entry at capacity', () => {
    const cache = new LruCache<string, number>(2);

    cache.set('a', 1);
    cache.set('b', 2);
    assert.equal(cache.get('a'), 1);
    cache.set('c', 3);

    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
    assert.equal(cache.size, 2);
  });

  it('promotes overwritten entries and clears all entries', () => {
    const cache = new LruCache<string, number>(2);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);

    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 10);
    assert.equal(cache.get('c'), 3);

    cache.clear();
    assert.equal(cache.size, 0);
    assert.equal(cache.get('a'), undefined);
  });

  it('supports a zero-entry cache', () => {
    const cache = new LruCache<string, number>(0);

    cache.set('a', 1);

    assert.equal(cache.size, 0);
    assert.equal(cache.get('a'), undefined);
  });
});
