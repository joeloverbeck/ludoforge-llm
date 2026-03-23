import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectFreeOperationZoneFilterProbeRebindableAliases } from '../../../src/kernel/free-operation-zone-filter-probe.js';
import {
  collectZoneSelectorAliasesFromCondition,
  collectZoneSelectorAliasesFromValueExpr,
} from '../../../src/kernel/zone-selector-aliases.js';
import type { ConditionAST, ValueExpr } from '../../../src/kernel/types.js';

describe('zone selector alias collection', () => {
  it('collects zone aliases from condition zone-selector positions recursively', () => {
    const condition: ConditionAST = {
      op: 'and',
      args: [
        {
          op: '==',
          left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
          right: 'cambodia',
        },
        {
          op: 'adjacent',
          left: '$fromZone',
          right: '$toZone',
        },
        {
          op: 'connected',
          from: '$originZone',
          to: '$destZone',
          via: {
            op: 'zonePropIncludes',
            zone: '$viaZone',
            prop: 'terrainTags',
            value: 'jungle',
          },
        },
      ],
    };

    const aliases = [...collectZoneSelectorAliasesFromCondition(condition)].sort();
    assert.deepEqual(aliases, ['$destZone', '$fromZone', '$originZone', '$targetProvince', '$toZone', '$viaZone']);
  });

  it('collects aliases through metadata-declared numeric and nested condition fields', () => {
    const condition: ConditionAST = {
      op: 'and',
      args: [
        {
          op: 'markerShiftAllowed',
          space: '$candidateSpace',
          marker: 'supportOpposition',
          delta: {
            _t: 4,
            if: {
              when: { op: 'adjacent', left: '$adjacentFrom', right: '$adjacentTo' },
              then: 1,
              else: 0,
            },
          },
        },
        {
          op: 'connected',
          from: '$origin',
          to: '$destination',
          via: {
            op: 'markerStateAllowed',
            space: '$viaSpace',
            marker: 'supportOpposition',
            state: {
              _t: 4,
              if: {
                when: { op: '==', left: { _t: 2, ref: 'zoneProp', zone: '$stateProbe', prop: 'country' }, right: 'southVietnam' },
                then: 'activeSupport',
                else: 'neutral',
              },
            },
          },
        },
      ],
    };

    const aliases = [...collectZoneSelectorAliasesFromCondition(condition)].sort();
    assert.deepEqual(aliases, [
      '$adjacentFrom',
      '$adjacentTo',
      '$candidateSpace',
      '$destination',
      '$origin',
      '$stateProbe',
      '$viaSpace',
    ]);
  });

  it('covers alias traversal across every condition operator surface', () => {
    const cases: readonly { readonly label: string; readonly condition: ConditionAST; readonly expected: readonly string[] }[] = [
      {
        label: 'and',
        condition: { op: 'and', args: [{ op: 'adjacent', left: '$andLeft', right: '$andRight' }] },
        expected: ['$andLeft', '$andRight'],
      },
      {
        label: 'or',
        condition: { op: 'or', args: [{ op: 'adjacent', left: '$orLeft', right: '$orRight' }] },
        expected: ['$orLeft', '$orRight'],
      },
      {
        label: 'not',
        condition: { op: 'not', arg: { op: 'adjacent', left: '$notLeft', right: '$notRight' } },
        expected: ['$notLeft', '$notRight'],
      },
      {
        label: '==',
        condition: {
          op: '==',
          left: { _t: 2, ref: 'zoneProp', zone: '$eqLeft', prop: 'country' },
          right: { _t: 2, ref: 'zoneCount', zone: '$eqRight' },
        },
        expected: ['$eqLeft', '$eqRight'],
      },
      {
        label: '!=',
        condition: {
          op: '!=',
          left: { _t: 2, ref: 'zoneProp', zone: '$neqLeft', prop: 'country' },
          right: { _t: 2, ref: 'zoneCount', zone: '$neqRight' },
        },
        expected: ['$neqLeft', '$neqRight'],
      },
      {
        label: '<',
        condition: {
          op: '<',
          left: { _t: 2, ref: 'zoneProp', zone: '$ltLeft', prop: 'population' },
          right: { _t: 2, ref: 'zoneCount', zone: '$ltRight' },
        },
        expected: ['$ltLeft', '$ltRight'],
      },
      {
        label: '<=',
        condition: {
          op: '<=',
          left: { _t: 2, ref: 'zoneProp', zone: '$lteLeft', prop: 'population' },
          right: { _t: 2, ref: 'zoneCount', zone: '$lteRight' },
        },
        expected: ['$lteLeft', '$lteRight'],
      },
      {
        label: '>',
        condition: {
          op: '>',
          left: { _t: 2, ref: 'zoneProp', zone: '$gtLeft', prop: 'population' },
          right: { _t: 2, ref: 'zoneCount', zone: '$gtRight' },
        },
        expected: ['$gtLeft', '$gtRight'],
      },
      {
        label: '>=',
        condition: {
          op: '>=',
          left: { _t: 2, ref: 'zoneProp', zone: '$gteLeft', prop: 'population' },
          right: { _t: 2, ref: 'zoneCount', zone: '$gteRight' },
        },
        expected: ['$gteLeft', '$gteRight'],
      },
      {
        label: 'in',
        condition: {
          op: 'in',
          item: { _t: 2, ref: 'zoneProp', zone: '$inItem', prop: 'country' },
          set: { _t: 3, concat: [{ _t: 2, ref: 'zoneProp', zone: '$inSet', prop: 'country' }, 'fallback'] },
        },
        expected: ['$inItem', '$inSet'],
      },
      {
        label: 'adjacent',
        condition: { op: 'adjacent', left: '$adjacentLeft', right: '$adjacentRight' },
        expected: ['$adjacentLeft', '$adjacentRight'],
      },
      {
        label: 'connected',
        condition: {
          op: 'connected',
          from: '$connectedFrom',
          to: '$connectedTo',
          via: { op: 'adjacent', left: '$connectedViaLeft', right: '$connectedViaRight' },
        },
        expected: ['$connectedFrom', '$connectedTo', '$connectedViaLeft', '$connectedViaRight'],
      },
      {
        label: 'zonePropIncludes',
        condition: {
          op: 'zonePropIncludes',
          zone: '$zonePropZone',
          prop: 'terrainTags',
          value: { _t: 2, ref: 'zoneProp', zone: '$zonePropValue', prop: 'country' },
        },
        expected: ['$zonePropValue', '$zonePropZone'],
      },
      {
        label: 'markerStateAllowed',
        condition: {
          op: 'markerStateAllowed',
          space: '$markerStateSpace',
          marker: 'supportOpposition',
          state: {
            _t: 4,
            if: {
              when: { op: 'adjacent', left: '$markerStateWhenLeft', right: '$markerStateWhenRight' },
              then: 'activeSupport',
              else: 'neutral',
            },
          },
        },
        expected: ['$markerStateSpace', '$markerStateWhenLeft', '$markerStateWhenRight'],
      },
      {
        label: 'markerShiftAllowed',
        condition: {
          op: 'markerShiftAllowed',
          space: '$markerShiftSpace',
          marker: 'supportOpposition',
          delta: {
            _t: 4,
            if: {
              when: { op: 'adjacent', left: '$markerShiftWhenLeft', right: '$markerShiftWhenRight' },
              then: 1,
              else: 0,
            },
          },
        },
        expected: ['$markerShiftSpace', '$markerShiftWhenLeft', '$markerShiftWhenRight'],
      },
    ];

    for (const testCase of cases) {
      const aliases = [...collectZoneSelectorAliasesFromCondition(testCase.condition)].sort();
      assert.deepEqual(aliases, [...testCase.expected].sort(), testCase.label);
    }
  });

  it('excludes non-zone binding refs even when they are unresolved bindings', () => {
    const condition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: '$targetCountry' },
      right: 'cambodia',
    };

    const aliases = [...collectZoneSelectorAliasesFromCondition(condition)];
    assert.deepEqual(aliases, []);
  });

  it('collects zone aliases reachable through aggregate query/value recursion', () => {
    const valueExpr: ValueExpr = {
      _t: 5,
      aggregate: {
        op: 'count',
        query: {
          query: 'tokensInAdjacentZones',
          zone: '$adjacentOrigin',
          filter: { op: 'and', args: [
            {
              prop: 'label',
              op: 'eq',
              value: {
                _t: 5,
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'zones',
                    filter: {
                      condition: {
                        op: 'adjacent',
                        left: '$adjacentOrigin',
                        right: '$adjacentNeighbor',
                      },
                    },
                  },
                },
              },
            },
          ] },
        },
      },
    };

    const aliases = [...collectZoneSelectorAliasesFromValueExpr(valueExpr)].sort();
    assert.deepEqual(aliases, ['$adjacentNeighbor', '$adjacentOrigin']);
  });

  it('collects zone aliases from token-filter value expressions nested under not/or', () => {
    const valueExpr: ValueExpr = {
      _t: 5,
      aggregate: {
        op: 'count',
        query: {
          query: 'tokensInZone',
          zone: '$source',
          filter: {
            op: 'not',
            arg: {
              op: 'or',
              args: [
                {
                  prop: 'label',
                  op: 'eq',
                  value: { _t: 2, ref: 'zoneProp', zone: '$candidate', prop: 'country' },
                },
                { prop: 'faction', op: 'eq', value: 'US' },
              ],
            },
          },
        },
      },
    };

    const aliases = [...collectZoneSelectorAliasesFromValueExpr(valueExpr)].sort();
    assert.deepEqual(aliases, ['$candidate', '$source']);
  });

  it('collects zone aliases reachable through prioritized tiers', () => {
    const valueExpr: ValueExpr = {
      _t: 5,
      aggregate: {
        op: 'count',
        query: {
          query: 'prioritized',
          qualifierKey: 'type',
          tiers: [
            { query: 'tokensInZone', zone: '$availableSource' },
            {
              query: 'tokensInAdjacentZones',
              zone: { zoneExpr: { _t: 2, ref: 'zoneProp', zone: '$fallbackAlias', prop: 'linkedZone' } },
              filter: {
                op: 'and',
                args: [
                  {
                    prop: 'label',
                    op: 'eq',
                    value: { _t: 2, ref: 'zoneProp', zone: '$fallbackOrigin', prop: 'country' },
                  },
                ],
              },
            },
          ],
        },
      },
    };

    const aliases = [...collectZoneSelectorAliasesFromValueExpr(valueExpr)].sort();
    assert.deepEqual(aliases, ['$availableSource', '$fallbackAlias', '$fallbackOrigin']);
  });

  it('deduplicates aliases and strips canonical $zone from free-operation rebindable set', () => {
    const condition: ConditionAST = {
      op: 'and',
      args: [
        {
          op: '==',
          left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'country' },
          right: 'cambodia',
        },
        {
          op: '==',
          left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
          right: 'cambodia',
        },
        {
          op: '==',
          left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'population' },
          right: 1,
        },
      ],
    };

    const aliases = [...collectFreeOperationZoneFilterProbeRebindableAliases(condition)].sort();
    assert.deepEqual(aliases, ['$targetProvince']);
  });
});
