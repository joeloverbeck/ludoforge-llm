import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeIdentifier, buildAcronymSet } from '../../../src/kernel/tooltip-humanizer.js';
import type { VerbalizationDef } from '../../../src/kernel/verbalization-types.js';

describe('humanizeIdentifier', () => {
  describe('camelCase splitting', () => {
    it('splits simple camelCase', () => {
      assert.equal(humanizeIdentifier('usTroops'), 'Us Troops');
    });

    it('splits multi-word camelCase', () => {
      assert.equal(humanizeIdentifier('totalEcon'), 'Total Econ');
    });

    it('splits consecutive uppercase run followed by lowercase', () => {
      // Without acronym set, uppercase runs are title-cased
      assert.equal(humanizeIdentifier('NVATroops'), 'Nva Troops');
    });

    it('splits consecutive uppercase run with acronym set', () => {
      assert.equal(humanizeIdentifier('NVATroops', new Set(['NVA'])), 'NVA Troops');
    });
  });

  describe('kebab-case splitting', () => {
    it('splits kebab-case', () => {
      assert.equal(humanizeIdentifier('available-us'), 'Available Us');
    });

    it('splits multi-segment kebab-case', () => {
      assert.equal(humanizeIdentifier('us-troop-count'), 'Us Troop Count');
    });
  });

  describe('$ prefix stripping', () => {
    it('strips leading $ and title-cases', () => {
      assert.equal(humanizeIdentifier('$player'), 'Player');
    });

    it('strips $ from multi-word identifier', () => {
      assert.equal(humanizeIdentifier('$activePlayer'), 'Active Player');
    });
  });

  describe('acronym table', () => {
    const acronyms = new Set(['US', 'NVA', 'ARVN']);

    it('applies acronym for matching word', () => {
      assert.equal(humanizeIdentifier('usTroops', acronyms), 'US Troops');
    });

    it('applies acronym at end of identifier', () => {
      assert.equal(humanizeIdentifier('available-us', acronyms), 'Available US');
    });

    it('applies multiple acronyms', () => {
      assert.equal(humanizeIdentifier('nvaTroops', acronyms), 'NVA Troops');
    });

    it('does not apply acronym when not in set', () => {
      assert.equal(humanizeIdentifier('vcGuerrillas', acronyms), 'Vc Guerrillas');
    });

    it('returns title case when no acronym set provided', () => {
      assert.equal(humanizeIdentifier('usTroops'), 'Us Troops');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      assert.equal(humanizeIdentifier(''), '');
    });

    it('handles single character', () => {
      assert.equal(humanizeIdentifier('x'), 'X');
    });

    it('handles single character with $', () => {
      assert.equal(humanizeIdentifier('$x'), 'X');
    });

    it('handles $ alone', () => {
      assert.equal(humanizeIdentifier('$'), '');
    });

    it('handles all-lowercase single word', () => {
      assert.equal(humanizeIdentifier('aid'), 'Aid');
    });

    it('handles all-uppercase word without acronym set', () => {
      assert.equal(humanizeIdentifier('ARVN'), 'Arvn');
    });

    it('handles all-uppercase word with acronym set', () => {
      assert.equal(humanizeIdentifier('ARVN', new Set(['ARVN'])), 'ARVN');
    });

    it('handles mixed kebab and camelCase', () => {
      assert.equal(humanizeIdentifier('us-troopCount'), 'Us Troop Count');
    });
  });
});

describe('buildAcronymSet', () => {
  it('returns empty set for undefined verbalization', () => {
    const result = buildAcronymSet(undefined);
    assert.equal(result.size, 0);
  });

  it('extracts all-caps tokens from string labels', () => {
    const verbalization: VerbalizationDef = {
      labels: { usTroops: 'US Troops', saigon: 'Saigon' },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
    };
    const result = buildAcronymSet(verbalization);
    assert.ok(result.has('US'));
    assert.ok(!result.has('Troops'));
    assert.ok(!result.has('Saigon'));
  });

  it('extracts all-caps tokens from singular/plural labels', () => {
    const verbalization: VerbalizationDef = {
      labels: { nvaGuerrillas: { singular: 'NVA Guerrilla', plural: 'NVA Guerrillas' } },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
    };
    const result = buildAcronymSet(verbalization);
    assert.ok(result.has('NVA'));
  });

  it('extracts multiple acronyms from a single label', () => {
    const verbalization: VerbalizationDef = {
      labels: { usArvnForces: 'US and ARVN Forces' },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
    };
    const result = buildAcronymSet(verbalization);
    assert.ok(result.has('US'));
    assert.ok(result.has('ARVN'));
  });

  it('ignores single uppercase letters', () => {
    const verbalization: VerbalizationDef = {
      labels: { playerA: 'Player A' },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
    };
    const result = buildAcronymSet(verbalization);
    assert.ok(!result.has('A'));
  });
});
