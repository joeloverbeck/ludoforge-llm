import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL insurgent operations integration', () => {
  it('compiles insurgent Rally/March/Attack/Terror operation profiles from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.operationProfiles ?? [];
    const profileMap = profiles.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) }));
    for (const expected of [
      { id: 'rally-profile', actionId: 'rally' },
      { id: 'march-profile', actionId: 'march' },
      { id: 'attack-profile', actionId: 'attack' },
      { id: 'terror-profile', actionId: 'terror' },
    ]) {
      assert.ok(
        profileMap.some((p) => p.id === expected.id && p.actionId === expected.actionId),
        `Expected profile ${expected.id} with actionId ${expected.actionId}`,
      );
    }
  });

  it('executes insurgent operations through compiled operationProfiles instead of fallback action effects', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 101, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('rally'), params: {} },
      { actionId: asActionId('march'), params: {} },
      { actionId: asActionId('attack'), params: {} },
      { actionId: asActionId('terror'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    assert.equal(final.globalVars.insurgentResources, 2);
    assert.equal(final.globalVars.rallyCount, 1);
    assert.equal(final.globalVars.marchCount, 1);
    assert.equal(final.globalVars.attackCount, 1);
    assert.equal(final.globalVars.terrorCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  it('rejects attack when profile cost validation fails under partialExecution forbid', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 77, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        insurgentResources: 1,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('attack'), params: {} }),
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
