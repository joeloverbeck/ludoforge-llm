import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL momentum marker globalVar definitions', () => {
  it('compiles all 15 momentum markers as boolean globals defaulting to false', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected production spec compilation to succeed');

    const expectedMomentumIds = new Set([
      'mom_wildWeasels',
      'mom_adsid',
      'mom_rollingThunder',
      'mom_medevacUnshaded',
      'mom_medevacShaded',
      'mom_blowtorchKomer',
      'mom_claymores',
      'mom_daNang',
      'mom_mcnamaraLine',
      'mom_oriskany',
      'mom_bombingPause',
      'mom_559thTransportGrp',
      'mom_bodyCount',
      'mom_generalLansdale',
      'mom_typhoonKate',
    ]);

    const momentumVars = (compiled.gameDef?.globalVars ?? []).filter((variable) => variable.name.startsWith('mom_'));
    assert.equal(momentumVars.length, 15, 'Expected exactly 15 momentum globalVars');
    assert.deepEqual(
      new Set(momentumVars.map((variable) => variable.name)),
      expectedMomentumIds,
      'Expected compiled momentum globalVar IDs to match canonical list',
    );

    for (const variable of momentumVars) {
      assert.equal(variable.type, 'boolean', `${variable.name} must compile as boolean`);
      assert.equal(variable.init, false, `${variable.name} must default to false`);
    }
  });
});
