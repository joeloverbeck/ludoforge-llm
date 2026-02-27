import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OptionsQuery } from '../../../src/kernel/types.js';
import { deriveChoiceTargetKinds } from '../../../src/kernel/choice-target-kinds.js';
import { inferQueryDomainKinds, type QueryDomainKind } from '../../../src/kernel/query-domain-kinds.js';

const sortedDomains = (query: OptionsQuery): readonly QueryDomainKind[] => [...inferQueryDomainKinds(query)].sort();

describe('query domain kinds', () => {
  it('classifies every non-recursive OptionsQuery variant explicitly', () => {
    const cases: readonly [OptionsQuery, readonly QueryDomainKind[]][] = [
      [{ query: 'tokensInZone', zone: 'deck:none' }, ['token']],
      [{ query: 'assetRows', tableId: 'scores' }, ['other']],
      [{ query: 'tokensInMapSpaces' }, ['token']],
      [{ query: 'intsInRange', min: 1, max: 3 }, ['other']],
      [{ query: 'intsInVarRange', var: 'moves' }, ['other']],
      [{ query: 'enums', values: ['A', 'B'] }, ['other']],
      [{ query: 'globalMarkers' }, ['other']],
      [{ query: 'players' }, ['other']],
      [{ query: 'zones' }, ['zone']],
      [{ query: 'mapSpaces' }, ['zone']],
      [{ query: 'adjacentZones', zone: 'deck:none' }, ['zone']],
      [{ query: 'tokensInAdjacentZones', zone: 'deck:none' }, ['token']],
      [{ query: 'connectedZones', zone: 'deck:none' }, ['zone']],
      [{ query: 'binding', name: '$picked' }, ['other']],
    ];

    for (const [query, expected] of cases) {
      assert.deepEqual(sortedDomains(query), expected);
    }
  });

  it('propagates domains for recursive query variants', () => {
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

    assert.deepEqual(sortedDomains(nextInOrderByCondition), ['token']);
    assert.deepEqual(sortedDomains(concat), ['other', 'token', 'zone']);
  });

  it('derives choice target kinds from domain inference and ignores other-domain queries', () => {
    assert.deepEqual(deriveChoiceTargetKinds({ query: 'mapSpaces' }), ['zone']);
    assert.deepEqual(deriveChoiceTargetKinds({ query: 'players' }), []);
    assert.deepEqual(
      deriveChoiceTargetKinds({
        query: 'concat',
        sources: [
          { query: 'tokensInZone', zone: 'deck:none' },
          { query: 'zones' },
          { query: 'binding', name: '$picked' },
        ],
      }),
      ['zone', 'token'],
    );
  });
});
