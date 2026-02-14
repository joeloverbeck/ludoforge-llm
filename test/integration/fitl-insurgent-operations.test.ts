import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, type GameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';

const addTokenToZone = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

describe('FITL insurgent operations integration', () => {
  it('compiles insurgent Rally/March/Attack/Terror operation profiles from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileMap = profiles.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) }));
    for (const expected of [
      { id: 'rally-profile', actionId: 'rally' },
      { id: 'march-profile', actionId: 'march' },
      { id: 'attack-nva-profile', actionId: 'attack' },
      { id: 'terror-profile', actionId: 'terror' },
    ]) {
      assert.ok(
        profileMap.some((p) => p.id === expected.id && p.actionId === expected.actionId),
        `Expected profile ${expected.id} with actionId ${expected.actionId}`,
      );
    }
  });

  it('executes attack through attack-nva-profile when active player is NVA', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 101, 4);
    const withNvaActive = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 10,
      },
    };
    const withAttackTargets = addTokenToZone(
      addTokenToZone(withNvaActive, ATTACK_SPACE, {
        id: asTokenId('test-nva-g-insurgent'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      }),
      ATTACK_SPACE,
      {
        id: asTokenId('test-us-t-insurgent'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );
    const selected = {
      actionId: asActionId('attack'),
      params: {
        targetSpaces: [ATTACK_SPACE],
        $attackMode: 'troops-attack',
        $targetFactionFirst: 'US',
      },
    };
    const final = applyMove(compiled.gameDef!, withAttackTargets, selected).state;

    assert.equal(final.globalVars.fallbackUsed, 0);
    assert.ok((final.globalVars.nvaResources ?? 10) <= 10, 'Expected Attack to charge NVA resources or keep them unchanged if free');
  });

  it('falls back to generic action effects when active player is not NVA', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const nonNvaState = {
      ...initialState(compiled.gameDef!, 77, 4),
      activePlayer: asPlayerId(0),
    };
    const final = applyMove(compiled.gameDef!, nonNvaState, { actionId: asActionId('attack'), params: {} }).state;
    assert.equal(final.globalVars.fallbackUsed, 100);
  });
});
