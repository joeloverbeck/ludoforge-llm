import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { initialState } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const countFaction = (tokens: readonly { readonly props: Readonly<Record<string, unknown>> }[] | undefined, faction: string): number =>
  (tokens ?? []).filter((token) => token.props.faction === faction).length;

describe('FITL scenario setup projection', () => {
  it('projects selected scenario placements, out-of-play pools, and available reserves into setup', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    const def = compiled.gameDef;
    assert.notEqual(def, null);

    const state = initialState(def!, 404, 2);

    assert.equal((state.zones['saigon:none'] ?? []).length > 0, true, 'Expected scenario pieces in Saigon');
    assert.equal((state.zones['out-of-play-US:none'] ?? []).length, 12, 'Expected US out-of-play scenario pieces');
    assert.equal((state.zones['out-of-play-ARVN:none'] ?? []).length, 15, 'Expected ARVN out-of-play scenario pieces');
    assert.equal(countFaction(state.zones['available-US:none'], 'US'), 26, 'Expected computed US available reserve count');
    assert.equal(countFaction(state.zones['available-ARVN:none'], 'ARVN'), 21, 'Expected computed ARVN available reserve count');
    assert.equal(countFaction(state.zones['available-NVA:none'], 'NVA'), 53, 'Expected computed NVA available reserve count');
    assert.equal(countFaction(state.zones['available-VC:none'], 'VC'), 16, 'Expected computed VC available reserve count');

    const tayNinhBase = (state.zones['tay-ninh:none'] ?? []).find(
      (token) => token.type === 'vc-bases' && token.props.faction === 'VC',
    );
    assert.notEqual(tayNinhBase, undefined);
    assert.equal(tayNinhBase?.props.tunnel, 'tunneled');
  });
});
