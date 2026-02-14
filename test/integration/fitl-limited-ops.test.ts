import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, type GameState, type Token } from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const SPACE_A = 'quang-tri-thua-thien:none';
const SPACE_B = 'quang-nam:none';

const addTokenToZone = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

describe('FITL limited operation integration', () => {
  it('enforces attack limitedOperation to at most one selected target space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 509, 4);
    const withNvaActive = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 10,
      },
    };

    const withTargets = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(withNvaActive, SPACE_A, {
            id: asTokenId('limop-nva-a'),
            type: 'nva-troops',
            props: { faction: 'NVA', type: 'troops' },
          }),
          SPACE_A,
          {
            id: asTokenId('limop-us-a'),
            type: 'us-troops',
            props: { faction: 'US', type: 'troops' },
          },
        ),
        SPACE_B,
        {
          id: asTokenId('limop-nva-b'),
          type: 'nva-troops',
          props: { faction: 'NVA', type: 'troops' },
        },
      ),
      SPACE_B,
      {
        id: asTokenId('limop-us-b'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );

    assert.throws(
      () =>
        applyMove(def, withTargets, {
          actionId: asActionId('attack'),
          actionClass: 'limitedOperation',
          params: {
            targetSpaces: [SPACE_A, SPACE_B],
            $attackMode: 'troops-attack',
            $targetFactionFirst: 'US',
          },
        }),
      /Illegal move/,
      'Limited operation attack should reject multiple target spaces',
    );

    const singleSpace = applyMove(def, withTargets, {
      actionId: asActionId('attack'),
      actionClass: 'limitedOperation',
      params: {
        targetSpaces: [SPACE_A],
        $attackMode: 'troops-attack',
        $targetFactionFirst: 'US',
      },
    }).state;

    assert.equal(singleSpace.globalVars.fallbackUsed, 0, 'Limited attack should resolve through attack profile (no fallback)');
  });
});
