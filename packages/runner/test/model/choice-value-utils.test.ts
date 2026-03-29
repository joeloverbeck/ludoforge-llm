import { describe, expect, it } from 'vitest';

import { formatChoiceValueFallback, formatChoiceValueResolved, serializeChoiceValueIdentity } from '../../src/model/choice-value-utils.js';

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

  describe('formatChoiceValueResolved', () => {
    const zonesById = new Map([
      ['da-nang:none', { displayName: 'Da Nang' }],
      ['kontum:none', { displayName: 'Kontum' }],
    ]);

    it('resolves a zone ID to its display name when present in the map', () => {
      expect(formatChoiceValueResolved('da-nang:none', zonesById)).toBe('Da Nang');
    });

    it('falls back to formatIdAsDisplayName for unknown zone IDs', () => {
      expect(formatChoiceValueResolved('unknown-zone:none', zonesById)).toBe('Unknown Zone');
    });

    it('resolves an array of zone IDs to comma-separated display names', () => {
      expect(formatChoiceValueResolved(['da-nang:none', 'kontum:none'], zonesById)).toBe('Da Nang, Kontum');
    });

    it('mixes resolved and fallback names in arrays', () => {
      expect(formatChoiceValueResolved(['da-nang:none', 'unknown:none'], zonesById)).toBe('Da Nang, Unknown');
    });

    it('passes through numeric values unchanged', () => {
      expect(formatChoiceValueResolved(42, zonesById)).toBe('42');
    });

    it('passes through boolean values with capitalized formatting', () => {
      expect(formatChoiceValueResolved(true, zonesById)).toBe('True');
      expect(formatChoiceValueResolved(false, zonesById)).toBe('False');
    });

    it('returns the same result as fallback when map is empty', () => {
      const emptyMap = new Map<string, { displayName: string }>();
      expect(formatChoiceValueResolved('da-nang:none', emptyMap)).toBe('Da Nang');
    });
  });

  describe('formatChoiceValueFallback', () => {
    it('formats scalar string values using id display formatting', () => {
      expect(formatChoiceValueFallback('table:none')).toBe('Table');
    });

    it('formats booleans and numbers deterministically', () => {
      expect(formatChoiceValueFallback(true)).toBe('True');
      expect(formatChoiceValueFallback(false)).toBe('False');
      expect(formatChoiceValueFallback(3)).toBe('3');
    });

    it('formats arrays deterministically with bracketed entry labels', () => {
      expect(formatChoiceValueFallback(['table:none', 'token-a'])).toBe('[Table, Token A]');
    });
  });
});
