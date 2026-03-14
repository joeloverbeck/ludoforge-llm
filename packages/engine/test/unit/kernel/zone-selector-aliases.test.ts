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
          left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
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
              if: {
                when: { op: '==', left: { ref: 'zoneProp', zone: '$stateProbe', prop: 'country' }, right: 'southVietnam' },
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

  it('excludes non-zone binding refs even when they are unresolved bindings', () => {
    const condition: ConditionAST = {
      op: '==',
      left: { ref: 'binding', name: '$targetCountry' },
      right: 'cambodia',
    };

    const aliases = [...collectZoneSelectorAliasesFromCondition(condition)];
    assert.deepEqual(aliases, []);
  });

  it('collects zone aliases reachable through aggregate query/value recursion', () => {
    const valueExpr: ValueExpr = {
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
                  value: { ref: 'zoneProp', zone: '$candidate', prop: 'country' },
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

  it('deduplicates aliases and strips canonical $zone from free-operation rebindable set', () => {
    const condition: ConditionAST = {
      op: 'and',
      args: [
        {
          op: '==',
          left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
          right: 'cambodia',
        },
        {
          op: '==',
          left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
          right: 'cambodia',
        },
        {
          op: '==',
          left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'population' },
          right: 1,
        },
      ],
    };

    const aliases = [...collectFreeOperationZoneFilterProbeRebindableAliases(condition)].sort();
    assert.deepEqual(aliases, ['$targetProvince']);
  });
});
