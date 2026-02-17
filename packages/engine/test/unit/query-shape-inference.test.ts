import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  areSourceAndAnchorShapesCompatible,
  inferQueryRuntimeShapes,
  inferValueRuntimeShapes,
} from '../../src/kernel/query-shape-inference.js';

describe('query shape inference', () => {
  it('infers query runtime shapes deterministically for nested queries', () => {
    const shapes = inferQueryRuntimeShapes({
      query: 'concat',
      sources: [
        { query: 'players' },
        { query: 'enums', values: ['a'] },
        { query: 'players' },
      ],
    });

    assert.deepEqual(shapes, ['number', 'string']);
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
