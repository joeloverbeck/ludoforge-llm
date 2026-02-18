import { describe, expect, it } from 'vitest';

import { formatChoiceValueFallback, serializeChoiceValueIdentity } from '../../src/model/choice-value-utils.js';

describe('choice-value-utils', () => {
  describe('serializeChoiceValueIdentity', () => {
    it('serializes scalar values with type-aware identity tags', () => {
      expect(serializeChoiceValueIdentity('1')).toBe('s:1:1');
      expect(serializeChoiceValueIdentity(1)).toBe('n:1');
      expect(serializeChoiceValueIdentity(true)).toBe('b:1');
    });

    it('serializes array values deterministically', () => {
      expect(serializeChoiceValueIdentity(['table:none', 'token-a'])).toBe('a:[s:10:table:none|s:7:token-a]');
    });

    it('avoids collisions between scalar and array coercion-equivalent values', () => {
      expect(serializeChoiceValueIdentity('a,b')).not.toBe(serializeChoiceValueIdentity(['a', 'b']));
    });
  });

  describe('formatChoiceValueFallback', () => {
    it('formats scalar string values using id display formatting', () => {
      expect(formatChoiceValueFallback('table:none')).toBe('Table None');
    });

    it('formats booleans and numbers deterministically', () => {
      expect(formatChoiceValueFallback(true)).toBe('True');
      expect(formatChoiceValueFallback(false)).toBe('False');
      expect(formatChoiceValueFallback(3)).toBe('3');
    });

    it('formats arrays deterministically with bracketed entry labels', () => {
      expect(formatChoiceValueFallback(['table:none', 'token-a'])).toBe('[Table None, Token A]');
    });
  });
});
