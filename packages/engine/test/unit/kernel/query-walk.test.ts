import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OptionsQuery } from '../../../src/kernel/types.js';
import { forEachOptionsQueryLeaf, reduceOptionsQueryLeaves } from '../../../src/kernel/query-walk.js';

describe('query walk', () => {
  it('walks leaves depth-first and left-to-right across recursive queries', () => {
    const query = {
      query: 'concat',
      sources: [
        { query: 'tokensInZone', zone: 'deck:none' },
        {
          query: 'nextInOrderByCondition',
          source: {
            query: 'concat',
            sources: [{ query: 'zones' }, { query: 'assetRows', tableId: 'scores' }],
          },
          from: 1,
          bind: '$item',
          where: { op: '==', left: 1, right: 1 },
        },
        { query: 'players' },
      ],
    } as const satisfies OptionsQuery;

    const visited: string[] = [];
    forEachOptionsQueryLeaf(query, (leaf) => {
      visited.push(leaf.query);
    });

    assert.deepEqual(visited, ['tokensInZone', 'zones', 'assetRows', 'players']);
  });

  it('supports reducing over visited leaves', () => {
    const query = {
      query: 'concat',
      sources: [{ query: 'players' }, { query: 'players' }, { query: 'enums', values: ['A'] }],
    } as const satisfies OptionsQuery;

    const counts = reduceOptionsQueryLeaves(
      query,
      { players: 0, enums: 0 },
      (acc, leaf) => {
        if (leaf.query === 'players') {
          return { ...acc, players: acc.players + 1 };
        }
        if (leaf.query === 'enums') {
          return { ...acc, enums: acc.enums + 1 };
        }
        return acc;
      },
    );

    assert.deepEqual(counts, { players: 2, enums: 1 });
  });

  it('never dispatches recursive query kinds to leaf visitors', () => {
    const query = {
      query: 'nextInOrderByCondition',
      source: {
        query: 'concat',
        sources: [{ query: 'players' }, { query: 'zones' }],
      },
      from: 0,
      bind: '$item',
      where: true,
    } as const satisfies OptionsQuery;

    const visited: string[] = [];
    forEachOptionsQueryLeaf(query, (leaf) => {
      visited.push(leaf.query);
    });

    assert.deepEqual(visited, ['players', 'zones']);
    assert.equal(visited.includes('concat'), false);
    assert.equal(visited.includes('nextInOrderByCondition'), false);
  });
});
