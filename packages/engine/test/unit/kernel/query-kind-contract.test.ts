import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OptionsQuery } from '../../../src/kernel/types.js';
import { inferLeafOptionsQueryContract, type LeafOptionsQueryContract } from '../../../src/kernel/query-kind-contract.js';

describe('query kind contract', () => {
  it('classifies every leaf OptionsQuery variant with explicit domain and runtime shape', () => {
    const cases: readonly [OptionsQuery, LeafOptionsQueryContract][] = [
      [{ query: 'tokensInZone', zone: 'deck:none' }, { domain: 'token', runtimeShape: 'token' }],
      [{ query: 'tokensInMapSpaces' }, { domain: 'token', runtimeShape: 'token' }],
      [{ query: 'tokensInAdjacentZones', zone: 'deck:none' }, { domain: 'token', runtimeShape: 'token' }],
      [{ query: 'zones' }, { domain: 'zone', runtimeShape: 'string' }],
      [{ query: 'mapSpaces' }, { domain: 'zone', runtimeShape: 'string' }],
      [{ query: 'adjacentZones', zone: 'deck:none' }, { domain: 'zone', runtimeShape: 'string' }],
      [{ query: 'connectedZones', zone: 'deck:none' }, { domain: 'zone', runtimeShape: 'string' }],
      [{ query: 'assetRows', tableId: 'table' }, { domain: 'other', runtimeShape: 'object' }],
      [{ query: 'intsInRange', min: 1, max: 3 }, { domain: 'other', runtimeShape: 'number' }],
      [{ query: 'intsInVarRange', var: 'v' }, { domain: 'other', runtimeShape: 'number' }],
      [{ query: 'players' }, { domain: 'other', runtimeShape: 'number' }],
      [{ query: 'enums', values: ['A'] }, { domain: 'other', runtimeShape: 'string' }],
      [{ query: 'globalMarkers' }, { domain: 'other', runtimeShape: 'string' }],
      [{ query: 'binding', name: '$x' }, { domain: 'other', runtimeShape: 'unknown' }],
    ];

    for (const [query, expected] of cases) {
      if (query.query === 'concat' || query.query === 'nextInOrderByCondition') {
        assert.fail('Leaf test case must not include recursive query kinds.');
      }
      assert.deepEqual(inferLeafOptionsQueryContract(query), expected);
    }
  });
});
