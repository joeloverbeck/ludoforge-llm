import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  legalMoves,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { completeMoveDecisionSequenceOrThrow, pickDeterministicDecisionValue } from '../helpers/move-decision-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const targetLoc = 'loc-hue-khe-sanh:none';
const intermediateCity = 'hue:none';
const sourceCity = 'da-nang:none';

const completePatrolMove = (
  def: GameDef,
  state: GameState,
  choose: (request: ChoicePendingRequest) => ReturnType<typeof pickDeterministicDecisionValue>,
): Move => {
  const template = legalMoves(def, state).find(
    (move) => move.actionId === asActionId('patrol') && Object.keys(move.params).length === 0,
  );
  assert.ok(template, 'Expected template move for patrol');
  return completeMoveDecisionSequenceOrThrow(
    { ...template!, actionClass: 'limitedOperation' },
    def,
    state,
    choose,
  );
};

describe('FITL patrol multi-hop sourcing integration', () => {
  it('US Patrol allows 2+ hop sourcing through clear LoC/City chain', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const base = makeIsolatedInitialState(def, 211, 4);
    const cubeId = 'patrol-us-multi-hop-cube';

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      zones: {
        ...base.zones,
        [sourceCity]: [{ id: asTokenId(cubeId), type: 'troops', props: { faction: 'US', type: 'troops' } }],
      },
    };

    const selected = completePatrolMove(def, state, (request) => {
      if (request.name === 'targetLoCs') return [targetLoc];
      if (request.name === '$movingCubes') return [cubeId];
      if (request.name === '$assaultLoCs') return [];
      return pickDeterministicDecisionValue(request);
    });

    const result = applyMove(def, state, selected).state;
    assert.equal((result.zones[targetLoc] ?? []).some((token) => String(token.id) === cubeId), true);
    assert.equal((result.zones[sourceCity] ?? []).some((token) => String(token.id) === cubeId), false);
  });

  it('ARVN Patrol allows 2+ hop sourcing through clear LoC/City chain', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const base = makeIsolatedInitialState(def, 223, 4);
    const cubeId = 'patrol-arvn-multi-hop-cube';

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(1),
      zones: {
        ...base.zones,
        [sourceCity]: [{ id: asTokenId(cubeId), type: 'troops', props: { faction: 'ARVN', type: 'troops' } }],
      },
    };

    const selected = completePatrolMove(def, state, (request) => {
      if (request.name === 'targetLoCs') return [targetLoc];
      if (request.name === '$movingCubes') return [cubeId];
      if (request.name === '$assaultLoCs') return [];
      return pickDeterministicDecisionValue(request);
    });

    const beforeArvnResources = Number(state.globalVars.arvnResources);
    const result = applyMove(def, state, selected).state;
    assert.equal((result.zones[targetLoc] ?? []).some((token) => String(token.id) === cubeId), true);
    assert.equal((result.zones[sourceCity] ?? []).some((token) => String(token.id) === cubeId), false);
    assert.equal(Number(result.globalVars.arvnResources), beforeArvnResources - 3);
  });

  it('Patrol keeps adjacent enemy-occupied source legal for 1-hop move', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const base = makeIsolatedInitialState(def, 227, 4);
    const cubeId = 'patrol-us-adjacent-enemy-source-cube';

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      zones: {
        ...base.zones,
        [intermediateCity]: [
          { id: asTokenId(cubeId), type: 'troops', props: { faction: 'US', type: 'troops' } },
          { id: asTokenId('patrol-us-adjacent-enemy'), type: 'guerrilla', props: { faction: 'NVA', type: 'guerrilla', activity: 'active' } },
        ],
      },
    };

    const selected = completePatrolMove(def, state, (request) => {
      if (request.name === 'targetLoCs') return [targetLoc];
      if (request.name === '$movingCubes') return [cubeId];
      if (request.name === '$assaultLoCs') return [];
      return pickDeterministicDecisionValue(request);
    });

    const result = applyMove(def, state, selected).state;
    assert.equal((result.zones[targetLoc] ?? []).some((token) => String(token.id) === cubeId), true);
    assert.equal((result.zones[intermediateCity] ?? []).some((token) => String(token.id) === cubeId), false);
  });

  it('Patrol blocks multi-hop sourcing through enemy-occupied intermediate LoC/City', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const base = makeIsolatedInitialState(def, 229, 4);
    const cubeId = 'patrol-us-blocked-chain-cube';

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      zones: {
        ...base.zones,
        [sourceCity]: [{ id: asTokenId(cubeId), type: 'troops', props: { faction: 'US', type: 'troops' } }],
        [intermediateCity]: [
          { id: asTokenId('patrol-us-chain-blocker'), type: 'guerrilla', props: { faction: 'VC', type: 'guerrilla', activity: 'active' } },
        ],
      },
    };

    const selected = completePatrolMove(def, state, (request) => {
      if (request.name === 'targetLoCs') return [targetLoc];
      if (request.name === '$movingCubes') {
        const movingCubeOptions = request.options.map((option) => String(option.value));
        assert.equal(movingCubeOptions.includes(cubeId), false, 'Blocked chain should not expose the 2+ hop source cube');
        return [];
      }
      if (request.name === '$assaultLoCs') return [];
      return pickDeterministicDecisionValue(request);
    });

    const result = applyMove(def, state, selected).state;
    assert.equal((result.zones[sourceCity] ?? []).some((token) => String(token.id) === cubeId), true);
    assert.equal((result.zones[targetLoc] ?? []).some((token) => String(token.id) === cubeId), false);
  });
});
