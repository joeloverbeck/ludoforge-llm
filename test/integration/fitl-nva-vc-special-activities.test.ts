import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL NVA/VC special activities integration', () => {
  it('compiles NVA/VC special-activity profiles and ambush targeting metadata from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.operationProfiles ?? [];
    const profileSummaries = profiles.map((profile) => ({
      id: profile.id,
      actionId: String(profile.actionId),
      windows: profile.linkedSpecialActivityWindows ?? [],
    }));
    for (const expected of [
      { id: 'infiltrate-profile', actionId: 'infiltrate', windows: ['nva-special-window'] },
      { id: 'bombard-profile', actionId: 'bombard', windows: ['nva-special-window'] },
      { id: 'nva-ambush-profile', actionId: 'ambushNva', windows: ['nva-special-window'] },
      { id: 'tax-profile', actionId: 'tax', windows: ['vc-special-window'] },
      { id: 'subvert-profile', actionId: 'subvert', windows: ['vc-special-window'] },
      { id: 'vc-ambush-profile', actionId: 'ambushVc', windows: ['vc-special-window'] },
    ]) {
      const found = profileSummaries.find((p) => p.id === expected.id);
      assert.ok(found, `Expected profile ${expected.id}`);
      assert.equal(found!.actionId, expected.actionId);
      assert.deepEqual(found!.windows, expected.windows);
    }

    const nvaAmbush = profiles.find((profile) => profile.id === 'nva-ambush-profile');
    const vcAmbush = profiles.find((profile) => profile.id === 'vc-ambush-profile');
    assert.equal(nvaAmbush?.targeting.tieBreak, 'basesLast');
    assert.equal(vcAmbush?.targeting.tieBreak, 'lexicographicSpaceId');
  });

  it('executes NVA/VC special activities through compiled operationProfiles instead of fallback action effects', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 131, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('infiltrate'), params: {} },
      { actionId: asActionId('bombard'), params: {} },
      { actionId: asActionId('ambushNva'), params: {} },
      { actionId: asActionId('tax'), params: {} },
      { actionId: asActionId('subvert'), params: {} },
      { actionId: asActionId('ambushVc'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    // Production spec: nvaResources init 10, vcResources init 5
    // infiltrate(-2 nva) → bombard(-1 nva) → ambushNva(-1 nva) → tax(-1 vc) → subvert(-2 vc) → ambushVc(-1 vc)
    assert.equal(final.globalVars.nvaResources, 6);
    assert.equal(final.globalVars.vcResources, 1);
    assert.equal(final.globalVars.infiltrateCount, 1);
    assert.equal(final.globalVars.bombardCount, 1);
    assert.equal(final.globalVars.nvaAmbushCount, 1);
    assert.equal(final.globalVars.taxCount, 1);
    assert.equal(final.globalVars.subvertCount, 1);
    assert.equal(final.globalVars.vcAmbushCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  it('rejects infiltrate when profile legality fails', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 313, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        nvaResources: 1,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('infiltrate'), params: {} }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
          };
        };

        assert.equal(details.reason, 'action is not legal in current state');
        return true;
      },
    );
  });

  it('rejects subvert when profile cost validation fails under partialExecution forbid', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 227, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        vcResources: 1,
        nvaResources: 2,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('subvert'), params: {} }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
            readonly partialExecutionMode?: string;
          };
        };

        assert.equal(details.reason, 'action is not legal in current state');
        return true;
      },
    );
  });
});
