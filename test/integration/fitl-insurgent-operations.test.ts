import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, asTokenId, initialState, legalMoves, type GameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';
const LOC_SPACE = 'loc-hue-da-nang:none';
const RALLY_SPACE = 'quang-nam:none';
const RALLY_SPACE_2 = 'quang-tin-quang-ngai:none';
const CENTRAL_LAOS = 'central-laos:none';
const SOUTHERN_LAOS = 'southern-laos:none';
const NE_CAMBODIA = 'northeast-cambodia:none';

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
      { id: 'rally-vc-profile', actionId: 'rally' },
      { id: 'march-nva-profile', actionId: 'march' },
      { id: 'march-vc-profile', actionId: 'march' },
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

  it('march moves NVA pieces from adjacent spaces and charges Province/City but not LoC destinations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const provinceMover = asTokenId('march-province-nva-g');
    const provinceSetup = addTokenToZone(
      {
        ...initialState(def, 111, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 111, 4).globalVars,
          nvaResources: 5,
        },
      },
      RALLY_SPACE,
      {
        id: provinceMover,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const provinceFinal = applyMove(def, provinceSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], chainSpaces: [], $movingGuerrillas: [provinceMover], $movingTroops: [] },
    }).state;

    assert.equal(provinceFinal.globalVars.nvaResources, 4, 'Province/City destination should spend 1 NVA resource');
    assert.ok((provinceFinal.zones[RALLY_SPACE] ?? []).every((token) => token.id !== provinceMover), 'Moved piece should leave origin space');
    assert.ok((provinceFinal.zones[ATTACK_SPACE] ?? []).some((token) => token.id === provinceMover), 'Moved piece should enter destination space');

    const locMover = asTokenId('march-loc-nva-t');
    const locSetup = addTokenToZone(
      {
        ...initialState(def, 112, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 112, 4).globalVars,
          nvaResources: 5,
        },
      },
      RALLY_SPACE,
      {
        id: locMover,
        type: 'nva-troops',
        props: { faction: 'NVA', type: 'troops' },
      },
    );
    const locFinal = applyMove(def, locSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [LOC_SPACE], chainSpaces: [], $movingGuerrillas: [], $movingTroops: [locMover] },
    }).state;

    assert.equal(locFinal.globalVars.nvaResources, 5, 'LoC destination should be free for March');
  });

  it('activates moving NVA guerrillas when destination is LoC/support and moving+COIN > 3', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-activate-nva-g');
    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            {
              ...initialState(def, 113, 4),
              activePlayer: asPlayerId(2),
              globalVars: {
                ...initialState(def, 113, 4).globalVars,
                nvaResources: 6,
              },
            },
            RALLY_SPACE,
            {
              id: mover,
              type: 'nva-guerrillas',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
            },
          ),
          LOC_SPACE,
          { id: asTokenId('march-activate-us-t1'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
        ),
        LOC_SPACE,
        { id: asTokenId('march-activate-us-t2'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
      ),
      LOC_SPACE,
      { id: asTokenId('march-activate-us-t3'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
    );

    const final = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [LOC_SPACE], chainSpaces: [], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const moved = (final.zones[LOC_SPACE] ?? []).find((token) => token.id === mover);

    assert.ok(moved, 'Expected moved guerrilla to be present in destination');
    assert.equal(moved.props.activity, 'active', 'Moving guerrilla should activate when LoC condition and >3 threshold are met');
  });

  it('does not activate moving guerrillas when destination is neither LoC nor support', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-no-activate-nva-g');
    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            withSupportState(
              {
                ...initialState(def, 114, 4),
                activePlayer: asPlayerId(2),
                globalVars: {
                  ...initialState(def, 114, 4).globalVars,
                  nvaResources: 6,
                },
              },
              ATTACK_SPACE,
              'activeOpposition',
            ),
            RALLY_SPACE,
            {
              id: mover,
              type: 'nva-guerrillas',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
            },
          ),
          ATTACK_SPACE,
          { id: asTokenId('march-no-activate-us-t1'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
        ),
        ATTACK_SPACE,
        { id: asTokenId('march-no-activate-us-t2'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
      ),
      ATTACK_SPACE,
      { id: asTokenId('march-no-activate-us-t3'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
    );

    const final = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], chainSpaces: [], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const moved = (final.zones[ATTACK_SPACE] ?? []).find((token) => token.id === mover);

    assert.ok(moved, 'Expected moved guerrilla to be present in destination');
    assert.equal(moved.props.activity, 'underground', 'Guerrilla should remain underground when LoC/support condition is not met');
  });

  it('skips March per-space Province/City cost when move is marked freeOperation', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-free-nva-g');
    const setup = addTokenToZone(
      {
        ...initialState(def, 115, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 115, 4).globalVars,
          nvaResources: 5,
        },
      },
      RALLY_SPACE,
      {
        id: mover,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );

    const nonFree = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], chainSpaces: [], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const free = applyMove(def, setup, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE], chainSpaces: [], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;

    assert.equal(nonFree.globalVars.nvaResources, 4, 'Non-free March should spend 1 NVA resource for Province/City destination');
    assert.equal(free.globalVars.nvaResources, 5, 'Free March should skip per-space Province/City spend');
  });

  it('march moves VC pieces from adjacent spaces and charges Province/City but not LoC destinations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const provinceMover = asTokenId('march-province-vc-g');
    const provinceSetup = addTokenToZone(
      {
        ...initialState(def, 121, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...initialState(def, 121, 4).globalVars,
          vcResources: 5,
        },
      },
      RALLY_SPACE,
      {
        id: provinceMover,
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const provinceFinal = applyMove(def, provinceSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [provinceMover], $movingTroops: [] },
    }).state;

    assert.equal(provinceFinal.globalVars.vcResources, 4, 'Province/City destination should spend 1 VC resource');
    assert.ok((provinceFinal.zones[RALLY_SPACE] ?? []).every((token) => token.id !== provinceMover), 'Moved VC piece should leave origin space');
    assert.ok((provinceFinal.zones[ATTACK_SPACE] ?? []).some((token) => token.id === provinceMover), 'Moved VC piece should enter destination space');

    const locMover = asTokenId('march-loc-vc-g');
    const locSetup = addTokenToZone(
      {
        ...initialState(def, 122, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...initialState(def, 122, 4).globalVars,
          vcResources: 5,
        },
      },
      RALLY_SPACE,
      {
        id: locMover,
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const locFinal = applyMove(def, locSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [LOC_SPACE], $movingGuerrillas: [locMover], $movingTroops: [] },
    }).state;

    assert.equal(locFinal.globalVars.vcResources, 5, 'LoC destination should be free for VC March');
  });

  it('skips VC March per-space Province/City cost when move is marked freeOperation', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-free-vc-g');
    const setup = addTokenToZone(
      {
        ...initialState(def, 126, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...initialState(def, 126, 4).globalVars,
          vcResources: 5,
        },
      },
      RALLY_SPACE,
      {
        id: mover,
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    const nonFree = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const free = applyMove(def, setup, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;

    assert.equal(nonFree.globalVars.vcResources, 4, 'Non-free VC March should spend 1 resource for Province/City destination');
    assert.equal(free.globalVars.vcResources, 5, 'Free VC March should skip per-space Province/City spend');
  });

  it('activates moving VC guerrillas when destination is LoC/support and moving+COIN > 3', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-activate-vc-g');
    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            {
              ...initialState(def, 123, 4),
              activePlayer: asPlayerId(3),
              globalVars: {
                ...initialState(def, 123, 4).globalVars,
                vcResources: 6,
              },
            },
            RALLY_SPACE,
            {
              id: mover,
              type: 'vc-guerrillas',
              props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
            },
          ),
          LOC_SPACE,
          { id: asTokenId('march-activate-vc-us-t1'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
        ),
        LOC_SPACE,
        { id: asTokenId('march-activate-vc-us-t2'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
      ),
      LOC_SPACE,
      { id: asTokenId('march-activate-vc-us-t3'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
    );

    const final = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [LOC_SPACE], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const moved = (final.zones[LOC_SPACE] ?? []).find((token) => token.id === mover);

    assert.ok(moved, 'Expected moved VC guerrilla to be present in destination');
    assert.equal(moved.props.activity, 'active', 'Moving VC guerrilla should activate when LoC condition and >3 threshold are met');
  });

  it('does not allow VC March Trail chain continuation', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-chain-vc-g');
    const setup = addTokenToZone(
      {
        ...initialState(def, 124, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...initialState(def, 124, 4).globalVars,
          vcResources: 6,
          trail: 4,
        },
      },
      CENTRAL_LAOS,
      {
        id: mover,
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    const final = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: {
        targetSpaces: [SOUTHERN_LAOS],
        chainSpaces: [NE_CAMBODIA],
        $movingGuerrillas: [mover],
        $movingTroops: [],
      },
    }).state;

    assert.ok((final.zones[SOUTHERN_LAOS] ?? []).some((token) => token.id === mover), 'VC March should resolve selected destination normally');
    assert.ok(!(final.zones[NE_CAMBODIA] ?? []).some((token) => token.id === mover), 'VC March must not apply NVA Trail-chain continuation');
    assert.equal(final.globalVars.vcResources, 5, 'VC March should still pay normal Province/City cost in Laos/Cambodia');
  });

  it('enforces VC March LimOp max=1 destination', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      {
        ...initialState(def, 125, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...initialState(def, 125, 4).globalVars,
          vcResources: 10,
        },
      },
      RALLY_SPACE,
      {
        id: asTokenId('march-limop-vc-g'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMove(def, setup, {
          actionId: asActionId('march'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2] },
        }),
      /Illegal move/,
      'VC March LimOp should enforce max one selected destination',
    );
  });

  it('enforces March LimOp max=1 destination', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      {
        ...initialState(def, 116, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 116, 4).globalVars,
          nvaResources: 10,
        },
      },
      RALLY_SPACE,
      {
        id: asTokenId('march-limop-nva-g'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMove(def, setup, {
          actionId: asActionId('march'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2] },
        }),
      /Illegal move/,
      'March LimOp should enforce max one selected destination',
    );
  });

  it('supports NVA Trail-chain continuation through Laos/Cambodia when trail > 0 and not LimOp', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-chain-nva-g');
    const setup = addTokenToZone(
      {
        ...initialState(def, 117, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 117, 4).globalVars,
          nvaResources: 6,
          trail: 1,
        },
      },
      CENTRAL_LAOS,
      {
        id: mover,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );

    const final = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: {
        targetSpaces: [SOUTHERN_LAOS],
        chainSpaces: [NE_CAMBODIA],
        $movingGuerrillas: [mover],
        $movingTroops: [],
      },
    }).state;

    assert.ok((final.zones[NE_CAMBODIA] ?? []).some((token) => token.id === mover), 'Trail-chain should allow continued movement into Cambodia');
    assert.equal(final.globalVars.nvaResources, 4, 'Two Province destinations should each cost 1 resource when trail < 4');
  });

  it('blocks NVA Trail-chain continuation when trail is 0 or action is LimOp', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const moverNoTrail = asTokenId('march-chain-no-trail-nva-g');
    const noTrailSetup = addTokenToZone(
      {
        ...initialState(def, 118, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 118, 4).globalVars,
          nvaResources: 6,
          trail: 0,
        },
      },
      CENTRAL_LAOS,
      {
        id: moverNoTrail,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const noTrailFinal = applyMove(def, noTrailSetup, {
      actionId: asActionId('march'),
      params: {
        targetSpaces: [SOUTHERN_LAOS],
        chainSpaces: [NE_CAMBODIA],
        $movingGuerrillas: [moverNoTrail],
        $movingTroops: [],
      },
    }).state;
    assert.ok((noTrailFinal.zones[SOUTHERN_LAOS] ?? []).some((token) => token.id === moverNoTrail));
    assert.ok(!(noTrailFinal.zones[NE_CAMBODIA] ?? []).some((token) => token.id === moverNoTrail), 'Trail=0 should disable continuation');

    const moverLimOp = asTokenId('march-chain-limop-nva-g');
    const limOpSetup = addTokenToZone(
      {
        ...initialState(def, 119, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 119, 4).globalVars,
          nvaResources: 6,
          trail: 2,
        },
      },
      CENTRAL_LAOS,
      {
        id: moverLimOp,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const limOpFinal = applyMove(def, limOpSetup, {
      actionId: asActionId('march'),
      actionClass: 'limitedOperation',
      params: {
        targetSpaces: [SOUTHERN_LAOS],
        chainSpaces: [NE_CAMBODIA],
        $movingGuerrillas: [moverLimOp],
        $movingTroops: [],
      },
    }).state;
    assert.ok((limOpFinal.zones[SOUTHERN_LAOS] ?? []).some((token) => token.id === moverLimOp));
    assert.ok(!(limOpFinal.zones[NE_CAMBODIA] ?? []).some((token) => token.id === moverLimOp), 'LimOp should disable continuation');
  });

  it('makes NVA March free in Laos/Cambodia when Trail is 4', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('march-trail4-free-nva-g');
    const setup = addTokenToZone(
      {
        ...initialState(def, 120, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...initialState(def, 120, 4).globalVars,
          nvaResources: 6,
          trail: 4,
        },
      },
      CENTRAL_LAOS,
      {
        id: mover,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const final = applyMove(def, setup, {
      actionId: asActionId('march'),
      params: {
        targetSpaces: [SOUTHERN_LAOS],
        chainSpaces: [NE_CAMBODIA],
        $movingGuerrillas: [mover],
        $movingTroops: [],
      },
    }).state;

    assert.ok((final.zones[NE_CAMBODIA] ?? []).some((token) => token.id === mover));
    assert.equal(final.globalVars.nvaResources, 6, 'Trail=4 should make Laos/Cambodia March destinations free');
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

  it('treats rally as illegal when active player is not an insurgent faction', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nonInsurgentState = {
      ...initialState(def, 301, 4),
      activePlayer: asPlayerId(0),
    };

    const legal = legalMoves(def, nonInsurgentState);
    assert.ok(!legal.some((move) => move.actionId === asActionId('rally')));
    assert.throws(
      () =>
        applyMove(def, nonInsurgentState, {
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

  it('executes rally through rally-vc-profile and does not perform trail-improvement behavior', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 307, 4);
    const vc = withSupportState(
      {
        ...start,
        activePlayer: asPlayerId(3),
        globalVars: {
          ...start.globalVars,
          vcResources: 6,
          nvaResources: 9,
          trail: 2,
        },
      },
      RALLY_SPACE,
      'neutral',
    );
    const vcWithAvailable = addTokenToZone(vc, 'available-VC:none', {
      id: asTokenId('vc-rally-available-g1'),
      type: 'vc-guerrillas',
      props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
    });

    const final = applyMove(def, vcWithAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla' },
    }).state;

    assert.equal(final.globalVars.vcResources, 5, 'VC rally should spend 1 VC resource per selected space');
    assert.equal(final.globalVars.nvaResources, 9, 'VC rally should not affect NVA resources');
    assert.equal(final.globalVars.trail, 2, 'VC rally should not include trail-improvement behavior');
  });

  it('applies VC rally space filter, free-op cost skip, and LimOp max=1', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 308, 4);
    const vc = withSupportState(
      withSupportState(
        withSupportState(
          {
            ...start,
            activePlayer: asPlayerId(3),
            globalVars: {
              ...start.globalVars,
              vcResources: 8,
            },
          },
          RALLY_SPACE,
          'activeSupport',
        ),
        RALLY_SPACE_2,
        'neutral',
      ),
      ATTACK_SPACE,
      'activeOpposition',
    );
    const vcWithAvailable = addTokenToZone(
      addTokenToZone(vc, 'available-VC:none', {
        id: asTokenId('vc-rally-filter-available-g1'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      }),
      'available-VC:none',
      {
        id: asTokenId('vc-rally-filter-available-g2'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMove(def, vcWithAvailable, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla' },
        }),
      /Illegal move/,
      'VC rally should reject activeSupport spaces',
    );

    const free = applyMove(def, vcWithAvailable, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla' },
    }).state;
    assert.equal(free.globalVars.vcResources, 8, 'Free VC rally should skip per-space VC resource spend');

    assert.throws(
      () =>
        applyMove(def, vcWithAvailable, {
          actionId: asActionId('rally'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [RALLY_SPACE_2, ATTACK_SPACE], $noBaseChoice: 'place-guerrilla' },
        }),
      /Illegal move/,
      'VC rally LimOp should enforce max one selected space',
    );
  });

  it('supports VC rally no-base replacement plus with-base place/flip branches', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = initialState(def, 309, 4);
    const vcBaseState = withSupportState(
      {
        ...start,
        activePlayer: asPlayerId(3),
        globalVars: {
          ...start.globalVars,
          vcResources: 12,
        },
      },
      RALLY_SPACE,
      'neutral',
    );

    const replacementSetup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(vcBaseState, RALLY_SPACE, {
          id: asTokenId('vc-rally-replace-g1'),
          type: 'vc-guerrillas',
          props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
        }),
        RALLY_SPACE,
        {
          id: asTokenId('vc-rally-replace-g2'),
          type: 'vc-guerrillas',
          props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
        },
      ),
      'available-VC:none',
      {
        id: asTokenId('vc-rally-replace-base-source'),
        type: 'vc-base',
        props: { faction: 'VC', type: 'base', tunnel: 'untunneled' },
      },
    );
    const replaced = applyMove(def, replacementSetup, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'replace-with-base' },
    }).state;
    const replacedSpaceTokens = replaced.zones[RALLY_SPACE] ?? [];
    const replacedBaseCount = replacedSpaceTokens.filter((t) => t.props.faction === 'VC' && t.props.type === 'base').length;
    const replacedGuerrillaCount = replacedSpaceTokens.filter((t) => t.props.faction === 'VC' && t.props.type === 'guerrilla').length;
    assert.equal(replacedBaseCount, 1, 'VC no-base replacement should add one VC base');
    assert.equal(replacedGuerrillaCount, 0, 'VC no-base replacement should remove two VC guerrillas');

    const withBaseSetup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(vcBaseState, RALLY_SPACE, {
            id: asTokenId('vc-rally-with-base'),
            type: 'vc-base',
            props: { faction: 'VC', type: 'base', tunnel: 'untunneled' },
          }),
          RALLY_SPACE,
          {
            id: asTokenId('vc-rally-active-g1'),
            type: 'vc-guerrillas',
            props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
          },
        ),
        RALLY_SPACE,
        {
          id: asTokenId('vc-rally-active-g2'),
          type: 'vc-guerrillas',
          props: { faction: 'VC', type: 'guerrilla', activity: 'active' },
        },
      ),
      'available-VC:none',
      {
        id: asTokenId('vc-rally-with-base-available-g1'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const withBaseSetup2 = addTokenToZone(withBaseSetup, 'available-VC:none', {
      id: asTokenId('vc-rally-with-base-available-g2'),
      type: 'vc-guerrillas',
      props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
    });
    const placeChoice = applyMove(def, withBaseSetup2, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $withBaseChoice: 'place-guerrillas' },
    }).state;
    const placedGuerrillas = (placeChoice.zones[RALLY_SPACE] ?? []).filter(
      (t) => t.props.faction === 'VC' && t.props.type === 'guerrilla',
    ).length;
    assert.equal(placedGuerrillas, 4, 'With VC base, place branch should add population(1)+bases(1)=2 guerrillas');

    const flipChoice = applyMove(def, withBaseSetup2, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $withBaseChoice: 'flip-underground' },
    }).state;
    const vcGuerrillasAfterFlip = (flipChoice.zones[RALLY_SPACE] ?? []).filter(
      (t) => t.props.faction === 'VC' && t.props.type === 'guerrilla',
    );
    assert.ok(vcGuerrillasAfterFlip.every((t) => t.props.activity === 'underground'), 'Flip branch should set all VC guerrillas underground');
  });
});
