import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  inferLeafOptionsQueryContract,
  type LeafOptionsQuery,
  type LeafOptionsQueryContract,
  type RecursiveOptionsQuery,
} from '../../../src/kernel/query-kind-contract.js';

describe('query kind contract', () => {
  it('classifies every leaf OptionsQuery variant with explicit domain and runtime shape', () => {
    const cases: readonly [LeafOptionsQuery, LeafOptionsQueryContract][] = [
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
      assert.deepEqual(inferLeafOptionsQueryContract(query), expected);
    }
  });

  it('rejects recursive query variants at compile time', () => {
    const expectLeafOnly = (_query: LeafOptionsQuery): void => undefined;
    const recursiveCases: readonly RecursiveOptionsQuery[] = [
      { query: 'concat', sources: [{ query: 'players' }, { query: 'zones' }] },
      {
        query: 'nextInOrderByCondition',
        source: { query: 'players' },
        from: 0,
        bind: '$player',
        where: true,
      },
    ];

    for (const recursiveQuery of recursiveCases) {
      // @ts-expect-error Recursive query variants are not leaf variants.
      expectLeafOnly(recursiveQuery);
    }
  });
});
