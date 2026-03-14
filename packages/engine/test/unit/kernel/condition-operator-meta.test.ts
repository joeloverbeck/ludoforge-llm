import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONDITION_OPERATORS,
  CONDITION_OPERATOR_META,
  getConditionOperatorMeta,
  isConditionOperator,
} from '../../../src/kernel/condition-operator-meta.js';
import type { ConditionAST } from '../../../src/kernel/types.js';

type ConditionOperator = Exclude<ConditionAST, boolean>['op'];

const CONDITION_OPERATORS_FROM_AST = [
  'and',
  'or',
  'not',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'adjacent',
  'connected',
  'zonePropIncludes',
  'markerStateAllowed',
  'markerShiftAllowed',
] as const satisfies readonly ConditionOperator[];

const SAMPLE_CONDITIONS: Readonly<Record<ConditionOperator, Exclude<ConditionAST, boolean>>> = {
  and: { op: 'and', args: [{ op: '==', left: 1, right: 1 }] },
  or: { op: 'or', args: [{ op: '==', left: 1, right: 1 }] },
  not: { op: 'not', arg: { op: '==', left: 1, right: 1 } },
  '==': { op: '==', left: 1, right: 1 },
  '!=': { op: '!=', left: 1, right: 1 },
  '<': { op: '<', left: 1, right: 2 },
  '<=': { op: '<=', left: 1, right: 2 },
  '>': { op: '>', left: 2, right: 1 },
  '>=': { op: '>=', left: 2, right: 1 },
  in: { op: 'in', item: 'coin', set: { scalarArray: ['coin', 'us'] } },
  adjacent: { op: 'adjacent', left: 'board:a', right: 'board:b' },
  connected: { op: 'connected', from: 'board:a', to: 'board:b', via: { op: '==', left: 1, right: 1 } },
  zonePropIncludes: { op: 'zonePropIncludes', zone: 'board:a', prop: 'terrainTags', value: 'urban' },
  markerStateAllowed: { op: 'markerStateAllowed', space: 'board:a', marker: 'supportOpposition', state: 'activeSupport' },
  markerShiftAllowed: { op: 'markerShiftAllowed', space: 'board:a', marker: 'supportOpposition', delta: 1 },
};

describe('condition operator metadata', () => {
  it('keeps canonical operators aligned with ConditionAST discriminants', () => {
    assert.deepEqual(CONDITION_OPERATORS, CONDITION_OPERATORS_FROM_AST);
  });

  it('recognizes valid condition operators and rejects non-operators', () => {
    for (const op of CONDITION_OPERATORS) {
      assert.equal(isConditionOperator(op), true, `${op} should be recognized`);
    }
    assert.equal(isConditionOperator('xor'), false);
    assert.equal(isConditionOperator('eq'), false);
  });

  it('has no duplicate operators and complete metadata coverage', () => {
    assert.equal(new Set(CONDITION_OPERATORS).size, CONDITION_OPERATORS.length);
    assert.equal(CONDITION_OPERATOR_META.size, CONDITION_OPERATORS.length);

    for (const op of CONDITION_OPERATORS) {
      const meta = getConditionOperatorMeta(op);
      assert.equal(meta.op, op);
      assert.equal(CONDITION_OPERATOR_META.get(op), meta);
    }
  });

  it('declares only fields that exist on the corresponding condition node shape', () => {
    for (const [op, condition] of Object.entries(SAMPLE_CONDITIONS) as readonly [ConditionOperator, Exclude<ConditionAST, boolean>][]) {
      const meta = getConditionOperatorMeta(op);
      for (const field of meta.valueFields ?? []) {
        assert.ok(field in condition, `${op} missing value field ${field}`);
      }
      for (const field of meta.numericValueFields ?? []) {
        assert.ok(field in condition, `${op} missing numeric value field ${field}`);
      }
      for (const field of meta.zoneSelectorFields ?? []) {
        assert.ok(field in condition, `${op} missing zone selector field ${field}`);
      }
      for (const field of meta.nestedConditionFields ?? []) {
        assert.ok(field in condition, `${op} missing nested condition field ${field}`);
      }
    }
  });
});
