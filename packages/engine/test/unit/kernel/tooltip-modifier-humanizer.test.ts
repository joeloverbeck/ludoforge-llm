import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeCondition, humanizeConditionWithLabels, resolveModifierEffect } from '../../../src/kernel/tooltip-modifier-humanizer.js';
import { buildLabelContext } from '../../../src/kernel/tooltip-label-resolver.js';
import type { NormalizerContext } from '../../../src/kernel/tooltip-normalizer.js';
import type { ConditionAST } from '../../../src/kernel/types-ast.js';
import type { VerbalizationDef } from '../../../src/kernel/verbalization-types.js';

const EMPTY_CTX: NormalizerContext = {
  verbalization: undefined,
  suppressPatterns: [],
};

const ctxWithPatterns = (patterns: readonly string[]): NormalizerContext => ({
  verbalization: undefined,
  suppressPatterns: patterns,
});

const ctxWithVerbalization = (verb: VerbalizationDef): NormalizerContext => ({
  verbalization: verb,
  suppressPatterns: verb.suppressPatterns,
});

const baseVerb: VerbalizationDef = {
  labels: {
    aid: 'Aid',
    resources: 'Resources',
    cap_m48Patton: 'M48 Patton',
  },
  stages: {},
  macros: {},
  sentencePlans: {},
  suppressPatterns: ['__*', 'fitl_*', 'mom_*'],
  stageDescriptions: {},
  modifierEffects: {
    cap_m48Patton: [
      { condition: 'M48 Patton is Shaded', effect: 'Patrol costs 3 ARVN Resources' },
    ],
  },
};

describe('tooltip-modifier-humanizer', () => {

  describe('humanizeCondition', () => {

    it('suppresses conditions referencing double-underscore vars', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'gvar', var: '__actionClass' },
        right: 'limitedOperation',
      };
      const result = humanizeCondition(cond, EMPTY_CTX);
      assert.equal(result, null);
    });

    it('suppresses conditions referencing $__macro_ prefixed vars', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'gvar', var: '$__macro_cap_sweep_booby_traps_shaded_cost' },
        right: 1,
      };
      const result = humanizeCondition(cond, EMPTY_CTX);
      assert.equal(result, null);
    });

    it('suppresses conditions matching suppress patterns', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'gvar', var: 'fitl_monsoon_active' },
        right: 1,
      };
      const ctx = ctxWithPatterns(['fitl_*']);
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, null);
    });

    it('humanizes a simple comparison with label resolution', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'gvar', var: 'aid' },
        right: 0,
      };
      const ctx = ctxWithVerbalization(baseVerb);
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'Aid is 0');
    });

    it('humanizes AND conditions', () => {
      const cond: ConditionAST = {
        op: 'and',
        args: [
          { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 },
          { op: '==', left: { ref: 'gvar', var: 'resources' }, right: 0 },
        ],
      };
      const ctx = ctxWithVerbalization(baseVerb);
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'Aid \u2265 3 and Resources is 0');
    });

    it('humanizes NOT conditions', () => {
      const cond: ConditionAST = {
        op: 'not',
        arg: { op: '==', left: { ref: 'gvar', var: 'aid' }, right: 0 },
      };
      const ctx = ctxWithVerbalization(baseVerb);
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'not Aid is 0');
    });

    it('suppresses if any referenced name is internal', () => {
      const cond: ConditionAST = {
        op: 'and',
        args: [
          { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 },
          { op: '==', left: { ref: 'gvar', var: '__actionClass' }, right: 'limitedOperation' },
        ],
      };
      const result = humanizeCondition(cond, EMPTY_CTX);
      assert.equal(result, null);
    });

    it('falls back to auto-humanize without verbalization', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'gvar', var: 'playerGold' },
        right: 5,
      };
      const result = humanizeCondition(cond, EMPTY_CTX);
      assert.ok(result !== null);
      assert.ok(result.includes('5'));
    });

    // --- New ref type tests (HUMREAACTTOO-002) ---

    it('humanizes markerState ref as "marker of space"', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'markerState', marker: 'population', space: 'saigon' },
        right: 2,
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, population: 'Population', saigon: 'Saigon' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'Population of Saigon is 2');
    });

    it('humanizes zoneCount ref as "pieces in zone"', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'zoneCount', zone: 'hanoi' },
        right: 3,
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, hanoi: 'Hanoi' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'pieces in Hanoi \u2265 3');
    });

    it('humanizes tokenProp ref as "token.prop"', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'tokenProp', token: 'usBase', prop: 'strength' },
        right: 1,
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, usBase: 'US Base', strength: 'Strength' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'US Base.Strength is 1');
    });

    it('humanizes assetField ref as "field"', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'assetField', row: 'row1', tableId: 'costs', field: 'moveCost' },
        right: 3,
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, moveCost: 'Move Cost' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'Move Cost is 3');
    });

    it('humanizes zoneProp ref as "zone.prop"', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'zoneProp', zone: 'saigon', prop: 'terrain' },
        right: 'city',
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, saigon: 'Saigon', terrain: 'Terrain' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'Saigon.Terrain is City');
    });

    it('humanizes activePlayer ref as "active player"', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'activePlayer' },
        right: 'us',
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, us: 'US' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'active player is US');
    });

    it('humanizes tokenZone ref as "zone of token"', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'tokenZone', token: 'usBase' },
        right: 'saigon',
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, usBase: 'US Base', saigon: 'Saigon' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'zone of US Base is Saigon');
    });

    it('humanizes zoneVar ref as "var of zone"', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'zoneVar', zone: 'saigon', var: 'control' },
        right: 1,
      };
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        labels: { ...baseVerb.labels, saigon: 'Saigon', control: 'Control' },
      });
      const result = humanizeCondition(cond, ctx);
      assert.equal(result, 'Control of Saigon \u2265 1');
    });

    // --- extractValueNames coverage via suppression (HUMREAACTTOO-002) ---

    it('suppresses markerState when marker matches suppress pattern', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'markerState', marker: 'fitl_control', space: 'saigon' },
        right: 1,
      };
      const ctx = ctxWithPatterns(['fitl_*']);
      assert.equal(humanizeCondition(cond, ctx), null);
    });

    it('suppresses zoneVar when var matches suppress pattern', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'zoneVar', zone: 'saigon', var: '__internalTracker' },
        right: 1,
      };
      assert.equal(humanizeCondition(cond, EMPTY_CTX), null);
    });

    it('suppresses tokenProp when token matches suppress pattern', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'tokenProp', token: '__hiddenToken', prop: 'strength' },
        right: 1,
      };
      assert.equal(humanizeCondition(cond, EMPTY_CTX), null);
    });

    it('suppresses zoneProp when zone matches suppress pattern', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'zoneProp', zone: 'fitl_hue', prop: 'terrain' },
        right: 'city',
      };
      const ctx = ctxWithPatterns(['fitl_*']);
      assert.equal(humanizeCondition(cond, ctx), null);
    });
  });

  describe('resolveModifierEffect', () => {

    it('returns null for suppressed conditions', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'gvar', var: '__actionClass' },
        right: 'limitedOperation',
      };
      const result = resolveModifierEffect(cond, EMPTY_CTX);
      assert.equal(result, null);
    });

    it('returns pre-authored effect when condition matches', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'gvar', var: 'cap_m48Patton' },
        right: 'shaded',
      };
      // The humanized condition would be "M48 Patton is Shaded"
      const ctx = ctxWithVerbalization({
        ...baseVerb,
        modifierEffects: {
          cap_m48Patton: [
            { condition: 'M48 Patton is Shaded', effect: 'Patrol costs 3 ARVN Resources' },
          ],
        },
      });
      const result = resolveModifierEffect(cond, ctx);
      assert.ok(result !== null);
      assert.equal(result!.condition, 'M48 Patton is Shaded');
      assert.equal(result!.effect, 'Patrol costs 3 ARVN Resources');
    });

    it('returns humanized condition with empty effect as fallback', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'gvar', var: 'aid' },
        right: 10,
      };
      const ctx = ctxWithVerbalization(baseVerb);
      const result = resolveModifierEffect(cond, ctx);
      assert.ok(result !== null);
      assert.ok(result!.condition.includes('Aid'));
      assert.equal(result!.effect, '');
    });
  });

  // --- humanizeConditionWithLabels (ACTTOOHUMGAP-005) ---

  describe('humanizeConditionWithLabels', () => {

    it('resolves zone IDs to display names via LabelContext', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'zoneCount', zone: 'hanoi' },
        right: 3,
      };
      const ctx = buildLabelContext({
        ...baseVerb,
        labels: { ...baseVerb.labels, hanoi: 'Hanoi' },
      });
      const result = humanizeConditionWithLabels(cond, ctx);
      assert.equal(result, 'pieces in Hanoi ≥ 3');
    });

    it('resolves player references to display names via LabelContext', () => {
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'activePlayer' },
        right: 'us',
      };
      const ctx = buildLabelContext({
        ...baseVerb,
        labels: { ...baseVerb.labels, us: 'US' },
      });
      const result = humanizeConditionWithLabels(cond, ctx);
      assert.equal(result, 'active player is US');
    });

    it('delegates embedded ValueExpr nodes to humanizeValueExpr', () => {
      const cond: ConditionAST = {
        op: '>=',
        left: { ref: 'gvar', var: 'aid' },
        right: 5,
      };
      const ctx = buildLabelContext(baseVerb);
      const result = humanizeConditionWithLabels(cond, ctx);
      assert.equal(result, 'Aid ≥ 5');
    });

    it('handles AND conditions', () => {
      const cond: ConditionAST = {
        op: 'and',
        args: [
          { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 },
          { op: '==', left: { ref: 'gvar', var: 'resources' }, right: 0 },
        ],
      };
      const ctx = buildLabelContext(baseVerb);
      const result = humanizeConditionWithLabels(cond, ctx);
      assert.equal(result, 'Aid ≥ 3 and Resources is 0');
    });

    it('does not perform suppression (no NormalizerContext needed)', () => {
      // __actionClass would be suppressed by humanizeCondition, but not by humanizeConditionWithLabels
      const cond: ConditionAST = {
        op: '==',
        left: { ref: 'gvar', var: '__actionClass' },
        right: 'limitedOperation',
      };
      const ctx = buildLabelContext(undefined);
      const result = humanizeConditionWithLabels(cond, ctx);
      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
    });
  });
});
