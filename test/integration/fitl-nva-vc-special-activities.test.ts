import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, initialState, type GameState, type Move } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const operationInitialState = (
  def: Parameters<typeof initialState>[0],
  seed: number,
  playerCount: number,
): GameState => ({
  ...initialState(def, seed, playerCount),
  turnOrderState: { type: 'roundRobin' },
});

describe('FITL NVA/VC special activities integration', () => {
  it('compiles NVA/VC special-activity profiles and ambush targeting metadata from production spec', () => {
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

  it('executes NVA/VC special activities through compiled actionPipelines instead of fallback action effects', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const start = operationInitialState(compiled.gameDef!, 131, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('infiltrate'), params: {} },
      { actionId: asActionId('bombard'), params: {} },
      { actionId: asActionId('ambushNva'), params: {} },
      { actionId: asActionId('tax'), params: {} },
      { actionId: asActionId('subvert'), params: {} },
      { actionId: asActionId('ambushVc'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    // Special activities are zero-cost per Rule 4.1.
    assert.equal(final.globalVars.nvaResources, 10);
    assert.equal(final.globalVars.vcResources, 5);
    assert.equal(final.globalVars.infiltrateCount, 1);
    assert.equal(final.globalVars.bombardCount, 1);
    assert.equal(final.globalVars.nvaAmbushCount, 1);
    assert.equal(final.globalVars.taxCount, 1);
    assert.equal(final.globalVars.subvertCount, 1);
    assert.equal(final.globalVars.vcAmbushCount, 1);
  });

  it('rejects infiltrate when accompanied by an operation outside accompanyingOps', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 313, 2);

    assert.throws(
      () => applyMove(compiled.gameDef!, state, {
        actionId: asActionId('usOp'),
        params: {},
        compound: {
          specialActivity: { actionId: asActionId('infiltrate'), params: {} },
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

  it('allows bombard when accompanyingOps is any', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const state = operationInitialState(compiled.gameDef!, 227, 2);
    const result = applyMove(compiled.gameDef!, state, {
      actionId: asActionId('usOp'),
      params: {},
      compound: {
        specialActivity: { actionId: asActionId('bombard'), params: {} },
        timing: 'after',
      },
    });
    assert.equal(result.state.globalVars.bombardCount, 1);
  });
});
