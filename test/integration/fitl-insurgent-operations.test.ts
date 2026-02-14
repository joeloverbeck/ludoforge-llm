import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, legalMoves, type GameState, type Token } from '../../src/kernel/index.js';
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

  it('treats attack as illegal when active player is not NVA', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const nonNvaState = {
      ...initialState(compiled.gameDef!, 77, 4),
      activePlayer: asPlayerId(0),
    };
    const legal = legalMoves(compiled.gameDef!, nonNvaState);
    assert.ok(!legal.some((move) => move.actionId === asActionId('attack')));
    assert.throws(
      () => applyMove(compiled.gameDef!, nonNvaState, { actionId: asActionId('attack'), params: {} }),
      /Illegal move/,
    );
  });

  it('applies troops-attack damage as floor(nvaTroops/2) and applies attrition equal to US removed', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 181, 4);
    const withNvaActive = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 10,
      },
    };

    const withAttackTargets = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            addTokenToZone(
              addTokenToZone(withNvaActive, ATTACK_SPACE, {
                id: asTokenId('test-floor-nva-t1'),
                type: 'nva-troops',
                props: { faction: 'NVA', type: 'troops' },
              }),
              ATTACK_SPACE,
              {
                id: asTokenId('test-floor-nva-t2'),
                type: 'nva-troops',
                props: { faction: 'NVA', type: 'troops' },
              },
            ),
            ATTACK_SPACE,
            {
              id: asTokenId('test-floor-nva-t3'),
              type: 'nva-troops',
              props: { faction: 'NVA', type: 'troops' },
            },
          ),
          ATTACK_SPACE,
          {
            id: asTokenId('test-floor-us-t1'),
            type: 'us-troops',
            props: { faction: 'US', type: 'troops' },
          },
        ),
        ATTACK_SPACE,
        {
          id: asTokenId('test-floor-us-t2'),
          type: 'us-troops',
          props: { faction: 'US', type: 'troops' },
        },
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('test-floor-us-t3'),
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
    const final = applyMove(def, withAttackTargets, selected).state;

    const usInSpace = (final.zones[ATTACK_SPACE] ?? []).filter((token) => token.props.faction === 'US').length;
    const usInCasualties = (final.zones['casualties-US:none'] ?? []).filter((token) => token.props.faction === 'US').length;
    const nvaInSpace = (final.zones[ATTACK_SPACE] ?? []).filter((token) => token.props.faction === 'NVA').length;
    const nvaInAvailable = (final.zones['available-NVA:none'] ?? []).filter((token) => token.props.faction === 'NVA').length;

    assert.equal(usInSpace, 2, '3 NVA troops should inflict floor(3/2)=1 damage in troops mode');
    assert.equal(usInCasualties, 1, 'Exactly one US piece should be removed to casualties');
    assert.equal(nvaInSpace, 2, 'NVA should lose exactly one piece to attrition per US removed');
    assert.equal(nvaInAvailable, 1, 'NVA attrition loss should route to available-NVA:none');
  });

  it('skips nvaResources attack spend when move is marked freeOperation', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 211, 4);
    const withNvaActive = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 7,
      },
    };
    const withTargets = addTokenToZone(
      addTokenToZone(withNvaActive, ATTACK_SPACE, {
        id: asTokenId('test-free-nva-t'),
        type: 'nva-troops',
        props: { faction: 'NVA', type: 'troops' },
      }),
      ATTACK_SPACE,
      {
        id: asTokenId('test-free-us-t'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );

    const nonFree = applyMove(def, withTargets, {
      actionId: asActionId('attack'),
      params: {
        targetSpaces: [ATTACK_SPACE],
        $attackMode: 'troops-attack',
        $targetFactionFirst: 'US',
      },
    }).state;
    const free = applyMove(def, withTargets, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        targetSpaces: [ATTACK_SPACE],
        $attackMode: 'troops-attack',
        $targetFactionFirst: 'US',
      },
    }).state;

    assert.equal(nonFree.globalVars.nvaResources, 6, 'Non-free attack should spend 1 NVA resource per targeted space');
    assert.equal(free.globalVars.nvaResources, 7, 'Free attack should skip per-space NVA resource spend');
  });
});
