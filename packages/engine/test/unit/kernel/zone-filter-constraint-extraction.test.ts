// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConditionAST } from '../../../src/kernel/index.js';
import { extractBindingCountBounds } from '../../../src/kernel/zone-filter-constraint-extraction.js';

const count = (name: string) => ({ _t: 5 as const, aggregate: { op: 'count' as const, query: { query: 'binding' as const, name } } });
const cmp = (op: '==' | '<=' | '<' | '>=' | '>', left: unknown, right: unknown): ConditionAST =>
  ({ op, left, right }) as ConditionAST;

describe('extractBindingCountBounds', () => {
  it('extracts equality bounds', () => {
    assert.deepEqual(extractBindingCountBounds(cmp('==', count('$binding'), 1), '$binding'), { min: 1, max: 1 });
  });

  it('extracts less-than-or-equal bounds', () => {
    assert.deepEqual(extractBindingCountBounds(cmp('<=', count('$binding'), 3), '$binding'), { max: 3 });
  });

  it('extracts strict less-than bounds', () => {
    assert.deepEqual(extractBindingCountBounds(cmp('<', count('$binding'), 3), '$binding'), { max: 2 });
  });

  it('extracts greater-than-or-equal bounds', () => {
    assert.deepEqual(extractBindingCountBounds(cmp('>=', count('$binding'), 2), '$binding'), { min: 2 });
  });

  it('extracts strict greater-than bounds', () => {
    assert.deepEqual(extractBindingCountBounds(cmp('>', count('$binding'), 0), '$binding'), { min: 1 });
  });

  it('handles reversed operand order', () => {
    assert.deepEqual(extractBindingCountBounds(cmp('==', 1, count('$binding')), '$binding'), { min: 1, max: 1 });
    assert.deepEqual(extractBindingCountBounds(cmp('<=', 3, count('$binding')), '$binding'), { min: 3 });
    assert.deepEqual(extractBindingCountBounds(cmp('<', 3, count('$binding')), '$binding'), { min: 4 });
    assert.deepEqual(extractBindingCountBounds(cmp('>=', 2, count('$binding')), '$binding'), { max: 2 });
    assert.deepEqual(extractBindingCountBounds(cmp('>', 0, count('$binding')), '$binding'), { max: -1 });
  });

  it('returns null for or nodes', () => {
    const zoneFilter: ConditionAST = { op: 'or', args: [cmp('==', count('$binding'), 1), cmp('==', 1, 1)] };
    assert.equal(extractBindingCountBounds(zoneFilter, '$binding'), null);
  });

  it('returns null when and nodes contain no matching count constraints', () => {
    const zoneFilter: ConditionAST = { op: 'and', args: [cmp('==', 1, 1), cmp('==', { _t: 2, ref: 'binding', name: '$binding' }, 'x')] };
    assert.equal(extractBindingCountBounds(zoneFilter, '$binding'), null);
  });

  it('returns null for constraints on a different binding', () => {
    assert.equal(extractBindingCountBounds(cmp('==', count('$other'), 1), '$binding'), null);
  });

  it('collects constraints from nested and nodes', () => {
    const zoneFilter: ConditionAST = {
      op: 'and',
      args: [
        cmp('>=', count('$binding'), 1),
        { op: 'and', args: [cmp('<=', count('$binding'), 3), cmp('==', 1, 1)] },
      ],
    };
    assert.deepEqual(extractBindingCountBounds(zoneFilter, '$binding'), { min: 1, max: 3 });
  });

  it('intersects multiple constraints into the tightest range', () => {
    const zoneFilter: ConditionAST = {
      op: 'and',
      args: [cmp('>=', count('$binding'), 1), cmp('<=', count('$binding'), 3)],
    };
    assert.deepEqual(extractBindingCountBounds(zoneFilter, '$binding'), { min: 1, max: 3 });
  });

  it('extracts the real-world an loc free-operation target constraint', () => {
    const zoneFilter: ConditionAST = {
      op: 'and',
      args: [
        cmp('==', count('$targetSpaces'), 1),
        {
          op: 'in',
          item: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'id' },
          set: {
            _t: 1,
            scalarArray: ['hue:none', 'da-nang:none', 'kontum:none', 'qui-nhon:none', 'cam-ranh:none', 'an-loc:none', 'saigon:none', 'can-tho:none'],
          },
        },
        cmp('>', { _t: 5, aggregate: { op: 'count', query: { query: 'binding', name: '$movingTroops@{$zone}' } } }, 0),
      ],
    };
    assert.deepEqual(extractBindingCountBounds(zoneFilter, '$targetSpaces'), { min: 1, max: 1 });
  });
});
