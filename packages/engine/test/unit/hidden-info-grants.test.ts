import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPlayerId } from '../../src/kernel/branded.js';
import { canonicalTokenFilterKey, revealGrantEquals, removeMatchingRevealGrants } from '../../src/kernel/hidden-info-grants.js';
import type { RevealGrant } from '../../src/kernel/types.js';

describe('hidden-info grant helpers', () => {
  it('canonicalTokenFilterKey is order-insensitive for equivalent predicate arrays', () => {
    const first = canonicalTokenFilterKey([
      { prop: 'faction', op: 'eq', value: 'US' },
      { prop: 'rank', op: 'eq', value: 1 },
    ]);
    const second = canonicalTokenFilterKey([
      { prop: 'rank', op: 'eq', value: 1 },
      { prop: 'faction', op: 'eq', value: 'US' },
    ]);

    assert.equal(first, second);
  });

  it('revealGrantEquals treats reordered filter predicates as equal', () => {
    const left: RevealGrant = {
      observers: [asPlayerId(1)],
      filter: [
        { prop: 'faction', op: 'eq', value: 'US' },
        { prop: 'rank', op: 'eq', value: 1 },
      ],
    };
    const right: RevealGrant = {
      observers: [asPlayerId(1)],
      filter: [
        { prop: 'rank', op: 'eq', value: 1 },
        { prop: 'faction', op: 'eq', value: 'US' },
      ],
    };

    assert.equal(revealGrantEquals(left, right), true);
  });

  it('removeMatchingRevealGrants removes grants when filter order differs', () => {
    const grants: readonly RevealGrant[] = [
      {
        observers: [asPlayerId(1)],
        filter: [
          { prop: 'faction', op: 'eq', value: 'US' },
          { prop: 'rank', op: 'eq', value: 1 },
        ],
      },
      {
        observers: [asPlayerId(0)],
      },
    ];

    const removal = removeMatchingRevealGrants(grants, {
      filterKey: canonicalTokenFilterKey([
        { prop: 'rank', op: 'eq', value: 1 },
        { prop: 'faction', op: 'eq', value: 'US' },
      ]),
    });

    assert.equal(removal.removedCount, 1);
    assert.deepEqual(removal.remaining, [{ observers: [asPlayerId(0)] }]);
  });
});

