import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStrategicConditionRef } from '../../../src/agents/policy-surface.js';
import type { CompiledStrategicCondition } from '../../../src/kernel/index.js';

function makeCondition(opts?: { proximity?: boolean }): CompiledStrategicCondition {
  const base: CompiledStrategicCondition = {
    target: { kind: 'literal', value: true },
  };
  if (opts?.proximity) {
    return {
      ...base,
      proximity: {
        current: { kind: 'literal', value: 10 },
        threshold: 15,
      },
    };
  }
  return base;
}

const conditions: Readonly<Record<string, CompiledStrategicCondition>> = {
  vcPivotalReady: makeCondition({ proximity: true }),
  noProxCondition: makeCondition(),
};

describe('parseStrategicConditionRef', () => {
  it('returns null for non-condition ref paths', () => {
    assert.equal(parseStrategicConditionRef('var.global.score', conditions), null);
    assert.equal(parseStrategicConditionRef('feature.myFeature', conditions), null);
    assert.equal(parseStrategicConditionRef('victory.currentMargin.vc', conditions), null);
  });

  describe('valid refs', () => {
    it('parses condition.COND.satisfied to strategicCondition ref with boolean type', () => {
      const result = parseStrategicConditionRef('condition.vcPivotalReady.satisfied', conditions);
      assert.ok(result !== null && result.ok);
      assert.deepStrictEqual(result.ref, {
        kind: 'strategicCondition',
        conditionId: 'vcPivotalReady',
        field: 'satisfied',
        type: 'boolean',
      });
    });

    it('parses condition.COND.proximity to strategicCondition ref with number type', () => {
      const result = parseStrategicConditionRef('condition.vcPivotalReady.proximity', conditions);
      assert.ok(result !== null && result.ok);
      assert.deepStrictEqual(result.ref, {
        kind: 'strategicCondition',
        conditionId: 'vcPivotalReady',
        field: 'proximity',
        type: 'number',
      });
    });
  });

  describe('diagnostics', () => {
    it('reports missingField when no field after condition ID', () => {
      const result = parseStrategicConditionRef('condition.vcPivotalReady', conditions);
      assert.ok(result !== null && !result.ok);
      assert.equal(result.error.code, 'missingField');
    });

    it('reports missingField for bare condition. prefix', () => {
      const result = parseStrategicConditionRef('condition.', conditions);
      assert.ok(result !== null && !result.ok);
      assert.equal(result.error.code, 'missingField');
    });

    it('reports invalidField for unrecognised field name', () => {
      const result = parseStrategicConditionRef('condition.vcPivotalReady.badField', conditions);
      assert.ok(result !== null && !result.ok);
      assert.equal(result.error.code, 'invalidField');
      assert.equal((result.error as { field: string }).field, 'badField');
    });

    it('reports unknownCondition when condition ID is not in catalog', () => {
      const result = parseStrategicConditionRef('condition.nonExistent.satisfied', conditions);
      assert.ok(result !== null && !result.ok);
      assert.equal(result.error.code, 'unknownCondition');
      assert.equal((result.error as { conditionId: string }).conditionId, 'nonExistent');
    });

    it('reports noProximity when condition has no proximity defined', () => {
      const result = parseStrategicConditionRef('condition.noProxCondition.proximity', conditions);
      assert.ok(result !== null && !result.ok);
      assert.equal(result.error.code, 'noProximity');
      assert.equal((result.error as { conditionId: string }).conditionId, 'noProxCondition');
    });

    it('allows satisfied field on condition without proximity', () => {
      const result = parseStrategicConditionRef('condition.noProxCondition.satisfied', conditions);
      assert.ok(result !== null && result.ok);
      assert.equal(result.ref.type, 'boolean');
    });
  });
});
