import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, ILLEGAL_MOVE_REASONS, initialState, type GameState, type Move } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { withPendingFreeOperationGrant } from '../helpers/turn-order-helpers.js';

const withArvnResources = (state: GameState, amount: number): GameState => ({
  ...state,
  perPlayerVars: {
    ...state.perPlayerVars,
    '1': { ...state.perPlayerVars['1'], resources: amount },
  },
});

describe('FITL Joint Operation cost constraint integration', () => {
  const { parsed, compiled } = compileProductionSpec();

  it('compiles joint operation profiles from production spec', () => {
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileMap = profiles.map((p) => ({ id: p.id, actionId: String(p.actionId) }));
    for (const expected of [
      { id: 'us-op-profile', actionId: 'usOp' },
      { id: 'arvn-op-profile', actionId: 'arvnOp' },
    ]) {
      assert.ok(
        profileMap.some((p) => p.id === expected.id && p.actionId === expected.actionId),
        `Expected profile ${expected.id} with actionId ${expected.actionId}`,
      );
    }
  });

  it('allows US operation when ARVN resources minus cost remain above Total Econ (21 - 5 = 16 > 15)', () => {
    const gameDef = compiled.gameDef!;
    const state = withArvnResources(initialState(gameDef, 42, 2).state, 21);

    // ARVN resources = 21, totalEcon = 15, cost = 5
    // 21 - 5 = 16 > 15 → allowed
    const result = applyMove(gameDef, state, { actionId: asActionId('usOp'), params: {} });

    assert.equal(result.state.perPlayerVars['1']!.resources, 16, 'ARVN resources reduced by 5');
    assert.equal(result.state.globalVars.usOpCount, 1, 'stages effect executed');
  });

  it('allows US operation at boundary (ARVN resources - cost == Total Econ: 20 - 5 = 15)', () => {
    const gameDef = compiled.gameDef!;
    const state = withArvnResources(initialState(gameDef, 42, 2).state, 20);

    // ARVN resources = 20, totalEcon = 15, cost = 5
    // 20 - 5 = 15 == 15 → allowed (floor at Total Econ)
    const result = applyMove(gameDef, state, { actionId: asActionId('usOp'), params: {} });
    assert.equal(result.state.perPlayerVars['1']!.resources, 15, 'ARVN resources reduced by 5 to floor');
    assert.equal(result.state.globalVars.usOpCount, 1, 'stages effect executed');
  });

  it('blocks US operation when ARVN resources minus cost would go below Total Econ (19 - 5 = 14 < 15)', () => {
    const gameDef = compiled.gameDef!;
    const state = withArvnResources(initialState(gameDef, 42, 2).state, 19);

    // ARVN resources = 19, totalEcon = 15, cost = 5
    // 19 - 5 = 14 < 15 → blocked (forbid mode)
    const snapshot = structuredClone(state);

    assert.throws(
      () => applyMove(gameDef, state, { actionId: asActionId('usOp'), params: {} }),
      (error: unknown) => {
        const details = error as Error & {
          reason?: string;
          metadata?: {
            readonly code?: string;
            readonly profileId?: string;
            readonly partialExecutionMode?: string;
          };
        };

        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
        return true;
      },
    );

    assert.deepEqual(state, snapshot, 'state unchanged after blocked operation');
  });

  it('allows non-US (ARVN) faction operation without joint operation constraint', () => {
    const gameDef = compiled.gameDef!;
    // Set ARVN as active player (player 1) so the "active" player selector resolves to ARVN
    const base = initialState(gameDef, 42, 2).state;
    const state: GameState = {
      ...base,
      activePlayer: 1 as GameState['activePlayer'],
    };

    // ARVN operation validates against active player's own resources (20 >= 5 → allowed)
    const result = applyMove(gameDef, state, { actionId: asActionId('arvnOp'), params: {} });

    assert.equal(result.state.perPlayerVars['1']!.resources, 15, 'ARVN resources reduced by 5');
    assert.equal(result.state.globalVars.arvnOpCount, 1, 'stages effect executed');
  });

  it('allows free US operation regardless of cost constraint (freeOperation bypasses cost validation)', () => {
    const gameDef = compiled.gameDef!;
    // Set ARVN resources to 14 — would normally be blocked (14 - 5 = 9 < 10)
    const state = withPendingFreeOperationGrant(withArvnResources(initialState(gameDef, 42, 2).state, 14), { actionIds: ['usOp'] });

    const move: Move = { actionId: asActionId('usOp'), params: {}, freeOperation: true };
    const result = applyMove(gameDef, state, move);

    assert.equal(result.state.perPlayerVars['1']!.resources, 14, 'ARVN resources unchanged — cost bypassed');
    assert.equal(result.state.globalVars.usOpCount, 1, 'stages effects still execute');
  });
});
