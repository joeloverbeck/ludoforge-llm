import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL tutorial Gulf of Tonkin event-card production spec', () => {
  it('compiles card 1 (Gulf of Tonkin) with free Air Strike grant and casualty-scaled aid penalty', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-1');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Gulf of Tonkin');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.factionOrder, ['US', 'NVA', 'ARVN', 'VC']);

    assert.equal(typeof card?.unshaded?.text, 'string');
    assert.equal(typeof card?.shaded?.text, 'string');
    assert.deepEqual(card?.unshaded?.freeOperationGrants, [{ faction: '0', actionIds: ['airStrike'] }]);
    assert.deepEqual(
      card?.unshaded?.targets?.map((target) => target.id),
      ['us-out-of-play', '$targetCities'],
    );
    assert.deepEqual(card?.unshaded?.targets?.[0]?.cardinality, { max: 6 });
    assert.deepEqual(card?.unshaded?.targets?.[1]?.cardinality, { max: 6 });

    const shadedAid = card?.shaded?.effects?.find((effect) => 'addVar' in effect);
    assert.notEqual(shadedAid, undefined);
    assert.deepEqual(shadedAid, {
      addVar: {
        scope: 'global',
        var: 'aid',
        delta: {
          op: '*',
          left: {
            aggregate: {
              op: 'count',
              query: {
                query: 'tokensInZone',
                zone: 'casualties-US:none',
                filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
              },
            },
          },
          right: -1,
        },
      },
    });

    const shadedMoveAll = card?.shaded?.effects?.find((effect) => 'moveAll' in effect);
    assert.deepEqual(shadedMoveAll, {
      moveAll: {
        from: 'casualties-US:none',
        to: 'out-of-play-US:none',
      },
    });
  });
});
