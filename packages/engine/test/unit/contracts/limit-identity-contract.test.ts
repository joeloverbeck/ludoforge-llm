import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCanonicalLimitId,
  isCanonicalLimitIdForAction,
  parseCanonicalLimitId,
} from '../../../src/kernel/limit-identity.js';

describe('limit identity contract', () => {
  describe('buildCanonicalLimitId', () => {
    it('produces actionId::scope::index format', () => {
      assert.equal(buildCanonicalLimitId('playCard', 0, 'turn'), 'playCard::turn::0');
    });

    it('encodes different scopes', () => {
      assert.equal(buildCanonicalLimitId('move', 1, 'phase'), 'move::phase::1');
      assert.equal(buildCanonicalLimitId('move', 2, 'game'), 'move::game::2');
    });
  });

  describe('parseCanonicalLimitId', () => {
    it('round-trips with buildCanonicalLimitId', () => {
      const id = buildCanonicalLimitId('attack', 3, 'phase');
      const parsed = parseCanonicalLimitId(id);
      assert.deepEqual(parsed, { actionId: 'attack', scope: 'phase', index: 3 });
    });

    it('returns null for too few separators', () => {
      assert.equal(parseCanonicalLimitId('attack::turn'), null);
    });

    it('round-trips when actionId contains separator', () => {
      const id = buildCanonicalLimitId('ns::play', 0, 'turn');
      const parsed = parseCanonicalLimitId(id);
      assert.deepEqual(parsed, { actionId: 'ns::play', scope: 'turn', index: 0 });
    });

    it('returns null when extra separators yield invalid scope', () => {
      assert.equal(parseCanonicalLimitId('a::b::c::d'), null);
    });

    it('returns null for invalid scope', () => {
      assert.equal(parseCanonicalLimitId('attack::round::0'), null);
    });

    it('returns null for non-integer index', () => {
      assert.equal(parseCanonicalLimitId('attack::turn::abc'), null);
    });

    it('returns null for negative index', () => {
      assert.equal(parseCanonicalLimitId('attack::turn::-1'), null);
    });

    it('returns null for fractional index', () => {
      assert.equal(parseCanonicalLimitId('attack::turn::1.5'), null);
    });
  });

  describe('isCanonicalLimitIdForAction', () => {
    it('returns true for matching canonical id', () => {
      const id = buildCanonicalLimitId('playCard', 0, 'turn');
      assert.equal(isCanonicalLimitIdForAction(id, 'playCard', 0, 'turn'), true);
    });

    it('returns false for wrong action id', () => {
      const id = buildCanonicalLimitId('playCard', 0, 'turn');
      assert.equal(isCanonicalLimitIdForAction(id, 'drawCard', 0, 'turn'), false);
    });

    it('returns false for wrong index', () => {
      const id = buildCanonicalLimitId('playCard', 0, 'turn');
      assert.equal(isCanonicalLimitIdForAction(id, 'playCard', 1, 'turn'), false);
    });

    it('returns false for wrong scope', () => {
      const id = buildCanonicalLimitId('playCard', 0, 'turn');
      assert.equal(isCanonicalLimitIdForAction(id, 'playCard', 0, 'phase'), false);
    });

    it('returns false for arbitrary string', () => {
      assert.equal(isCanonicalLimitIdForAction('garbage', 'playCard', 0, 'turn'), false);
    });
  });
});
