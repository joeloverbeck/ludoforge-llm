import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OptionsQuery } from '../../src/kernel/types.js';
import {
  areSourceAndAnchorShapesCompatible,
  inferQueryRuntimeShapes,
  type QueryRuntimeShape,
  inferValueRuntimeShapes,
} from '../../src/kernel/query-shape-inference.js';
import { inferQueryRuntimeShapes as inferCanonicalQueryRuntimeShapesSet } from '../../src/kernel/query-runtime-shapes.js';

describe('query shape inference', () => {
  it('classifies every leaf OptionsQuery variant runtime shape', () => {
    const cases: readonly [OptionsQuery, readonly QueryRuntimeShape[]][] = [
      [{ query: 'tokensInZone', zone: 'deck:none' }, ['token']],
      [{ query: 'assetRows', tableId: 'scores' }, ['object']],
      [{ query: 'tokensInMapSpaces' }, ['token']],
      [{ query: 'intsInRange', min: 1, max: 3 }, ['number']],
      [{ query: 'intsInVarRange', var: 'moves' }, ['number']],
      [{ query: 'enums', values: ['a'] }, ['string']],
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
      assert.deepEqual(inferQueryRuntimeShapes(query), expected);
    }
  });

  it('infers query runtime shapes deterministically for recursive queries with first-seen dedupe', () => {
    const query = {
      query: 'concat',
      sources: [
        {
          query: 'nextInOrderByCondition',
          source: { query: 'tokensInMapSpaces' },
          from: 1,
          bind: '$token',
          where: { op: '==', left: 1, right: 1 },
        },
        { query: 'assetRows', tableId: 'scores' },
        {
          query: 'concat',
          sources: [
            { query: 'zones' },
            { query: 'tokensInZone', zone: 'deck:none' },
            { query: 'binding', name: '$picked' },
          ],
        },
        { query: 'players' },
        { query: 'assetRows', tableId: 'scores' },
      ],
    } as const satisfies OptionsQuery;

    const shapes = inferQueryRuntimeShapes(query);

    assert.deepEqual(shapes, ['token', 'object', 'string', 'unknown', 'number']);
    assert.deepEqual(shapes, [...inferCanonicalQueryRuntimeShapesSet(query)]);
  });

  it('infers recursive nextInOrderByCondition source shapes through nested recursion', () => {
    const query = {
      query: 'nextInOrderByCondition',
      source: {
        query: 'concat',
        sources: [
          { query: 'zones' },
          { query: 'tokensInZone', zone: 'deck:none' },
          { query: 'zones' },
          { query: 'players' },
        ],
      },
      from: 1,
      bind: '$item',
      where: { op: '==', left: 1, right: 1 },
    } as const satisfies OptionsQuery;

    assert.deepEqual(inferQueryRuntimeShapes(query), ['string', 'token', 'number']);
    assert.deepEqual(inferQueryRuntimeShapes(query), [...inferCanonicalQueryRuntimeShapesSet(query)]);
  });

  it('infers value runtime shapes for refs and conditional expressions', () => {
    const shapes = inferValueRuntimeShapes(
      {
        if: {
          when: true,
          then: { ref: 'gvar', var: 'money' },
          else: { ref: 'assetField', row: '$row', tableId: 't1', field: 'enabled' },
        },
      },
      {
        globalVarTypesByName: new Map([['money', 'int']]),
        perPlayerVarTypesByName: new Map(),
        tableContractsById: new Map([
          [
            't1',
            {
              id: 't1',
              assetId: 'asset',
              tablePath: 'rows',
              fields: [{ field: 'enabled', type: 'boolean' }],
            },
          ],
        ]),
      },
    );

    assert.deepEqual(shapes, ['number', 'boolean']);
  });

  it('reports compatibility only for aligned scalar source/anchor shapes', () => {
    assert.equal(areSourceAndAnchorShapesCompatible('number', 'number'), true);
    assert.equal(areSourceAndAnchorShapesCompatible('string', 'string'), true);
    assert.equal(areSourceAndAnchorShapesCompatible('number', 'string'), false);
    assert.equal(areSourceAndAnchorShapesCompatible('string', 'boolean'), false);
    assert.equal(areSourceAndAnchorShapesCompatible('token', 'string'), false);
    assert.equal(areSourceAndAnchorShapesCompatible('object', 'number'), false);
  });
});
