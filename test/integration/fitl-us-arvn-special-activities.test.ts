import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL US/ARVN special activities integration', () => {
  it('compiles US/ARVN special-activity operation profiles with linked windows from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileSummaries = profiles.map((profile) => ({
      id: profile.id,
      actionId: String(profile.actionId),
      windows: profile.linkedWindows ?? [],
    }));
    for (const expected of [
      { id: 'advise-profile', actionId: 'advise', windows: ['us-special-window'] },
      { id: 'air-lift-profile', actionId: 'airLift', windows: ['us-special-window'] },
      { id: 'air-strike-profile', actionId: 'airStrike', windows: ['us-special-window'] },
      { id: 'govern-profile', actionId: 'govern', windows: ['arvn-special-window'] },
      { id: 'transport-profile', actionId: 'transport', windows: ['arvn-special-window'] },
      { id: 'raid-profile', actionId: 'raid', windows: ['arvn-special-window'] },
    ]) {
      const found = profileSummaries.find((p) => p.id === expected.id);
      assert.ok(found, `Expected profile ${expected.id}`);
      assert.equal(found!.actionId, expected.actionId);
      assert.deepEqual(found!.windows, expected.windows);
    }
  });

  it('executes US/ARVN special activities through compiled actionPipelines instead of fallback action effects', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 113, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('advise'), params: {} },
      { actionId: asActionId('airLift'), params: {} },
      { actionId: asActionId('airStrike'), params: {} },
      { actionId: asActionId('govern'), params: {} },
      { actionId: asActionId('transport'), params: {} },
      { actionId: asActionId('raid'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    // Special activities are zero-cost per Rule 4.1.
    assert.equal(final.globalVars.usResources, 7);
    assert.equal(final.globalVars.arvnResources, 30);
    assert.equal(final.globalVars.adviseCount, 1);
    assert.equal(final.globalVars.airLiftCount, 1);
    assert.equal(final.globalVars.airStrikeCount, 1);
    assert.equal(final.globalVars.governCount, 1);
    assert.equal(final.globalVars.transportCount, 1);
    assert.equal(final.globalVars.raidCount, 1);
  });

  it('rejects advise when accompanied by an operation outside accompanyingOps', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const state = initialState(compiled.gameDef!, 211, 2);

    assert.throws(
      () => applyMove(compiled.gameDef!, state, {
        actionId: asActionId('usOp'),
        params: {},
        compound: {
          specialActivity: { actionId: asActionId('advise'), params: {} },
          timing: 'after',
        },
      }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
          };
        };

        assert.equal(details.reason, 'special activity cannot accompany this operation');
        assert.equal(details.metadata?.code, 'SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED');
        return true;
      },
    );
  });
});
