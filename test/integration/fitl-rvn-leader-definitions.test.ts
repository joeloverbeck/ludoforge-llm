import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL RVN leader definitions', () => {
  it('compiles activeLeader global marker lattice with canonical states', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected production spec compilation to succeed');

    const activeLeader = compiled.gameDef?.globalMarkerLattices?.find((lattice) => lattice.id === 'activeLeader');
    assert.notEqual(activeLeader, undefined, 'Expected activeLeader global marker lattice to exist');
    assert.deepEqual(activeLeader?.states, ['minh', 'khanh', 'youngTurks', 'ky', 'thieu']);
    assert.equal(activeLeader?.defaultState, 'minh');
  });

  it('compiles leaderBoxCardCount global variable with expected bounds', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected production spec compilation to succeed');

    const leaderBoxCardCount = compiled.gameDef?.globalVars.find((variable) => variable.name === 'leaderBoxCardCount');
    assert.notEqual(leaderBoxCardCount, undefined, 'Expected leaderBoxCardCount global variable to exist');
    assert.equal(leaderBoxCardCount?.type, 'int');
    assert.equal(leaderBoxCardCount?.init, 0);
    assert.equal(leaderBoxCardCount?.min, 0);
    assert.equal(leaderBoxCardCount?.max, 8);
  });
});
