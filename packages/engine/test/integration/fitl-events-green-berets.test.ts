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

      // Filter: province without NVA Control (compiler wraps ConditionAST in { condition: ... })
      const filter = branch.targets?.[0]?.selector?.filter;
      assert.notEqual(filter, undefined, 'unshaded branch target must have a filter');
      const condition = filter?.condition as Record<string, unknown> | undefined;
      assert.notEqual(condition, undefined, 'filter must have a condition');
      assert.equal(condition?.op, 'and');
      const args = condition?.args as Record<string, unknown>[];
      assert.equal(args?.length, 2);
      // First arg: category == province
      assert.equal(args?.[0]?.op, '==');
      assert.deepEqual(args?.[0]?.left, { ref: 'zoneProp', zone: '$zone', prop: 'category' });
      assert.equal(args?.[0]?.right, 'province');
      // Second arg: NVA count <= (US+ARVN+VC) count
      assert.equal(args?.[1]?.op, '<=');

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

    // Shaded: cross-zone selection (no targets, uses if > chooseN > chooseOne > forEach > setMarker)
    assert.equal(greenBerets?.shaded?.targets, undefined, 'shaded should not have targets');
    assert.equal(greenBerets?.shaded?.effects?.length, 1, 'shaded should have 1 top-level effect (if)');

    const ifEffect = greenBerets?.shaded?.effects?.[0] as Record<string, Record<string, unknown>> | undefined;
    assert.notEqual(ifEffect?.if, undefined, 'top-level effect must be an if');

    const thenEffects = ifEffect?.if?.then as Record<string, unknown>[];
    assert.equal(thenEffects?.length, 4, 'if.then should have 4 effects');

    // chooseN binds $irregularsToRemove
    const chooseNEffect = thenEffects?.[0] as Record<string, Record<string, unknown>>;
    assert.equal(chooseNEffect?.chooseN?.bind, '$irregularsToRemove');
    assert.equal(chooseNEffect?.chooseN?.min, 0);
    assert.equal(chooseNEffect?.chooseN?.max, 3);
    assert.equal(
      (chooseNEffect?.chooseN?.options as Record<string, unknown>)?.query,
      'tokensInMapSpaces',
    );

    // chooseOne binds $oppositionProvince
    const chooseOneEffect = thenEffects?.[1] as Record<string, Record<string, unknown>>;
    assert.equal(chooseOneEffect?.chooseOne?.bind, '$oppositionProvince');
    assert.equal(
      (chooseOneEffect?.chooseOne?.options as Record<string, unknown>)?.query,
      'mapSpaces',
    );

    // forEach binds $irregular over $irregularsToRemove
    const forEachEffect = thenEffects?.[2] as Record<string, Record<string, unknown>>;
    assert.equal(forEachEffect?.forEach?.bind, '$irregular');
    assert.deepEqual(forEachEffect?.forEach?.over, { query: 'binding', name: '$irregularsToRemove' });

    // setMarker uses $oppositionProvince with activeOpposition
    const setMarkerEffect = thenEffects?.[3] as Record<string, Record<string, unknown>>;
    assert.deepEqual(setMarkerEffect, {
      setMarker: {
        space: '$oppositionProvince',
        marker: 'supportOpposition',
        state: 'activeOpposition',
      },
    });

    // else is empty array
    assert.deepEqual(ifEffect?.if?.else, []);
  });
});
