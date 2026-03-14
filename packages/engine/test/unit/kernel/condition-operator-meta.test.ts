import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONDITION_OPERATORS,
  CONDITION_OPERATOR_META,
  forEachConditionNestedConditionField,
  forEachConditionNumericValueField,
  forEachConditionValueField,
  forEachConditionZoneSelectorField,
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
    assert.equal(isConditionOperator(''), false);
  });

  it('has no duplicate operators and complete metadata coverage', () => {
    assert.equal(new Set(CONDITION_OPERATORS).size, CONDITION_OPERATORS.length);
    assert.deepEqual(Object.keys(CONDITION_OPERATOR_META).sort(), [...CONDITION_OPERATORS].sort());

    for (const op of CONDITION_OPERATORS) {
      const meta = getConditionOperatorMeta(op);
      assert.equal(meta.op, op);
      assert.equal(CONDITION_OPERATOR_META[op], meta);
    }
  });

  it('declares only fields that exist on the corresponding condition node shape', () => {
    for (const [op, condition] of Object.entries(SAMPLE_CONDITIONS) as readonly [ConditionOperator, Exclude<ConditionAST, boolean>][]) {
      const meta = getConditionOperatorMeta(op);
      for (const field of meta.valueFields ?? []) {
        assert.ok(field.name in condition, `${op} missing value field ${field.name}`);
      }
      for (const field of meta.numericValueFields ?? []) {
        assert.ok(field.name in condition, `${op} missing numeric value field ${field.name}`);
      }
      for (const field of meta.zoneSelectorFields ?? []) {
        assert.ok(field.name in condition, `${op} missing zone selector field ${field.name}`);
      }
      for (const field of meta.nestedConditionFields ?? []) {
        assert.ok(field.name in condition, `${op} missing nested condition field ${field.name}`);
      }
    }
  });

  it('exposes typed traversal helpers that return the metadata-declared field names and values', () => {
    const actual = CONDITION_OPERATORS.map((op) => {
      const condition = SAMPLE_CONDITIONS[op];
      const zoneSelectorFields: string[] = [];
      const zoneSelectorValues: unknown[] = [];
      const valueFields: string[] = [];
      const valueValues: unknown[] = [];
      const numericValueFields: string[] = [];
      const numericValueValues: unknown[] = [];
      const nestedConditionFields: string[] = [];
      const nestedConditionValues: unknown[] = [];

      forEachConditionZoneSelectorField(condition, (fieldName, value) => {
        zoneSelectorFields.push(fieldName);
        zoneSelectorValues.push(value);
      });
      forEachConditionValueField(condition, (fieldName, value) => {
        valueFields.push(fieldName);
        valueValues.push(value);
      });
      forEachConditionNumericValueField(condition, (fieldName, value) => {
        numericValueFields.push(fieldName);
        numericValueValues.push(value);
      });
      forEachConditionNestedConditionField(condition, (fieldName, value) => {
        nestedConditionFields.push(fieldName);
        nestedConditionValues.push(value);
      });

      return {
        op,
        zoneSelectorFields,
        zoneSelectorValues,
        valueFields,
        valueValues,
        numericValueFields,
        numericValueValues,
        nestedConditionFields,
        nestedConditionValues,
      };
    });

    assert.deepEqual(actual, [
      { op: 'and', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: [], valueValues: [], numericValueFields: [], numericValueValues: [], nestedConditionFields: ['args'], nestedConditionValues: [[{ op: '==', left: 1, right: 1 }]] },
      { op: 'or', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: [], valueValues: [], numericValueFields: [], numericValueValues: [], nestedConditionFields: ['args'], nestedConditionValues: [[{ op: '==', left: 1, right: 1 }]] },
      { op: 'not', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: [], valueValues: [], numericValueFields: [], numericValueValues: [], nestedConditionFields: ['arg'], nestedConditionValues: [{ op: '==', left: 1, right: 1 }] },
      { op: '==', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['left', 'right'], valueValues: [1, 1], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: '!=', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['left', 'right'], valueValues: [1, 1], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: '<', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['left', 'right'], valueValues: [1, 2], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: '<=', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['left', 'right'], valueValues: [1, 2], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: '>', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['left', 'right'], valueValues: [2, 1], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: '>=', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['left', 'right'], valueValues: [2, 1], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: 'in', zoneSelectorFields: [], zoneSelectorValues: [], valueFields: ['item', 'set'], valueValues: ['coin', { scalarArray: ['coin', 'us'] }], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: 'adjacent', zoneSelectorFields: ['left', 'right'], zoneSelectorValues: ['board:a', 'board:b'], valueFields: [], valueValues: [], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: 'connected', zoneSelectorFields: ['from', 'to'], zoneSelectorValues: ['board:a', 'board:b'], valueFields: [], valueValues: [], numericValueFields: [], numericValueValues: [], nestedConditionFields: ['via'], nestedConditionValues: [{ op: '==', left: 1, right: 1 }] },
      { op: 'zonePropIncludes', zoneSelectorFields: ['zone'], zoneSelectorValues: ['board:a'], valueFields: ['value'], valueValues: ['urban'], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: 'markerStateAllowed', zoneSelectorFields: ['space'], zoneSelectorValues: ['board:a'], valueFields: ['state'], valueValues: ['activeSupport'], numericValueFields: [], numericValueValues: [], nestedConditionFields: [], nestedConditionValues: [] },
      { op: 'markerShiftAllowed', zoneSelectorFields: ['space'], zoneSelectorValues: ['board:a'], valueFields: [], valueValues: [], numericValueFields: ['delta'], numericValueValues: [1], nestedConditionFields: [], nestedConditionValues: [] },
    ]);
  });
});
