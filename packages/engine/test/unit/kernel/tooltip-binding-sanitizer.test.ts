// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBindingName, stripMacroBindingPrefix } from '../../../src/kernel/tooltip-value-stringifier.js';
import { buildLabelContext } from '../../../src/kernel/tooltip-label-resolver.js';
import type { VerbalizationDef } from '../../../src/kernel/verbalization-types.js';

describe('stripMacroBindingPrefix', () => {
  describe('macro prefix stripping', () => {
    it('extracts final semantic segment from macro-expanded name', () => {
      const input = '__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece';
      assert.equal(stripMacroBindingPrefix(input), 'piece');
    });

    it('extracts segment from simple macro name with double underscores', () => {
      assert.equal(stripMacroBindingPrefix('__macro_some_action__targetZone'), 'targetZone');
    });

    it('returns full stripped name when no __ segments after prefix', () => {
      assert.equal(stripMacroBindingPrefix('__macro_someCamelCaseName'), 'someCamelCaseName');
    });

    it('extracts last segment after multiple __ separators', () => {
      assert.equal(stripMacroBindingPrefix('__macro_foo__bar__guerrillas'), 'guerrillas');
    });
  });

  describe('non-macro passthrough', () => {
    it('passes through regular binding names unchanged', () => {
      assert.equal(stripMacroBindingPrefix('piece'), 'piece');
    });

    it('passes through camelCase names unchanged', () => {
      assert.equal(stripMacroBindingPrefix('usTroops'), 'usTroops');
    });

    it('passes through empty string unchanged', () => {
      assert.equal(stripMacroBindingPrefix(''), '');
    });

    it('passes through names starting with single underscore', () => {
      assert.equal(stripMacroBindingPrefix('_internal'), '_internal');
    });
  });

  describe('edge cases', () => {
    it('handles __macro_ prefix with empty tail', () => {
      assert.equal(stripMacroBindingPrefix('__macro_'), '');
    });

    it('handles __macro_ prefix with only underscores', () => {
      assert.equal(stripMacroBindingPrefix('__macro___'), '');
    });
  });

  describe('preserves raw identifier for downstream resolveLabel', () => {
    it('returns raw tail that resolveLabel can look up in labels', () => {
      const tail = stripMacroBindingPrefix('__macro_place_from_available__piece');
      // 'piece' is the raw identifier — resolveLabel would find it in labels
      assert.equal(tail, 'piece');
    });
  });
});

describe('sanitizeBindingName', () => {
  describe('macro prefix stripping + humanization', () => {
    it('extracts and humanizes final semantic segment', () => {
      const input = '__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece';
      assert.equal(sanitizeBindingName(input), 'Piece');
    });

    it('humanizes camelCase tail', () => {
      assert.equal(sanitizeBindingName('__macro_some_action__targetZone'), 'Target Zone');
    });

    it('humanizes full stripped name when no __ segments after prefix', () => {
      assert.equal(sanitizeBindingName('__macro_someCamelCaseName'), 'Some Camel Case Name');
    });

    it('humanizes last segment after multiple __ separators', () => {
      assert.equal(sanitizeBindingName('__macro_foo__bar__guerrillas'), 'Guerrillas');
    });
  });

  describe('non-macro passthrough', () => {
    it('passes through regular binding names unchanged', () => {
      assert.equal(sanitizeBindingName('piece'), 'piece');
    });

    it('passes through camelCase names unchanged', () => {
      assert.equal(sanitizeBindingName('usTroops'), 'usTroops');
    });

    it('passes through empty string unchanged', () => {
      assert.equal(sanitizeBindingName(''), '');
    });

    it('passes through names starting with single underscore', () => {
      assert.equal(sanitizeBindingName('_internal'), '_internal');
    });
  });

  describe('with LabelContext', () => {
    const verbalization: VerbalizationDef = {
      labels: {
        piece: 'US Troops',
        guerrillas: { singular: 'Guerrilla', plural: 'Guerrillas' },
      },
      sentencePlans: {},
      macros: {},
      stages: {},
      suppressPatterns: [],
      stageDescriptions: {},
      modifierEffects: {},
    };
    const ctx = buildLabelContext(verbalization);

    it('resolves semantic tail via label context when available', () => {
      assert.equal(sanitizeBindingName('__macro_place_from_available__piece', ctx), 'US Troops');
    });

    it('resolves plural label form for known identifiers', () => {
      assert.equal(sanitizeBindingName('__macro_foo__guerrillas', ctx), 'Guerrillas');
    });

    it('falls back to humanizeIdentifier for unknown identifiers with context', () => {
      assert.equal(sanitizeBindingName('__macro_foo__unknownThing', ctx), 'Unknown Thing');
    });

    it('does not alter non-macro names even with context', () => {
      assert.equal(sanitizeBindingName('piece', ctx), 'piece');
    });
  });

  describe('edge cases', () => {
    it('handles __macro_ prefix with empty tail', () => {
      assert.equal(sanitizeBindingName('__macro_'), '');
    });

    it('handles __macro_ prefix with only underscores', () => {
      assert.equal(sanitizeBindingName('__macro___'), '');
    });
  });
});
