import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeCondition, resolveModifierEffect } from '../../../src/kernel/tooltip-modifier-humanizer.js';
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
});
