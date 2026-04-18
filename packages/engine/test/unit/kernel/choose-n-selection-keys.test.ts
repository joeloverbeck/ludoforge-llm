// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  toSelectionKey,
} from '../../../src/kernel/choose-n-session.js';
import { optionKey } from '../../../src/kernel/legal-choices.js';

// ── Helpers ──────────────────────────────────────────────────────────

const buildDomainIndex = (values: readonly string[]): ReadonlyMap<string, number> => {
  const index = new Map<string, number>();
  for (let i = 0; i < values.length; i++) {
    index.set(optionKey(values[i]), i);
  }
  return index;
};

// ── Tests ────────────────────────────────────────────────────────────

describe('toSelectionKey', () => {
  describe('small domain (bigint bitset)', () => {
    it('returns bigint for domain ≤ 64 options', () => {
      const domain = ['a', 'b', 'c', 'd'];
      const domainIndex = buildDomainIndex(domain);
      const key = toSelectionKey(domainIndex, ['b', 'c']);
      assert.equal(typeof key, 'bigint');
    });

    it('sets correct bits for selected options', () => {
      const domain = ['a', 'b', 'c', 'd'];
      const domainIndex = buildDomainIndex(domain);
      // b=index 1, c=index 2 → bits 1 and 2 → 0b110 = 6n
      const key = toSelectionKey(domainIndex, ['b', 'c']);
      assert.equal(key, 6n);
    });

    it('produces 0n for empty selection', () => {
      const domain = ['a', 'b', 'c'];
      const domainIndex = buildDomainIndex(domain);
      const key = toSelectionKey(domainIndex, []);
      assert.equal(key, 0n);
    });

    it('is order-independent (same set → same key)', () => {
      const domain = ['a', 'b', 'c', 'd'];
      const domainIndex = buildDomainIndex(domain);
      const key1 = toSelectionKey(domainIndex, ['a', 'c', 'd']);
      const key2 = toSelectionKey(domainIndex, ['d', 'a', 'c']);
      assert.equal(key1, key2);
    });

    it('distinguishes different selections', () => {
      const domain = ['a', 'b', 'c', 'd'];
      const domainIndex = buildDomainIndex(domain);
      const key1 = toSelectionKey(domainIndex, ['a', 'b']);
      const key2 = toSelectionKey(domainIndex, ['a', 'c']);
      assert.notEqual(key1, key2);
    });

    it('handles domain of exactly 64 options with bigint', () => {
      const domain = Array.from({ length: 64 }, (_, i) => `opt_${i}`);
      const domainIndex = buildDomainIndex(domain);
      const key = toSelectionKey(domainIndex, ['opt_0', 'opt_63']);
      assert.equal(typeof key, 'bigint');
      // bit 0 and bit 63 set
      const expected = 1n | (1n << 63n);
      assert.equal(key, expected);
    });
  });

  describe('large domain (string key)', () => {
    it('returns string for domain > 64 options', () => {
      const domain = Array.from({ length: 65 }, (_, i) => `opt_${i}`);
      const domainIndex = buildDomainIndex(domain);
      const key = toSelectionKey(domainIndex, ['opt_0', 'opt_1']);
      assert.equal(typeof key, 'string');
    });

    it('is order-independent for string keys', () => {
      const domain = Array.from({ length: 65 }, (_, i) => `opt_${i}`);
      const domainIndex = buildDomainIndex(domain);
      const key1 = toSelectionKey(domainIndex, ['opt_5', 'opt_2', 'opt_10']);
      const key2 = toSelectionKey(domainIndex, ['opt_10', 'opt_5', 'opt_2']);
      assert.equal(key1, key2);
    });

    it('distinguishes different selections', () => {
      const domain = Array.from({ length: 65 }, (_, i) => `opt_${i}`);
      const domainIndex = buildDomainIndex(domain);
      const key1 = toSelectionKey(domainIndex, ['opt_0', 'opt_1']);
      const key2 = toSelectionKey(domainIndex, ['opt_0', 'opt_2']);
      assert.notEqual(key1, key2);
    });
  });

  describe('determinism', () => {
    it('same inputs produce identical keys across calls', () => {
      const domain = ['x', 'y', 'z'];
      const domainIndex = buildDomainIndex(domain);
      const key1 = toSelectionKey(domainIndex, ['x', 'z']);
      const key2 = toSelectionKey(domainIndex, ['x', 'z']);
      assert.equal(key1, key2);
    });
  });
});
