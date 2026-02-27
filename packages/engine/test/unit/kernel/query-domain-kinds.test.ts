import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveChoiceTargetKinds } from '../../../src/kernel/choice-target-kinds.js';
import { inferQueryDomainKinds } from '../../../src/kernel/query-domain-kinds.js';

describe('query domain kinds', () => {
  it('infers token, zone, and mixed domains through query composition', () => {
    const tokenOnly = inferQueryDomainKinds({ query: 'tokensInZone', zone: 'deck:none' });
    const zoneOnly = inferQueryDomainKinds({ query: 'mapSpaces' });
    const mixed = inferQueryDomainKinds({
      query: 'concat',
      sources: [
        { query: 'tokensInZone', zone: 'deck:none' },
        { query: 'zones' },
      ],
    });

    assert.deepEqual([...tokenOnly].sort(), ['token']);
    assert.deepEqual([...zoneOnly].sort(), ['zone']);
    assert.deepEqual([...mixed].sort(), ['token', 'zone']);
  });

  it('propagates source domains for nextInOrderByCondition and keeps other-domain queries explicit', () => {
    const propagated = inferQueryDomainKinds({
      query: 'nextInOrderByCondition',
      source: { query: 'tokensInMapSpaces' },
      from: 1,
      bind: '$x',
      where: { op: '==', left: 1, right: 1 },
    });
    const other = inferQueryDomainKinds({ query: 'players' });

    assert.deepEqual([...propagated].sort(), ['token']);
    assert.deepEqual([...other].sort(), ['other']);
  });

  it('derives choice target kinds from shared domain inference', () => {
    assert.deepEqual(deriveChoiceTargetKinds({ query: 'mapSpaces' }), ['zone']);
    assert.deepEqual(
      deriveChoiceTargetKinds({
        query: 'concat',
        sources: [
          { query: 'tokensInZone', zone: 'deck:none' },
          { query: 'zones' },
        ],
      }),
      ['zone', 'token'],
    );
  });
});
