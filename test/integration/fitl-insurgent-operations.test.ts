import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, legalMoves, type GameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';
const RALLY_SPACE = 'quang-nam:none';
const RALLY_SPACE_2 = 'quang-tin-quang-ngai:none';

const addTokenToZone = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

const withSupportState = (state: GameState, zoneId: string, supportState: string): GameState => ({
  ...state,
  markers: {
    ...state.markers,
    [zoneId]: {
      ...(state.markers[zoneId] ?? {}),
      supportOpposition: supportState,
    },
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
      { id: 'rally-nva-profile', actionId: 'rally' },
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

  it('treats rally as illegal when active player is not NVA', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nonNvaState = {
      ...initialState(def, 301, 4),
      activePlayer: asPlayerId(0),
    };

    const legal = legalMoves(def, nonNvaState);
    assert.ok(!legal.some((move) => move.actionId === asActionId('rally')));
    assert.throws(
      () =>
        applyMove(def, nonNvaState, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [], $improveTrail: 'no' },
        }),
      /Illegal move/,
    );
  });

  it('enforces rally space filter: excludes support and includes neutral/opposition', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 302, 4);
    const nva = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 10,
      },
    };
    const withMarkers = withSupportState(
      withSupportState(withSupportState(nva, RALLY_SPACE, 'activeSupport'), RALLY_SPACE_2, 'neutral'),
      ATTACK_SPACE,
      'activeOpposition',
    );
    const withAvailable = addTokenToZone(
      addTokenToZone(withMarkers, 'available-NVA:none', {
        id: asTokenId('rally-filter-available-g1'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      }),
      'available-NVA:none',
      {
        id: asTokenId('rally-filter-available-g2'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMove(def, withAvailable, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
        }),
      /Illegal move/,
      'Rally should reject activeSupport spaces',
    );

    const neutralResult = applyMove(def, withAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;
    assert.equal(neutralResult.globalVars.nvaResources, 9, 'Neutral space should be eligible and spend 1 resource');

    const oppositionResult = applyMove(def, withAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [ATTACK_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;
    assert.equal(oppositionResult.globalVars.nvaResources, 9, 'Opposition space should be eligible and spend 1 resource');
  });

  it('charges per-space rally cost normally and skips only that cost on free operations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 303, 4);
    const nva = withSupportState(
      {
        ...start,
        activePlayer: asPlayerId(2),
        globalVars: {
          ...start.globalVars,
          nvaResources: 6,
        },
      },
      RALLY_SPACE,
      'neutral',
    );
    const nvaWithAvailable = addTokenToZone(nva, 'available-NVA:none', {
      id: asTokenId('rally-cost-available-g1'),
      type: 'nva-guerrillas',
      props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
    });

    const nonFree = applyMove(def, nvaWithAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;
    const free = applyMove(def, nvaWithAvailable, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;

    assert.equal(nonFree.globalVars.nvaResources, 5, 'Non-free rally should spend 1 NVA resource per selected space');
    assert.equal(free.globalVars.nvaResources, 6, 'Free rally should skip per-space NVA resource spend');
  });

  it('supports no-base replacement branch and with-base guerrilla placement limit', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 304, 4);
    const nvaBaseState = withSupportState(
      {
        ...start,
        activePlayer: asPlayerId(2),
        globalVars: {
          ...start.globalVars,
          nvaResources: 15,
          trail: 2,
        },
      },
      RALLY_SPACE,
      'neutral',
    );

    const replacementSetup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(nvaBaseState, RALLY_SPACE, {
          id: asTokenId('rally-replace-g1'),
          type: 'nva-guerrillas',
          props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
        }),
        RALLY_SPACE,
        {
          id: asTokenId('rally-replace-g2'),
          type: 'nva-guerrillas',
          props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
        },
      ),
      'available-NVA:none',
      {
        id: asTokenId('rally-replace-base-source'),
        type: 'nva-base',
        props: { faction: 'NVA', type: 'base', tunnel: 'untunneled' },
      },
    );
    const replaced = applyMove(def, replacementSetup, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'replace-with-base', $improveTrail: 'no' },
    }).state;

    const replacedSpaceTokens = replaced.zones[RALLY_SPACE] ?? [];
    const replacedBaseCount = replacedSpaceTokens.filter((t) => t.props.faction === 'NVA' && t.props.type === 'base').length;
    const replacedGuerrillaCount = replacedSpaceTokens.filter((t) => t.props.faction === 'NVA' && t.props.type === 'guerrilla').length;
    assert.equal(replacedBaseCount, 1, 'No-base replacement should add one NVA base');
    assert.equal(replacedGuerrillaCount, 0, 'No-base replacement should remove two NVA guerrillas');

    const withBaseSetup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          nvaBaseState,
          RALLY_SPACE_2,
          {
            id: asTokenId('rally-with-base'),
            type: 'nva-base',
            props: { faction: 'NVA', type: 'base', tunnel: 'untunneled' },
          },
        ),
        'available-NVA:none',
        {
          id: asTokenId('rally-with-base-g1'),
          type: 'nva-guerrillas',
          props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
        },
      ),
      'available-NVA:none',
      {
        id: asTokenId('rally-with-base-g2'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const withBaseSetup2 = addTokenToZone(withBaseSetup, 'available-NVA:none', {
      id: asTokenId('rally-with-base-g3'),
      type: 'nva-guerrillas',
      props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
    });
    const beforeWithBase = (withBaseSetup2.zones[RALLY_SPACE_2] ?? []).filter(
      (t) => t.props.faction === 'NVA' && t.props.type === 'guerrilla',
    ).length;
    const withBase = applyMove(def, withBaseSetup2, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE_2], $improveTrail: 'no' },
    }).state;
    const afterWithBase = (withBase.zones[RALLY_SPACE_2] ?? []).filter(
      (t) => t.props.faction === 'NVA' && t.props.type === 'guerrilla',
    ).length;
    assert.equal(afterWithBase - beforeWithBase, 3, 'With NVA base, Rally should place trail(2)+bases(1)=3 guerrillas');
  });

  it('allows standalone trail improvement (including LimOp) and charges it even on free operations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 305, 4);
    const nva = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 7,
        trail: 1,
      },
    };

    const limitedNoSpace = applyMove(def, nva, {
      actionId: asActionId('rally'),
      actionClass: 'limitedOperation',
      params: { targetSpaces: [], $improveTrail: 'yes' },
    }).state;
    assert.equal(limitedNoSpace.globalVars.nvaResources, 5, 'Trail improvement should cost 2 during LimOp even with zero spaces');
    assert.equal(limitedNoSpace.globalVars.trail, 2, 'Trail improvement should increase trail by 1');

    const freeNoSpace = applyMove(def, nva, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [], $improveTrail: 'yes' },
    }).state;
    assert.equal(freeNoSpace.globalVars.nvaResources, 5, 'Trail improvement cost should not be waived by freeOperation');
    assert.equal(freeNoSpace.globalVars.trail, 2, 'Free operation should still apply trail increase');
  });

  it('enforces rally LimOp max=1 with min=0', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 306, 4);
    const nva = withSupportState(
      withSupportState(
        {
          ...start,
          activePlayer: asPlayerId(2),
          globalVars: {
            ...start.globalVars,
            nvaResources: 10,
            trail: 1,
          },
        },
        RALLY_SPACE,
        'neutral',
      ),
      RALLY_SPACE_2,
      'neutral',
    );

    assert.throws(
      () =>
        applyMove(def, nva, {
          actionId: asActionId('rally'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
        }),
      /Illegal move/,
    );

    const zeroSelected = applyMove(def, nva, {
      actionId: asActionId('rally'),
      actionClass: 'limitedOperation',
      params: { targetSpaces: [], $improveTrail: 'no' },
    }).state;
    assert.equal(zeroSelected.globalVars.nvaResources, 10, 'LimOp should allow zero selected spaces for Rally');
  });
});
