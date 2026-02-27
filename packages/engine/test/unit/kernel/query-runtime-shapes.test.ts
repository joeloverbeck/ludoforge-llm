import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OptionsQuery } from '../../../src/kernel/types.js';
import { inferQueryRuntimeShapes, type QueryRuntimeShape } from '../../../src/kernel/query-runtime-shapes.js';

const sortedShapes = (query: OptionsQuery): readonly QueryRuntimeShape[] => [...inferQueryRuntimeShapes(query)].sort();

describe('query runtime shapes', () => {
  it('classifies every non-recursive OptionsQuery variant explicitly', () => {
    const cases: readonly [OptionsQuery, readonly QueryRuntimeShape[]][] = [
      [{ query: 'tokensInZone', zone: 'deck:none' }, ['token']],
      [{ query: 'assetRows', tableId: 'scores' }, ['object']],
      [{ query: 'tokensInMapSpaces' }, ['token']],
      [{ query: 'intsInRange', min: 1, max: 3 }, ['number']],
      [{ query: 'intsInVarRange', var: 'moves' }, ['number']],
      [{ query: 'enums', values: ['A', 'B'] }, ['string']],
      [{ query: 'globalMarkers' }, ['string']],
      [{ query: 'players' }, ['number']],
      [{ query: 'zones' }, ['string']],
      [{ query: 'mapSpaces' }, ['string']],
      [{ query: 'adjacentZones', zone: 'deck:none' }, ['string']],
      [{ query: 'tokensInAdjacentZones', zone: 'deck:none' }, ['token']],
      [{ query: 'connectedZones', zone: 'deck:none' }, ['string']],
      [{ query: 'binding', name: '$picked' }, ['unknown']],
    ];

    for (const [query, expected] of cases) {
      assert.deepEqual(sortedShapes(query), expected);
    }
  });

  it('propagates runtime shapes for recursive query variants', () => {
    const nextInOrderByCondition = {
      query: 'nextInOrderByCondition',
      source: { query: 'tokensInMapSpaces' },
      from: 1,
      bind: '$token',
      where: { op: '==', left: 1, right: 1 },
    } as const satisfies OptionsQuery;

    const concat = {
      query: 'concat',
      sources: [{ query: 'zones' }, { query: 'assetRows', tableId: 'scores' }, { query: 'tokensInZone', zone: 'deck:none' }],
    } as const satisfies OptionsQuery;

    assert.deepEqual(sortedShapes(nextInOrderByCondition), ['token']);
    assert.deepEqual(sortedShapes(concat), ['object', 'string', 'token']);
  });
});
