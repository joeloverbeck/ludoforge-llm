import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL Green Berets event-card production spec', () => {
  it('compiles card 68 with metadata, dual sides, and declarative placement/opposition effects', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const greenBerets = compiled.gameDef?.eventDecks?.[0]?.cards.find((card) => card.id === 'card-68');
    assert.notEqual(greenBerets, undefined);
    assert.equal(greenBerets?.title, 'Green Berets');
    assert.equal(greenBerets?.sideMode, 'dual');
    assert.deepEqual(greenBerets?.tags, []);
    assert.equal(greenBerets?.metadata?.period, '1964');
    assert.deepEqual(greenBerets?.metadata?.seatOrder, ['ARVN', 'US', 'VC', 'NVA']);
    assert.equal(typeof greenBerets?.metadata?.flavorText, 'string');
    assert.equal(
      greenBerets?.unshaded?.text,
      'Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support.',
    );
    assert.equal(
      greenBerets?.shaded?.text,
      'Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition.',
    );

    const unshadedBranchIds = greenBerets?.unshaded?.branches?.map((branch) => branch.id);
    assert.deepEqual(unshadedBranchIds, ['place-irregulars-and-support', 'place-rangers-and-support']);

    for (const branch of greenBerets?.unshaded?.branches ?? []) {
      assert.equal(branch.targets?.[0]?.selector?.query, 'mapSpaces');
      assert.deepEqual(branch.targets?.[0]?.cardinality, { max: 1 });
      const removeEffect = branch.effects?.find((effect) => 'removeByPriority' in effect);
      assert.notEqual(removeEffect, undefined);
      assert.equal(removeEffect?.removeByPriority.budget, 3);
      const supportEffect = branch.effects?.find((effect) => 'setMarker' in effect);
      assert.deepEqual(supportEffect, {
        setMarker: {
          space: '$targetProvince',
          marker: 'supportOpposition',
          state: 'activeSupport',
        },
      });
    }

    assert.equal(greenBerets?.shaded?.targets?.[0]?.selector?.query, 'mapSpaces');
    assert.deepEqual(greenBerets?.shaded?.targets?.[0]?.cardinality, { max: 1 });
    const shadedRemoveEffect = greenBerets?.shaded?.effects?.find((effect) => 'removeByPriority' in effect);
    assert.notEqual(shadedRemoveEffect, undefined);
    assert.equal(shadedRemoveEffect?.removeByPriority.budget, 3);
    const oppositionEffect = greenBerets?.shaded?.effects?.find((effect) => 'setMarker' in effect);
    assert.deepEqual(oppositionEffect, {
      setMarker: {
        space: '$sourceProvince',
        marker: 'supportOpposition',
        state: 'activeOpposition',
      },
    });
  });
});
