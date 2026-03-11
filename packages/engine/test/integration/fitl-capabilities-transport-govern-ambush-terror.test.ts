import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();

/* eslint-disable @typescript-eslint/no-explicit-any */

type MarkerState = 'inactive' | 'unshaded' | 'shaded';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...extra },
});

const withMarker = (state: GameState, marker: string, value: MarkerState): GameState => ({
  ...state,
  globalMarkers: {
    ...state.globalMarkers,
    [marker]: value,
  },
});

const addTokenToZone = (state: GameState, zone: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zone]: [...(state.zones[zone] ?? []), token],
  },
});

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter(predicate).length;

const operationInitialState = (def: GameDef, seed: number, playerCount: number): GameState => ({
  ...initialState(def, seed, playerCount).state,
  turnOrderState: { type: 'roundRobin' },
});

function getParsedProfile(profileId: string): any {
  const { parsed } = FITL_PRODUCTION_FIXTURE;
  const profile = parsed.doc.actionPipelines?.find((candidate: { id: string }) => candidate.id === profileId);
  assert.ok(profile, `Expected ${profileId}`);
  return profile;
}

function collectReferencedMacros(profile: any, macrosById: Map<string, any>): any[] {
  const seen = new Set<string>();
  const queue: string[] = findDeep(profile.stages ?? [], (node: any) => typeof node?.macro === 'string').map((node: any) => node.macro);
  const defs: any[] = [];

  while (queue.length > 0) {
    const macroId = queue.shift()!;
    if (seen.has(macroId)) continue;
    seen.add(macroId);

    const def = macrosById.get(macroId);
    if (def === undefined) continue;
    defs.push(def);

    const nestedRefs = findDeep(def.effects ?? [], (node: any) => typeof node?.macro === 'string').map((node: any) => node.macro);
    queue.push(...nestedRefs);
  }

  return defs;
}

function collectMarkerSides(profileId: string, marker: string): Set<'unshaded' | 'shaded'> {
  const { parsed } = FITL_PRODUCTION_FIXTURE;
  const profile = getParsedProfile(profileId);
  const macrosById = new Map((parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]));
  const macroDefs = collectReferencedMacros(profile, macrosById);

  const sideValues = new Set<'unshaded' | 'shaded'>();
  const searchRoots = [profile.stages ?? [], ...macroDefs.map((macro) => macro.effects ?? [])];
  for (const root of searchRoots) {
    const checks = findDeep(root, (node: any) =>
      node?.if?.when !== undefined &&
      JSON.stringify(node.if.when).includes('"ref":"globalMarkerState"') &&
      JSON.stringify(node.if.when).includes(`"marker":"${marker}"`),
    );
    for (const check of checks) {
      const text = JSON.stringify(check.if.when);
      if (text.includes('"unshaded"')) sideValues.add('unshaded');
      if (text.includes('"shaded"')) sideValues.add('shaded');
    }
  }

  return sideValues;
}

describe('FITL capability branches (Transport/Govern/Ambush/Terror)', () => {
  it('compiles production spec with expected side-specific checks for ticketed branches', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const checks: Array<{ profileId: string; marker: string; expectedSide: 'unshaded' | 'shaded'; forbiddenSide?: 'unshaded' | 'shaded' }> = [
      { profileId: 'transport-profile', marker: 'cap_armoredCavalry', expectedSide: 'unshaded' },
      { profileId: 'transport-profile', marker: 'cap_armoredCavalry', expectedSide: 'shaded' },
      { profileId: 'govern-profile', marker: 'cap_mandateOfHeaven', expectedSide: 'unshaded' },
      { profileId: 'govern-profile', marker: 'cap_mandateOfHeaven', expectedSide: 'shaded' },
      { profileId: 'nva-ambush-profile', marker: 'cap_boobyTraps', expectedSide: 'unshaded', forbiddenSide: 'shaded' },
      { profileId: 'vc-ambush-profile', marker: 'cap_boobyTraps', expectedSide: 'unshaded', forbiddenSide: 'shaded' },
      { profileId: 'vc-ambush-profile', marker: 'cap_mainForceBns', expectedSide: 'shaded', forbiddenSide: 'unshaded' },
      { profileId: 'terror-vc-profile', marker: 'cap_cadres', expectedSide: 'unshaded', forbiddenSide: 'shaded' },
    ];

    for (const check of checks) {
      const sides = collectMarkerSides(check.profileId, check.marker);
      assert.ok(
        sides.has(check.expectedSide),
        `Expected ${check.profileId} to check ${check.marker}=${check.expectedSide}; found sides: ${[...sides].join(', ') || '(none)'}`,
      );
      if (check.forbiddenSide !== undefined) {
        assert.equal(
          sides.has(check.forbiddenSide),
          false,
          `Did not expect ${check.profileId} to check ${check.marker}=${check.forbiddenSide}`,
        );
      }
    }
  });

  it('defines Transport Ranger flip as unconditional and map-wide', () => {
    const profile = getParsedProfile('transport-profile');
    const flipStage = (profile.stages ?? []).find((stage: any) => stage.stage === 'flip-rangers-underground');
    assert.ok(flipStage, 'Expected Transport flip-rangers-underground stage');

    const markerChecksInFlipStage = findDeep(flipStage.effects ?? [], (node: any) =>
      node?.if?.when !== undefined &&
      JSON.stringify(node.if.when).includes('"ref":"globalMarkerState"') &&
      JSON.stringify(node.if.when).includes('"marker":"cap_armoredCavalry"'),
    );
    assert.equal(markerChecksInFlipStage.length, 0, 'Ranger flip must not be gated by cap_armoredCavalry side');

    const mapSpaceLoops = findDeep(flipStage.effects ?? [], (node: any) => node?.forEach?.over?.query === 'mapSpaces');
    assert.ok(mapSpaceLoops.length > 0, 'Ranger flip should iterate across mapSpaces');
  });

  it('moves ARVN Troops normally, restricts shaded Transport to Rangers only, and flips Rangers map-wide', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const origin = 'da-nang:none';
    const destination = 'loc-hue-da-nang:none';
    const remote = 'tay-ninh:none';

    const run = (marker: MarkerState, seed: number): GameState => {
      const start = { ...withMarker(initialState(def, seed, 4).state, 'cap_armoredCavalry', marker), activePlayer: asPlayerId(1) };
      const setup = addTokenToZone(
        addTokenToZone(start, origin, makeToken(`transport-${marker}-troop`, 'troops', 'ARVN', { type: 'troops' })),
        origin,
        makeToken(`transport-${marker}-ranger`, 'ranger', 'ARVN', { type: 'ranger', activity: 'active' }),
      );
      const setupWithRemoteRanger = addTokenToZone(
        setup,
        remote,
        makeToken(`transport-${marker}-remote-ranger`, 'ranger', 'ARVN', { type: 'ranger', activity: 'active' }),
      );
      return applyMoveWithResolvedDecisionIds(def, setupWithRemoteRanger, {
        actionId: asActionId('transport'),
        params: {
          $transportOrigin: origin,
          $transportDestination: destination,
        },
      }).state;
    };

    const inactive = run('inactive', 7001);
    const unshaded = run('unshaded', 7002);
    const shaded = run('shaded', 7003);

    for (const state of [inactive, unshaded]) {
      assert.equal(
        countTokens(state, destination, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
        1,
      );
      assert.equal(
        countTokens(state, destination, (token) => token.props.faction === 'ARVN' && token.type === 'ranger'),
        1,
      );
    }

    assert.equal(
      countTokens(shaded, destination, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
      'Shaded cap_armoredCavalry should prevent ARVN Troops from moving by Transport',
    );
    assert.equal(
      countTokens(shaded, destination, (token) => token.props.faction === 'ARVN' && token.type === 'ranger'),
      1,
    );
    assert.equal(
      countTokens(shaded, origin, (token) => token.id === asTokenId('transport-shaded-troop')),
      1,
      'Shaded cap_armoredCavalry should leave ARVN Troops at the origin',
    );
    const inactiveRanger = (inactive.zones[destination] ?? []).find((token) => token.id === asTokenId('transport-inactive-ranger'));
    const unshadedRanger = (unshaded.zones[destination] ?? []).find((token) => token.id === asTokenId('transport-unshaded-ranger'));
    const movedRanger = (shaded.zones[destination] ?? []).find((token) => token.id === asTokenId('transport-shaded-ranger'));
    const inactiveRemoteRanger = (inactive.zones[remote] ?? []).find((token) => token.id === asTokenId('transport-inactive-remote-ranger'));
    const unshadedRemoteRanger = (unshaded.zones[remote] ?? []).find((token) => token.id === asTokenId('transport-unshaded-remote-ranger'));
    const shadedRemoteRanger = (shaded.zones[remote] ?? []).find((token) => token.id === asTokenId('transport-shaded-remote-ranger'));
    assert.equal(inactiveRanger?.props.activity, 'underground', 'Inactive cap_armoredCavalry should still flip moved Rangers');
    assert.equal(unshadedRanger?.props.activity, 'underground', 'Unshaded cap_armoredCavalry should still flip moved Rangers');
    assert.equal(movedRanger?.props.activity, 'underground', 'Shaded cap_armoredCavalry should flip moved Rangers');
    assert.equal(inactiveRemoteRanger?.props.activity, 'underground', 'Inactive cap_armoredCavalry should flip remote Rangers');
    assert.equal(unshadedRemoteRanger?.props.activity, 'underground', 'Unshaded cap_armoredCavalry should flip remote Rangers');
    assert.equal(shadedRemoteRanger?.props.activity, 'underground', 'Shaded cap_armoredCavalry should flip remote Rangers');
  });

  it('grants unshaded Armored Cavalry a free ARVN Assault in the Transport destination after movement', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const origin = 'da-nang:none';
    const destination = 'loc-hue-da-nang:none';
    const start = withMarker(initialState(def, 7101, 4).state, 'cap_armoredCavalry', 'unshaded');
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...start.globalVars,
        arvnResources: 0,
        aid: 0,
      },
      zones: {
        ...start.zones,
        [origin]: [
          makeToken('armored-unshaded-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('armored-unshaded-t2', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [destination]: [
          makeToken('armored-unshaded-vc-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('armored-unshaded-vc-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: destination,
        $armoredCavalryFreeAssault: 1,
      },
    }).state;

    assert.equal(
      countTokens(final, destination, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Unshaded Armored Cavalry should complete the Transport movement before the free Assault resolves',
    );
    assert.equal(
      countTokens(final, destination, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      0,
      'Two transported ARVN Troops should generate one free Assault removal in the destination',
    );
    assert.equal(
      countTokens(final, destination, (token) => token.props.faction === 'VC' && token.type === 'base'),
      1,
      'The free Assault should still respect base-last removal order',
    );
    assert.equal(final.globalVars.arvnResources, 0, 'Armored Cavalry free Assault should not spend ARVN Resources');
  });

  it('allows declining the unshaded Armored Cavalry free Assault and preserves shaded destinations from free removals', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const origin = 'da-nang:none';
    const destination = 'loc-hue-da-nang:none';

    const unshadedStart = withMarker(initialState(def, 7102, 4).state, 'cap_armoredCavalry', 'unshaded');
    const shadedStart = withMarker(initialState(def, 7103, 4).state, 'cap_armoredCavalry', 'shaded');

    const configure = (state: GameState, marker: MarkerState): GameState => ({
      ...state,
      activePlayer: asPlayerId(1),
      zones: {
        ...state.zones,
        [origin]: [
          makeToken(`armored-${marker}-t1`, 'troops', 'ARVN', { type: 'troops' }),
          makeToken(`armored-${marker}-r1`, 'ranger', 'ARVN', { type: 'ranger', activity: 'active' }),
        ],
        [destination]: [
          makeToken(`armored-${marker}-enemy`, 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    });

    const declined = applyMoveWithResolvedDecisionIds(def, configure(unshadedStart, 'unshaded'), {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: destination,
        $armoredCavalryFreeAssault: 0,
      },
    }).state;

    const shaded = applyMoveWithResolvedDecisionIds(def, configure(shadedStart, 'shaded'), {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: destination,
      },
    }).state;

    assert.equal(
      countTokens(declined, destination, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'Declining the optional Armored Cavalry free Assault should leave insurgents in place',
    );
    assert.equal(
      countTokens(shaded, destination, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'Shaded Armored Cavalry should not grant any free Assault removal',
    );
  });

  it('uses the ARVN Highland Assault formula for unshaded Armored Cavalry follow-up assaults', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const origin = 'qui-nhon:none';
    const destination = 'pleiku-darlac:none';
    const start = withMarker(initialState(def, 7104, 4).state, 'cap_armoredCavalry', 'unshaded');
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      zones: {
        ...start.zones,
        [origin]: [
          makeToken('armored-highland-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('armored-highland-t2', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [destination]: [
          makeToken('armored-highland-enemy', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: destination,
        $armoredCavalryFreeAssault: 1,
      },
    }).state;

    assert.equal(
      countTokens(final, destination, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla'),
      1,
      'Highland Armored Cavalry follow-up Assault should use the ARVN 3-cubes-per-removal formula',
    );
  });

  it('applies cap_mandateOfHeaven shaded max-1 Govern selection and unshaded one-space no-shift override', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const spaceA = 'qui-nhon:none';
    const spaceB = 'can-tho:none';

    const base = (marker: MarkerState, seed: number): GameState => {
      const start = withMarker({ ...initialState(def, seed, 4).state, activePlayer: asPlayerId(1) }, 'cap_mandateOfHeaven', marker);
      const withSpaceA = addTokenToZone(
        addTokenToZone(
          addTokenToZone(start, spaceA, makeToken(`govern-${marker}-a-arvn-t`, 'troops', 'ARVN', { type: 'troops' })),
          spaceA,
          makeToken(`govern-${marker}-a-arvn-p`, 'police', 'ARVN', { type: 'police' }),
        ),
        spaceA,
        makeToken(`govern-${marker}-a-us-t`, 'troops', 'US', { type: 'troops' }),
      );
      const withPatronage = addTokenToZone(
        addTokenToZone(
          addTokenToZone(withSpaceA, spaceB, makeToken(`govern-${marker}-b-arvn-t`, 'troops', 'ARVN', { type: 'troops' })),
          spaceB,
          makeToken(`govern-${marker}-b-arvn-p`, 'police', 'ARVN', { type: 'police' }),
        ),
        spaceB,
        makeToken(`govern-${marker}-b-us-t`, 'troops', 'US', { type: 'troops' }),
      );
      return {
        ...withPatronage,
        globalVars: {
          ...withPatronage.globalVars,
          aid: 20,
          patronage: 10,
        },
        markers: {
          ...withPatronage.markers,
          [spaceA]: {
            ...(withPatronage.markers[spaceA] ?? {}),
            supportOpposition: 'activeSupport',
          },
          [spaceB]: {
            ...(withPatronage.markers[spaceB] ?? {}),
            supportOpposition: 'activeSupport',
          },
        },
      };
    };

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, base('shaded', 7101), {
          actionId: asActionId('govern'),
          params: {
            $targetSpaces: [spaceA, spaceB],
            [`$governMode@${spaceA}`]: 'patronage',
            [`$governMode@${spaceB}`]: 'patronage',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'cap_mandateOfHeaven shaded should restrict Govern to max 1 space',
    );

    const inactive = applyMoveWithResolvedDecisionIds(def, base('inactive', 7102), {
      actionId: asActionId('govern'),
      params: {
        $targetSpaces: [spaceA, spaceB],
        [`$governMode@${spaceA}`]: 'patronage',
        [`$governMode@${spaceB}`]: 'patronage',
      },
    }).state;
    assert.equal(inactive.markers[spaceA]?.supportOpposition, 'passiveSupport', 'Inactive cap should shift first patronage space');
    assert.equal(inactive.markers[spaceB]?.supportOpposition, 'passiveSupport', 'Inactive cap should shift second patronage space');

    const unshaded = applyMoveWithResolvedDecisionIds(def, base('unshaded', 7103), {
      actionId: asActionId('govern'),
      params: {
        $targetSpaces: [spaceA, spaceB],
        $mandateNoShiftSpace: spaceA,
        [`$governMode@${spaceA}`]: 'patronage',
        [`$governMode@${spaceB}`]: 'patronage',
      },
    }).state;
    assert.equal(
      [spaceA, spaceB].filter((space) => unshaded.markers[space]?.supportOpposition === 'activeSupport').length,
      1,
      'cap_mandateOfHeaven unshaded should suppress support shift in exactly one governed space',
    );
  });

  it('applies cap_boobyTraps unshaded Ambush max-1-space limit (inactive/shaded preserve max-2)', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const spaceA = 'quang-tri-thua-thien:none';
    const spaceB = 'quang-nam:none';

    const run = (marker: MarkerState, seed: number): void => {
      const start = withMarker(
        {
          ...operationInitialState(def, seed, 4),
          activePlayer: asPlayerId(2),
        },
        'cap_boobyTraps',
        marker,
      );
      const setup = addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            addTokenToZone(start, spaceA, makeToken(`ambush-${marker}-nva-a`, 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' })),
            spaceA,
            makeToken(`ambush-${marker}-us-a`, 'troops', 'US', { type: 'troops' }),
          ),
          spaceB,
          makeToken(`ambush-${marker}-nva-b`, 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
        ),
        spaceB,
        makeToken(`ambush-${marker}-us-b`, 'troops', 'US', { type: 'troops' }),
      );

      applyMoveWithResolvedDecisionIds(def, setup, {
        actionId: asActionId('ambushNva'),
        params: {
          $targetSpaces: [spaceA, spaceB],
          [`$ambushTargetMode@${spaceA}`]: 'self',
          [`$ambushTargetMode@${spaceB}`]: 'self',
        },
      });
    };

    run('inactive', 7201);
    run('shaded', 7202);
    assert.throws(
      () => run('unshaded', 7203),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'cap_boobyTraps unshaded should cap Ambush to max 1 selected space',
    );
  });

  it('applies cap_mainForceBns shaded VC Ambush double removal (inactive/unshaded remain single)', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'quang-nam:none';

    const run = (marker: MarkerState, seed: number): GameState => {
      const start = withMarker(
        {
          ...operationInitialState(def, seed, 4),
          activePlayer: asPlayerId(3),
        },
        'cap_mainForceBns',
        marker,
      );
      const setup = addTokenToZone(
        addTokenToZone(
          addTokenToZone(start, space, makeToken(`vc-ambush-${marker}-g`, 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })),
          space,
          makeToken(`vc-ambush-${marker}-us1`, 'troops', 'US', { type: 'troops' }),
        ),
        space,
        makeToken(`vc-ambush-${marker}-us2`, 'troops', 'US', { type: 'troops' }),
      );

      return applyMoveWithResolvedDecisionIds(def, setup, {
        actionId: asActionId('ambushVc'),
        params: {
          $targetSpaces: [space],
          [`$ambushTargetMode@${space}`]: 'self',
        },
      }).state;
    };

    const inactive = run('inactive', 7301);
    const unshaded = run('unshaded', 7302);
    const shaded = run('shaded', 7303);

    assert.equal((inactive.zones['casualties-US:none'] ?? []).length, 1);
    assert.equal((unshaded.zones['casualties-US:none'] ?? []).length, 1);
    assert.equal((shaded.zones['casualties-US:none'] ?? []).length, 2, 'cap_mainForceBns shaded should remove 2 COIN pieces in VC Ambush');
  });

  it('applies cap_cadres unshaded VC Terror guerrilla-cost reduction by suppressing activation', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'quang-nam:none';

    const run = (marker: MarkerState, seed: number): GameState => {
      const start = withMarker(
        {
          ...operationInitialState(def, seed, 4),
          activePlayer: asPlayerId(3),
        },
        'cap_cadres',
        marker,
      );
      const setup = {
        ...addTokenToZone(start, space, makeToken(`terror-${marker}-vc-g`, 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })),
        globalVars: {
          ...start.globalVars,
          vcResources: 5,
        },
      };

      return applyMoveWithResolvedDecisionIds(def, setup, {
        actionId: asActionId('terror'),
        params: {
          $targetSpaces: [space],
        },
      }).state;
    };

    const inactive = run('inactive', 7401);
    const unshaded = run('unshaded', 7402);
    const shaded = run('shaded', 7403);

    const inactiveToken = (inactive.zones[space] ?? []).find((token) => token.id === asTokenId('terror-inactive-vc-g'));
    const unshadedToken = (unshaded.zones[space] ?? []).find((token) => token.id === asTokenId('terror-unshaded-vc-g'));
    const shadedToken = (shaded.zones[space] ?? []).find((token) => token.id === asTokenId('terror-shaded-vc-g'));

    assert.equal(inactiveToken?.props.activity, 'active');
    assert.equal(shadedToken?.props.activity, 'active');
    assert.equal(unshadedToken?.props.activity, 'underground', 'cap_cadres unshaded should reduce VC Terror guerrilla activation cost to 0 in current model');
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
