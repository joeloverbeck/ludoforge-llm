import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, legalMoves, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const ATTACK_SPACE = 'quang-tri-thua-thien:none';
const LOC_SPACE = 'loc-hue-da-nang:none';
const RALLY_SPACE = 'quang-nam:none';
const RALLY_SPACE_2 = 'quang-tin-quang-ngai:none';
const RALLY_SPACE_3 = 'hue:none';
const RALLY_SPACE_4 = 'kontum:none';
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

const operationInitialState = (def: GameDef, seed: number, playerCount: number): GameState =>
  makeIsolatedInitialState(def, seed, playerCount, { turnOrderMode: 'roundRobin' });

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseProfile = (id: string): any => {
    const { parsed } = compileProductionSpec();
    const profile = parsed.doc.actionPipelines?.find((p: { id: string }) => p.id === id);
    assert.ok(profile, `${id} must exist in parsed doc`);
    return profile;
  };

  it('compiles insurgent Rally/March/Attack/Terror operation profiles from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assertNoErrors(compiled);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileMap = profiles.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) }));
    for (const expected of [
      { id: 'rally-nva-profile', actionId: 'rally' },
      { id: 'rally-vc-profile', actionId: 'rally' },
      { id: 'march-nva-profile', actionId: 'march' },
      { id: 'march-vc-profile', actionId: 'march' },
      { id: 'attack-nva-profile', actionId: 'attack' },
      { id: 'attack-vc-profile', actionId: 'attack' },
      { id: 'terror-nva-profile', actionId: 'terror' },
      { id: 'terror-vc-profile', actionId: 'terror' },
    ]) {
      assert.ok(
        profileMap.some((p) => p.id === expected.id && p.actionId === expected.actionId),
        `Expected profile ${expected.id} with actionId ${expected.actionId}`,
      );
    }
  });

  it('uses shared march macros in both NVA and VC march profiles', () => {
    for (const expected of [
      { id: 'march-nva-profile', faction: 'NVA', resourceVar: 'nvaResources', allowTrailCountryFreeCost: true },
      { id: 'march-vc-profile', faction: 'VC', resourceVar: 'vcResources', allowTrailCountryFreeCost: false },
    ]) {
      const profile = parseProfile(expected.id);
      const selectDestinations = profile.stages.find((stage: { stage: string }) => stage.stage === 'select-destinations');
      const resolveDestination = profile.stages.find((stage: { stage: string }) => stage.stage === 'resolve-per-destination');
      assert.ok(selectDestinations, `${expected.id} should include select-destinations stage`);
      assert.ok(resolveDestination, `${expected.id} should include resolve-per-destination stage`);

      const selectMacroCalls = findDeep(selectDestinations.effects, (node) =>
        node?.macro === 'insurgent-march-select-destinations' &&
        node?.args?.faction === expected.faction &&
        node?.args?.resourceVar === expected.resourceVar,
      );
      assert.ok(selectMacroCalls.length >= 1, `${expected.id} should call insurgent-march-select-destinations macro`);

      const resolveMacroCalls = findDeep(resolveDestination.effects, (node) =>
        node?.macro === 'insurgent-march-resolve-destination' &&
        node?.args?.faction === expected.faction &&
        node?.args?.resourceVar === expected.resourceVar &&
        node?.args?.allowTrailCountryFreeCost === expected.allowTrailCountryFreeCost,
      );
      assert.ok(resolveMacroCalls.length >= 1, `${expected.id} should call insurgent-march-resolve-destination macro`);
    }
  });

  it('uses shared attack selector/removal macros in both NVA and VC attack profiles', () => {
    for (const expected of [
      { id: 'attack-nva-profile', faction: 'NVA', resourceVar: 'nvaResources' },
      { id: 'attack-vc-profile', faction: 'VC', resourceVar: 'vcResources' },
    ]) {
      const profile = parseProfile(expected.id);
      const selectSpaces = profile.stages.find((stage: { stage: string }) => stage.stage === 'select-spaces');
      const resolvePerSpace = profile.stages.find((stage: { stage: string }) => stage.stage === 'resolve-per-space');
      assert.ok(selectSpaces, `${expected.id} should include select-spaces stage`);
      assert.ok(resolvePerSpace, `${expected.id} should include resolve-per-space stage`);

      const selectorMacros = findDeep(selectSpaces.effects, (node) =>
        node?.macro === 'insurgent-attack-select-spaces' &&
        node?.args?.faction === expected.faction &&
        node?.args?.resourceVar === expected.resourceVar,
      );
      assert.ok(selectorMacros.length >= 1, `${expected.id} should call insurgent-attack-select-spaces macro`);

      const inlineSelectorBlocks = findDeep(selectSpaces.effects, (node) =>
        node?.chooseN?.bind === 'targetSpaces' && node?.chooseN?.options?.query === 'mapSpaces',
      );
      assert.equal(inlineSelectorBlocks.length, 0, `${expected.id} should not inline duplicate map-space selector blocks`);

      const removalMacros = findDeep(resolvePerSpace.effects, (node) =>
        node?.macro === 'insurgent-attack-removal-order' && node?.args?.attackerFaction === expected.faction,
      );
      assert.ok(removalMacros.length >= 1, `${expected.id} should call insurgent-attack-removal-order macro`);
    }
  });

  it('uses shared terror selector/resolution macros in both NVA and VC terror profiles', () => {
    for (const expected of [
      { id: 'terror-nva-profile', faction: 'NVA', resourceVar: 'nvaResources', includeTroops: true, shiftFromSupportOnly: true },
      { id: 'terror-vc-profile', faction: 'VC', resourceVar: 'vcResources', includeTroops: false, shiftFromSupportOnly: false },
    ]) {
      const profile = parseProfile(expected.id);
      const selectSpaces = profile.stages.find((stage: { stage: string }) => stage.stage === 'select-spaces');
      const resolvePerSpace = profile.stages.find((stage: { stage: string }) => stage.stage === 'resolve-per-space');
      assert.ok(selectSpaces, `${expected.id} should include select-spaces stage`);
      assert.ok(resolvePerSpace, `${expected.id} should include resolve-per-space stage`);

      const selectorMacros = findDeep(selectSpaces.effects, (node) =>
        node?.macro === 'insurgent-terror-select-spaces' &&
        node?.args?.faction === expected.faction &&
        node?.args?.includeTroops === expected.includeTroops &&
        node?.args?.resourceVar === expected.resourceVar,
      );
      assert.ok(selectorMacros.length >= 1, `${expected.id} should call insurgent-terror-select-spaces macro`);

      const inlineSelectorBlocks = findDeep(selectSpaces.effects, (node) =>
        node?.chooseN?.bind === 'targetSpaces' && node?.chooseN?.options?.query === 'mapSpaces',
      );
      assert.equal(inlineSelectorBlocks.length, 0, `${expected.id} should not inline duplicate Terror map-space selector blocks`);

      const resolutionMacros = findDeep(resolvePerSpace.effects, (node) =>
        node?.macro === 'insurgent-terror-resolve-space' &&
        node?.args?.faction === expected.faction &&
        node?.args?.resourceVar === expected.resourceVar &&
        node?.args?.shiftFromSupportOnly === expected.shiftFromSupportOnly,
      );
      assert.ok(resolutionMacros.length >= 1, `${expected.id} should call insurgent-terror-resolve-space macro`);
    }
  });

  it('uses shared rally selector macro in both NVA and VC rally profiles', () => {
    for (const expected of [
      { id: 'rally-nva-profile', resourceVar: 'nvaResources' },
      { id: 'rally-vc-profile', resourceVar: 'vcResources' },
    ]) {
      const profile = parseProfile(expected.id);
      const selectSpaces = profile.stages.find((stage: { stage: string }) => stage.stage === 'select-spaces');
      assert.ok(selectSpaces, `${expected.id} should include select-spaces stage`);

      const selectorMacros = findDeep(selectSpaces.effects, (node) =>
        node?.macro === 'insurgent-rally-select-spaces' && node?.args?.resourceVar === expected.resourceVar,
      );
      assert.ok(selectorMacros.length >= 1, `${expected.id} should call insurgent-rally-select-spaces macro`);

      const inlineSelectorBlocks = findDeep(selectSpaces.effects, (node) =>
        node?.chooseN?.bind === 'targetSpaces' && node?.chooseN?.options?.query === 'mapSpaces',
      );
      assert.equal(inlineSelectorBlocks.length, 0, `${expected.id} should not inline duplicate Rally map-space selector blocks`);
    }
  });

  it('executes terror through terror-nva-profile with province cost, marker placement, and Neutral shift', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 191, 4),
          activePlayer: asPlayerId(2),
          globalVars: {
            ...operationInitialState(def, 191, 4).globalVars,
            nvaResources: 5,
            terrorSabotageMarkersPlaced: 0,
          },
        },
        ATTACK_SPACE,
        'passiveSupport',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-nva-province-g'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.equal(final.globalVars.nvaResources, 4, 'NVA Terror should spend 1 resource in a Province/City');
    assert.equal(final.globalVars.terrorSabotageMarkersPlaced, 1, 'NVA Terror should consume one shared terror/sabotage marker');
    assert.equal(final.markers[ATTACK_SPACE]?.terror, 'terror', 'NVA Terror should place a Terror marker in Province/City');
    assert.equal(final.markers[ATTACK_SPACE]?.supportOpposition, 'neutral', 'NVA Terror should shift Support one step toward Neutral');
    const movedGuerrilla = (final.zones[ATTACK_SPACE] ?? []).find((token) => token.id === asTokenId('terror-nva-province-g'));
    assert.ok(movedGuerrilla, 'Expected NVA guerrilla to remain in target space');
    assert.equal(movedGuerrilla.props.activity, 'active', 'NVA Terror should activate one underground guerrilla');
  });

  it('allows NVA Terror in troops-only spaces and does not shift support from opposition', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 192, 4),
          activePlayer: asPlayerId(2),
          globalVars: {
            ...operationInitialState(def, 192, 4).globalVars,
            nvaResources: 5,
            terrorSabotageMarkersPlaced: 0,
          },
        },
        ATTACK_SPACE,
        'activeOpposition',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-nva-province-troops'),
        type: 'nva-troops',
        props: { faction: 'NVA', type: 'troops' },
      },
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.equal(final.globalVars.nvaResources, 4, 'Troops-only NVA Terror in Province/City should still spend 1 resource');
    assert.equal(final.markers[ATTACK_SPACE]?.terror, 'terror', 'Troops-only NVA Terror should still place Terror marker');
    assert.equal(
      final.markers[ATTACK_SPACE]?.supportOpposition,
      'activeOpposition',
      'NVA Terror should not shift support marker when current state is opposition',
    );
  });

  it('places sabotage on LoC and keeps LoC Terror free', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      {
        ...operationInitialState(def, 193, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 193, 4).globalVars,
          nvaResources: 5,
          terrorSabotageMarkersPlaced: 0,
        },
      },
      LOC_SPACE,
      {
        id: asTokenId('terror-nva-loc-troops'),
        type: 'nva-troops',
        props: { faction: 'NVA', type: 'troops' },
      },
    );

    const nonFree = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [LOC_SPACE] },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      freeOperation: true,
      params: { targetSpaces: [LOC_SPACE] },
    }).state;

    assert.equal(nonFree.globalVars.nvaResources, 5, 'LoC NVA Terror should not spend resources');
    assert.equal(free.globalVars.nvaResources, 5, 'Free-operation LoC NVA Terror should remain free');
    assert.equal(nonFree.markers[LOC_SPACE]?.sabotage, 'sabotage', 'LoC NVA Terror should place Sabotage marker');
    assert.equal(nonFree.globalVars.terrorSabotageMarkersPlaced, 1, 'LoC Sabotage should consume one shared marker');
  });

  it('enforces terror/sabotage marker supply cap and idempotent placement for NVA Terror', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const capSetup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 194, 4),
          activePlayer: asPlayerId(2),
          globalVars: {
            ...operationInitialState(def, 194, 4).globalVars,
            nvaResources: 5,
            terrorSabotageMarkersPlaced: 15,
          },
        },
        ATTACK_SPACE,
        'passiveSupport',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-nva-cap-g'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const capFinal = applyMoveWithResolvedDecisionIds(def, capSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.notEqual(capFinal.markers[ATTACK_SPACE]?.terror, 'terror', 'NVA Terror should not place marker when marker supply is exhausted');
    assert.equal(capFinal.globalVars.terrorSabotageMarkersPlaced, 15, 'Marker supply counter should remain capped at 15');
    assert.equal(capFinal.markers[ATTACK_SPACE]?.supportOpposition, 'neutral', 'NVA Terror should still shift Support toward Neutral');

    const idempotentSetup = addTokenToZone(
      {
        ...operationInitialState(def, 195, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 195, 4).globalVars,
          nvaResources: 5,
          terrorSabotageMarkersPlaced: 1,
        },
        markers: {
          ...operationInitialState(def, 195, 4).markers,
          [ATTACK_SPACE]: {
            ...(operationInitialState(def, 195, 4).markers[ATTACK_SPACE] ?? {}),
            terror: 'terror',
          },
        },
      },
      ATTACK_SPACE,
      {
        id: asTokenId('terror-nva-idempotent-g'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const idempotentFinal = applyMoveWithResolvedDecisionIds(def, idempotentSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.equal(idempotentFinal.globalVars.terrorSabotageMarkersPlaced, 1, 'NVA Terror should not consume marker supply on pre-marked spaces');
  });

  it('enforces NVA Terror LimOp max=1 target space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      addTokenToZone(
        {
          ...operationInitialState(def, 196, 4),
          activePlayer: asPlayerId(2),
          globalVars: {
            ...operationInitialState(def, 196, 4).globalVars,
            nvaResources: 10,
          },
        },
        ATTACK_SPACE,
        {
          id: asTokenId('terror-nva-limop-t1'),
          type: 'nva-troops',
          props: { faction: 'NVA', type: 'troops' },
        },
      ),
      RALLY_SPACE_2,
      {
        id: asTokenId('terror-nva-limop-t2'),
        type: 'nva-troops',
        props: { faction: 'NVA', type: 'troops' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('terror'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'NVA Terror LimOp should enforce max one selected target space',
    );
  });

  it('executes terror through terror-vc-profile with province cost, marker placement, and Opposition shift', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 197, 4),
          activePlayer: asPlayerId(3),
          globalVars: {
            ...operationInitialState(def, 197, 4).globalVars,
            vcResources: 5,
            terrorSabotageMarkersPlaced: 0,
          },
        },
        ATTACK_SPACE,
        'neutral',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-vc-province-g'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.equal(final.globalVars.vcResources, 4, 'VC Terror should spend 1 resource in a Province/City');
    assert.equal(final.globalVars.terrorSabotageMarkersPlaced, 1, 'VC Terror should consume one shared terror/sabotage marker');
    assert.equal(final.markers[ATTACK_SPACE]?.terror, 'terror', 'VC Terror should place a Terror marker in Province/City');
    assert.equal(final.markers[ATTACK_SPACE]?.supportOpposition, 'passiveOpposition', 'VC Terror should shift one level toward Active Opposition');
    const movedGuerrilla = (final.zones[ATTACK_SPACE] ?? []).find((token) => token.id === asTokenId('terror-vc-province-g'));
    assert.ok(movedGuerrilla, 'Expected VC guerrilla to remain in target space');
    assert.equal(movedGuerrilla.props.activity, 'active', 'VC Terror should activate one underground guerrilla');
  });

  it('requires underground VC guerrilla for VC Terror target selection', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      {
        ...operationInitialState(def, 198, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 198, 4).globalVars,
          vcResources: 5,
          terrorSabotageMarkersPlaced: 0,
        },
      },
      ATTACK_SPACE,
      {
        id: asTokenId('terror-vc-base-only'),
        type: 'vc-bases',
        props: { faction: 'VC', type: 'base' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('terror'),
          params: { targetSpaces: [ATTACK_SPACE] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'VC Terror should reject spaces that do not contain an underground VC guerrilla',
    );
  });

  it('places sabotage on LoC and keeps VC Terror LoC free (including free operation)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      {
        ...operationInitialState(def, 199, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 199, 4).globalVars,
          vcResources: 5,
          terrorSabotageMarkersPlaced: 0,
        },
      },
      LOC_SPACE,
      {
        id: asTokenId('terror-vc-loc-g'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    const nonFree = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [LOC_SPACE] },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('terror'),
      freeOperation: true,
      params: { targetSpaces: [LOC_SPACE] },
    }).state;

    assert.equal(nonFree.globalVars.vcResources, 5, 'LoC VC Terror should not spend resources');
    assert.equal(free.globalVars.vcResources, 5, 'Free-operation LoC VC Terror should remain free');
    assert.equal(nonFree.markers[LOC_SPACE]?.sabotage, 'sabotage', 'LoC VC Terror should place Sabotage marker');
    assert.equal(nonFree.globalVars.terrorSabotageMarkersPlaced, 1, 'LoC VC Terror should consume one shared marker');
  });

  it('enforces terror/sabotage marker cap + idempotency for VC Terror and keeps shift policy distinct from NVA', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const capSetup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 200, 4),
          activePlayer: asPlayerId(3),
          globalVars: {
            ...operationInitialState(def, 200, 4).globalVars,
            vcResources: 5,
            terrorSabotageMarkersPlaced: 15,
          },
        },
        ATTACK_SPACE,
        'neutral',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-vc-cap-g'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const capFinal = applyMoveWithResolvedDecisionIds(def, capSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.notEqual(capFinal.markers[ATTACK_SPACE]?.terror, 'terror', 'VC Terror should not place marker when marker supply is exhausted');
    assert.equal(capFinal.globalVars.terrorSabotageMarkersPlaced, 15, 'Marker supply counter should remain capped at 15');
    assert.equal(capFinal.markers[ATTACK_SPACE]?.supportOpposition, 'passiveOpposition', 'VC Terror should still shift toward Opposition even if marker supply is exhausted');

    const idempotentSetup = addTokenToZone(
      {
        ...operationInitialState(def, 201, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 201, 4).globalVars,
          vcResources: 5,
          terrorSabotageMarkersPlaced: 1,
        },
        markers: {
          ...operationInitialState(def, 201, 4).markers,
          [ATTACK_SPACE]: {
            ...(operationInitialState(def, 201, 4).markers[ATTACK_SPACE] ?? {}),
            terror: 'terror',
          },
        },
      },
      ATTACK_SPACE,
      {
        id: asTokenId('terror-vc-idempotent-g'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const idempotentFinal = applyMoveWithResolvedDecisionIds(def, idempotentSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;
    assert.equal(idempotentFinal.globalVars.terrorSabotageMarkersPlaced, 1, 'VC Terror should not consume marker supply on pre-marked spaces');

    const nvaSetup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 202, 4),
          activePlayer: asPlayerId(2),
          globalVars: {
            ...operationInitialState(def, 202, 4).globalVars,
            nvaResources: 5,
            terrorSabotageMarkersPlaced: 0,
          },
        },
        ATTACK_SPACE,
        'passiveOpposition',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-nva-opposition-control'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const vcSetup = addTokenToZone(
      withSupportState(
        {
          ...operationInitialState(def, 203, 4),
          activePlayer: asPlayerId(3),
          globalVars: {
            ...operationInitialState(def, 203, 4).globalVars,
            vcResources: 5,
            terrorSabotageMarkersPlaced: 0,
          },
        },
        ATTACK_SPACE,
        'passiveOpposition',
      ),
      ATTACK_SPACE,
      {
        id: asTokenId('terror-vc-opposition-shift'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const nvaFinal = applyMoveWithResolvedDecisionIds(def, nvaSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;
    const vcFinal = applyMoveWithResolvedDecisionIds(def, vcSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;

    assert.equal(nvaFinal.markers[ATTACK_SPACE]?.supportOpposition, 'passiveOpposition', 'NVA Terror should not shift opposition states');
    assert.equal(vcFinal.markers[ATTACK_SPACE]?.supportOpposition, 'activeOpposition', 'VC Terror should shift opposition states toward Active Opposition');
  });

  it('enforces VC Terror LimOp max=1 target space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      addTokenToZone(
        {
          ...operationInitialState(def, 204, 4),
          activePlayer: asPlayerId(3),
          globalVars: {
            ...operationInitialState(def, 204, 4).globalVars,
            vcResources: 10,
          },
        },
        ATTACK_SPACE,
        {
          id: asTokenId('terror-vc-limop-g1'),
          type: 'vc-guerrillas',
          props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
        },
      ),
      RALLY_SPACE_2,
      {
        id: asTokenId('terror-vc-limop-g2'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('terror'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'VC Terror LimOp should enforce max one selected target space',
    );
  });

  it('caps paid Terror target selection by resources while preserving LoC/free-operation behavior', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nvaSetup = addTokenToZone(
      addTokenToZone(
        {
          ...operationInitialState(def, 205, 4),
          activePlayer: asPlayerId(2),
          globalVars: {
            ...operationInitialState(def, 205, 4).globalVars,
            nvaResources: 0,
            terrorSabotageMarkersPlaced: 0,
          },
        },
        ATTACK_SPACE,
        {
          id: asTokenId('terror-affordability-nva-paid'),
          type: 'nva-troops',
          props: { faction: 'NVA', type: 'troops' },
        },
      ),
      LOC_SPACE,
      {
        id: asTokenId('terror-affordability-nva-loc'),
        type: 'nva-troops',
        props: { faction: 'NVA', type: 'troops' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nvaSetup, {
          actionId: asActionId('terror'),
          params: { targetSpaces: [ATTACK_SPACE] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid NVA Terror with 0 resources should reject Province/City target selection',
    );

    const nvaLocFinal = applyMoveWithResolvedDecisionIds(def, nvaSetup, {
      actionId: asActionId('terror'),
      params: { targetSpaces: [LOC_SPACE] },
    }).state;
    assert.equal(nvaLocFinal.globalVars.nvaResources, 0, 'NVA Terror should allow LoC target selection at 0 resources');

    const nvaFreeFinal = applyMoveWithResolvedDecisionIds(def, nvaSetup, {
      actionId: asActionId('terror'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;
    assert.equal(nvaFreeFinal.globalVars.nvaResources, 0, 'Free-operation NVA Terror should bypass paid selector cap');

    const vcSetup = addTokenToZone(
      {
        ...operationInitialState(def, 206, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 206, 4).globalVars,
          vcResources: 0,
          terrorSabotageMarkersPlaced: 0,
        },
      },
      ATTACK_SPACE,
      {
        id: asTokenId('terror-affordability-vc-paid'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcSetup, {
          actionId: asActionId('terror'),
          params: { targetSpaces: [ATTACK_SPACE] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid VC Terror with 0 resources should reject Province/City target selection',
    );

    const vcFreeFinal = applyMoveWithResolvedDecisionIds(def, vcSetup, {
      actionId: asActionId('terror'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE] },
    }).state;
    assert.equal(vcFreeFinal.globalVars.vcResources, 0, 'Free-operation VC Terror should bypass paid selector cap');
  });

  it('executes attack through attack-nva-profile when active player is NVA', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const start = operationInitialState(compiled.gameDef!, 101, 4);
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
      },
    };
    const final = applyMoveWithResolvedDecisionIds(compiled.gameDef!, withAttackTargets, selected).state;

    assert.ok(Number(final.globalVars.nvaResources ?? 10) <= 10, 'Expected Attack to charge NVA resources or keep them unchanged if free');
  });

  it('executes attack through attack-vc-profile when active player is VC', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 102, 4);
    const withVcActive = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 10,
      },
    };
    const withAttackTargets = addTokenToZone(
      addTokenToZone(withVcActive, ATTACK_SPACE, {
        id: asTokenId('test-vc-g-insurgent'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      }),
      ATTACK_SPACE,
      {
        id: asTokenId('test-us-t-vc-insurgent'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );
    const final = applyMoveWithResolvedDecisionIds(def, withAttackTargets, {
      actionId: asActionId('attack'),
      params: {
        targetSpaces: [ATTACK_SPACE],
      },
    }).state;

    assert.equal(final.globalVars.vcResources, 9, 'VC Attack should spend 1 VC resource per selected space');
    const vcInSpace = (final.zones[ATTACK_SPACE] ?? []).filter((token) => token.props.faction === 'VC');
    assert.ok(
      vcInSpace.some((token) => token.props.type === 'guerrilla' && token.props.activity === 'active'),
      'VC guerrillas in attacked space should activate',
    );
  });

  it('march moves NVA pieces from adjacent spaces and charges Province/City but not LoC destinations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const provinceMover = asTokenId('march-province-nva-g');
    const provinceSetup = addTokenToZone(
      {
        ...operationInitialState(def, 111, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 111, 4).globalVars,
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
    const provinceFinal = applyMoveWithResolvedDecisionIds(def, provinceSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], chainSpaces: [], $movingGuerrillas: [provinceMover], $movingTroops: [] },
    }).state;

    assert.equal(provinceFinal.globalVars.nvaResources, 4, 'Province/City destination should spend 1 NVA resource');
    assert.ok((provinceFinal.zones[RALLY_SPACE] ?? []).every((token) => token.id !== provinceMover), 'Moved piece should leave origin space');
    assert.ok((provinceFinal.zones[ATTACK_SPACE] ?? []).some((token) => token.id === provinceMover), 'Moved piece should enter destination space');

    const locMover = asTokenId('march-loc-nva-t');
    const locSetup = addTokenToZone(
      {
        ...operationInitialState(def, 112, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 112, 4).globalVars,
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
    const locFinal = applyMoveWithResolvedDecisionIds(def, locSetup, {
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
              ...operationInitialState(def, 113, 4),
              activePlayer: asPlayerId(2),
              globalVars: {
                ...operationInitialState(def, 113, 4).globalVars,
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

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
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
                ...operationInitialState(def, 114, 4),
                activePlayer: asPlayerId(2),
                globalVars: {
                  ...operationInitialState(def, 114, 4).globalVars,
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

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
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
        ...operationInitialState(def, 115, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 115, 4).globalVars,
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

    const nonFree = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], chainSpaces: [], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, setup, {
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
        ...operationInitialState(def, 121, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 121, 4).globalVars,
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
    const provinceFinal = applyMoveWithResolvedDecisionIds(def, provinceSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [provinceMover], $movingTroops: [] },
    }).state;

    assert.equal(provinceFinal.globalVars.vcResources, 4, 'Province/City destination should spend 1 VC resource');
    assert.ok((provinceFinal.zones[RALLY_SPACE] ?? []).every((token) => token.id !== provinceMover), 'Moved VC piece should leave origin space');
    assert.ok((provinceFinal.zones[ATTACK_SPACE] ?? []).some((token) => token.id === provinceMover), 'Moved VC piece should enter destination space');

    const locMover = asTokenId('march-loc-vc-g');
    const locSetup = addTokenToZone(
      {
        ...operationInitialState(def, 122, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 122, 4).globalVars,
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
    const locFinal = applyMoveWithResolvedDecisionIds(def, locSetup, {
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
        ...operationInitialState(def, 126, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 126, 4).globalVars,
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

    const nonFree = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [mover], $movingTroops: [] },
    }).state;

    assert.equal(nonFree.globalVars.vcResources, 4, 'Non-free VC March should spend 1 resource for Province/City destination');
    assert.equal(free.globalVars.vcResources, 5, 'Free VC March should skip per-space Province/City spend');
  });

  it('caps paid March destination selection by resources while preserving LoC/free-operation behavior', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nvaMover = asTokenId('march-affordability-nva-g');
    const nvaSetup = addTokenToZone(
      {
        ...operationInitialState(def, 127, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 127, 4).globalVars,
          nvaResources: 0,
        },
      },
      RALLY_SPACE,
      {
        id: nvaMover,
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nvaSetup, {
          actionId: asActionId('march'),
          params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [nvaMover], $movingTroops: [] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid NVA March with 0 resources should reject Province/City destination selection',
    );

    const nvaLocFinal = applyMoveWithResolvedDecisionIds(def, nvaSetup, {
      actionId: asActionId('march'),
      params: { targetSpaces: [LOC_SPACE], $movingGuerrillas: [nvaMover], $movingTroops: [] },
    }).state;
    assert.equal(nvaLocFinal.globalVars.nvaResources, 0, 'NVA March should allow LoC destination selection at 0 resources');

    const nvaFreeFinal = applyMoveWithResolvedDecisionIds(def, nvaSetup, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [nvaMover], $movingTroops: [] },
    }).state;
    assert.equal(nvaFreeFinal.globalVars.nvaResources, 0, 'Free-operation NVA March should bypass paid selector cap');

    const vcMover = asTokenId('march-affordability-vc-g');
    const vcSetup = addTokenToZone(
      {
        ...operationInitialState(def, 128, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 128, 4).globalVars,
          vcResources: 0,
        },
      },
      RALLY_SPACE,
      {
        id: vcMover,
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcSetup, {
          actionId: asActionId('march'),
          params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [vcMover], $movingTroops: [] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid VC March with 0 resources should reject Province/City destination selection',
    );

    const vcFreeFinal = applyMoveWithResolvedDecisionIds(def, vcSetup, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: { targetSpaces: [ATTACK_SPACE], $movingGuerrillas: [vcMover], $movingTroops: [] },
    }).state;
    assert.equal(vcFreeFinal.globalVars.vcResources, 0, 'Free-operation VC March should bypass paid selector cap');
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
              ...operationInitialState(def, 123, 4),
              activePlayer: asPlayerId(3),
              globalVars: {
                ...operationInitialState(def, 123, 4).globalVars,
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

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
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
        ...operationInitialState(def, 124, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 124, 4).globalVars,
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

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
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
        ...operationInitialState(def, 125, 4),
        activePlayer: asPlayerId(3),
        globalVars: {
          ...operationInitialState(def, 125, 4).globalVars,
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
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('march'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'VC March LimOp should enforce max one selected destination',
    );
  });

  it('enforces March LimOp max=1 destination', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const setup = addTokenToZone(
      {
        ...operationInitialState(def, 116, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 116, 4).globalVars,
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
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('march'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
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
        ...operationInitialState(def, 117, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 117, 4).globalVars,
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

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
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
        ...operationInitialState(def, 118, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 118, 4).globalVars,
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
    const noTrailFinal = applyMoveWithResolvedDecisionIds(def, noTrailSetup, {
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
        ...operationInitialState(def, 119, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 119, 4).globalVars,
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
    const limOpFinal = applyMoveWithResolvedDecisionIds(def, limOpSetup, {
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
        ...operationInitialState(def, 120, 4),
        activePlayer: asPlayerId(2),
        globalVars: {
          ...operationInitialState(def, 120, 4).globalVars,
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
    const final = applyMoveWithResolvedDecisionIds(def, setup, {
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

  it('treats attack as illegal when active player is not an insurgent faction', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const nonNvaState = {
      ...operationInitialState(compiled.gameDef!, 77, 4),
      activePlayer: asPlayerId(0),
    };
    const legal = legalMoves(compiled.gameDef!, nonNvaState);
    assert.ok(!legal.some((move) => move.actionId === asActionId('attack')));
    assert.throws(
      () => applyMoveWithResolvedDecisionIds(compiled.gameDef!, nonNvaState, { actionId: asActionId('attack'), params: {} }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('applies troops-attack damage as floor(nvaTroops/2) and applies attrition equal to US removed', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 181, 4);
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
      },
    };
    const final = applyMoveWithResolvedDecisionIds(def, withAttackTargets, selected).state;

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

    const start = operationInitialState(def, 211, 4);
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

    const nonFree = applyMoveWithResolvedDecisionIds(def, withTargets, {
      actionId: asActionId('attack'),
      params: {
        targetSpaces: [ATTACK_SPACE],
        $attackMode: 'troops-attack',
      },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, withTargets, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        targetSpaces: [ATTACK_SPACE],
        $attackMode: 'troops-attack',
      },
    }).state;

    assert.equal(nonFree.globalVars.nvaResources, 6, 'Non-free attack should spend 1 NVA resource per targeted space');
    assert.equal(free.globalVars.nvaResources, 7, 'Free attack should skip per-space NVA resource spend');
  });

  it('skips vcResources attack spend when move is marked freeOperation', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 212, 4);
    const withVcActive = {
      ...start,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...start.globalVars,
        vcResources: 7,
      },
    };
    const withTargets = addTokenToZone(
      addTokenToZone(withVcActive, ATTACK_SPACE, {
        id: asTokenId('test-free-vc-g'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      }),
      ATTACK_SPACE,
      {
        id: asTokenId('test-free-us-vc-t'),
        type: 'us-troops',
        props: { faction: 'US', type: 'troops' },
      },
    );

    const nonFree = applyMoveWithResolvedDecisionIds(def, withTargets, {
      actionId: asActionId('attack'),
      params: {
        targetSpaces: [ATTACK_SPACE],
      },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, withTargets, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        targetSpaces: [ATTACK_SPACE],
      },
    }).state;

    assert.equal(nonFree.globalVars.vcResources, 6, 'Non-free VC attack should spend 1 resource per targeted space');
    assert.equal(free.globalVars.vcResources, 7, 'Free VC attack should skip per-space VC resource spend');
  });

  it('caps paid Attack target selection by resources and bypasses cap on free operations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nvaSetup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            addTokenToZone(
              addTokenToZone(
                {
                  ...operationInitialState(def, 213, 4),
                  activePlayer: asPlayerId(2),
                  globalVars: {
                    ...operationInitialState(def, 213, 4).globalVars,
                    nvaResources: 2,
                  },
                },
                ATTACK_SPACE,
                { id: asTokenId('attack-affordability-nva-t1'), type: 'nva-troops', props: { faction: 'NVA', type: 'troops' } },
              ),
              ATTACK_SPACE,
              { id: asTokenId('attack-affordability-us-t1'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
            ),
            RALLY_SPACE_2,
            { id: asTokenId('attack-affordability-nva-t2'), type: 'nva-troops', props: { faction: 'NVA', type: 'troops' } },
          ),
          RALLY_SPACE_2,
          { id: asTokenId('attack-affordability-us-t2'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
        ),
        RALLY_SPACE_3,
        { id: asTokenId('attack-affordability-nva-t3'), type: 'nva-troops', props: { faction: 'NVA', type: 'troops' } },
      ),
      RALLY_SPACE_3,
      { id: asTokenId('attack-affordability-us-t3'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nvaSetup, {
          actionId: asActionId('attack'),
          params: {
            targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2, RALLY_SPACE_3],
            $attackMode: 'troops-attack',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid NVA Attack with 2 resources should reject selecting 3 paid spaces',
    );

    const nvaFreeFinal = applyMoveWithResolvedDecisionIds(def, nvaSetup, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2, RALLY_SPACE_3],
        $attackMode: 'troops-attack',
      },
    }).state;
    assert.equal(nvaFreeFinal.globalVars.nvaResources, 2, 'Free-operation NVA Attack should bypass paid selector cap');

    const vcSetup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            {
              ...operationInitialState(def, 214, 4),
              activePlayer: asPlayerId(3),
              globalVars: {
                ...operationInitialState(def, 214, 4).globalVars,
                vcResources: 1,
              },
            },
            ATTACK_SPACE,
            {
              id: asTokenId('attack-affordability-vc-g1'),
              type: 'vc-guerrillas',
              props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
            },
          ),
          ATTACK_SPACE,
          { id: asTokenId('attack-affordability-vc-us1'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
        ),
        RALLY_SPACE_2,
        {
          id: asTokenId('attack-affordability-vc-g2'),
          type: 'vc-guerrillas',
          props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
        },
      ),
      RALLY_SPACE_2,
      { id: asTokenId('attack-affordability-vc-us2'), type: 'us-troops', props: { faction: 'US', type: 'troops' } },
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcSetup, {
          actionId: asActionId('attack'),
          params: {
            targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid VC Attack with 1 resource should reject selecting 2 paid spaces',
    );

    const vcFreeFinal = applyMoveWithResolvedDecisionIds(def, vcSetup, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        targetSpaces: [ATTACK_SPACE, RALLY_SPACE_2],
      },
    }).state;
    assert.equal(vcFreeFinal.globalVars.vcResources, 1, 'Free-operation VC Attack should bypass paid selector cap');
  });

  it('treats rally as illegal when active player is not an insurgent faction', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nonInsurgentState = {
      ...operationInitialState(def, 301, 4),
      activePlayer: asPlayerId(0),
    };

    const legal = legalMoves(def, nonInsurgentState);
    assert.ok(!legal.some((move) => move.actionId === asActionId('rally')));
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nonInsurgentState, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [], $improveTrail: 'no' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('enforces rally space filter: excludes support and includes neutral/opposition', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 302, 4);
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
        applyMoveWithResolvedDecisionIds(def, withAvailable, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Rally should reject activeSupport spaces',
    );

    const neutralResult = applyMoveWithResolvedDecisionIds(def, withAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;
    assert.equal(neutralResult.globalVars.nvaResources, 9, 'Neutral space should be eligible and spend 1 resource');

    const oppositionResult = applyMoveWithResolvedDecisionIds(def, withAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [ATTACK_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;
    assert.equal(oppositionResult.globalVars.nvaResources, 9, 'Opposition space should be eligible and spend 1 resource');
  });

  it('charges per-space rally cost normally and skips only that cost on free operations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 303, 4);
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

    const nonFree = applyMoveWithResolvedDecisionIds(def, nvaWithAvailable, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;
    const free = applyMoveWithResolvedDecisionIds(def, nvaWithAvailable, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;

    assert.equal(nonFree.globalVars.nvaResources, 5, 'Non-free rally should spend 1 NVA resource per selected space');
    assert.equal(free.globalVars.nvaResources, 6, 'Free rally should skip per-space NVA resource spend');
  });

  it('caps paid Rally target-space selection by NVA resources and bypasses cap on free operations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 3031, 4);
    const nvaPaid = withSupportState(
      withSupportState(
        withSupportState(
          withSupportState(
            {
              ...start,
              activePlayer: asPlayerId(2),
              globalVars: {
                ...start.globalVars,
                nvaResources: 3,
                trail: 0,
              },
            },
            RALLY_SPACE,
            'neutral',
          ),
          RALLY_SPACE_2,
          'neutral',
        ),
        RALLY_SPACE_3,
        'neutral',
      ),
      RALLY_SPACE_4,
      'neutral',
    );
    const paidFinal = applyMoveWithResolvedDecisionIds(def, nvaPaid, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2, RALLY_SPACE_3], $improveTrail: 'no' },
    }).state;
    assert.equal(paidFinal.globalVars.nvaResources, 0, 'Paid NVA Rally should spend 1 resource per selected space');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nvaPaid, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2, RALLY_SPACE_3, RALLY_SPACE_4], $improveTrail: 'no' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid NVA Rally with 3 resources should reject selecting 4 spaces',
    );

    const nvaFreeBase = {
      ...nvaPaid,
      globalVars: {
        ...nvaPaid.globalVars,
        nvaResources: 0,
      },
    };
    const nvaFree = addTokenToZone(
      addTokenToZone(nvaFreeBase, 'available-NVA:none', {
        id: asTokenId('rally-affordability-nva-free-g1'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      }),
      'available-NVA:none',
      {
        id: asTokenId('rally-affordability-nva-free-g2'),
        type: 'nva-guerrillas',
        props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
      },
    );
    const freeFinal = applyMoveWithResolvedDecisionIds(def, nvaFree, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2], $improveTrail: 'no' },
    }).state;
    assert.equal(freeFinal.globalVars.nvaResources, 0, 'Free NVA Rally should bypass paid selection cap at 0 resources');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, nvaFreeBase, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE], $improveTrail: 'no' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid NVA Rally with 0 resources should reject selecting paid spaces',
    );
  });

  it('supports no-base replacement branch and with-base guerrilla placement limit', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 304, 4);
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
    const replaced = applyMoveWithResolvedDecisionIds(def, replacementSetup, {
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
    const withBase = applyMoveWithResolvedDecisionIds(def, withBaseSetup2, {
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

    const start = operationInitialState(def, 305, 4);
    const nva = {
      ...start,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...start.globalVars,
        nvaResources: 7,
        trail: 1,
      },
    };

    const limitedNoSpace = applyMoveWithResolvedDecisionIds(def, nva, {
      actionId: asActionId('rally'),
      actionClass: 'limitedOperation',
      params: { targetSpaces: [], $improveTrail: 'yes', $trailImproveSpaces: [CENTRAL_LAOS] },
    }).state;
    assert.equal(limitedNoSpace.globalVars.nvaResources, 5, 'Trail improvement should cost 2 during LimOp even with zero spaces');
    assert.equal(limitedNoSpace.globalVars.trail, 2, 'Trail improvement should increase trail by 1');

    const freeNoSpace = applyMoveWithResolvedDecisionIds(def, nva, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [], $improveTrail: 'yes', $trailImproveSpaces: [CENTRAL_LAOS] },
    }).state;
    assert.equal(freeNoSpace.globalVars.nvaResources, 5, 'Trail improvement cost should not be waived by freeOperation');
    assert.equal(freeNoSpace.globalVars.trail, 2, 'Free operation should still apply trail increase');
  });

  it('enforces rally LimOp max=1 with min=0', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 306, 4);
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
        applyMoveWithResolvedDecisionIds(def, nva, {
          actionId: asActionId('rally'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const zeroSelected = applyMoveWithResolvedDecisionIds(def, nva, {
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

    const start = operationInitialState(def, 307, 4);
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

    const final = applyMoveWithResolvedDecisionIds(def, vcWithAvailable, {
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

    const start = operationInitialState(def, 308, 4);
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
        applyMoveWithResolvedDecisionIds(def, vcWithAvailable, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE], $noBaseChoice: 'place-guerrilla' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'VC rally should reject activeSupport spaces',
    );

    const free = applyMoveWithResolvedDecisionIds(def, vcWithAvailable, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla' },
    }).state;
    assert.equal(free.globalVars.vcResources, 8, 'Free VC rally should skip per-space VC resource spend');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcWithAvailable, {
          actionId: asActionId('rally'),
          actionClass: 'limitedOperation',
          params: { targetSpaces: [RALLY_SPACE_2, ATTACK_SPACE], $noBaseChoice: 'place-guerrilla' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'VC rally LimOp should enforce max one selected space',
    );
  });

  it('caps paid Rally target-space selection by VC resources and bypasses cap on free operations', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 3081, 4);
    const vcPaid = withSupportState(
      withSupportState(
        withSupportState(
          {
            ...start,
            activePlayer: asPlayerId(3),
            globalVars: {
              ...start.globalVars,
              vcResources: 2,
            },
          },
          RALLY_SPACE,
          'neutral',
        ),
        RALLY_SPACE_2,
        'neutral',
      ),
      RALLY_SPACE_3,
      'neutral',
    );

    const paidFinal = applyMoveWithResolvedDecisionIds(def, vcPaid, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla' },
    }).state;
    assert.equal(paidFinal.globalVars.vcResources, 0, 'Paid VC Rally should spend 1 resource per selected space');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, vcPaid, {
          actionId: asActionId('rally'),
          params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2, RALLY_SPACE_3], $noBaseChoice: 'place-guerrilla' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Paid VC Rally with 2 resources should reject selecting 3 spaces',
    );

    const vcFreeBase = {
      ...vcPaid,
      globalVars: {
        ...vcPaid.globalVars,
        vcResources: 0,
      },
    };
    const vcFree = addTokenToZone(
      addTokenToZone(vcFreeBase, 'available-VC:none', {
        id: asTokenId('rally-affordability-vc-free-g1'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      }),
      'available-VC:none',
      {
        id: asTokenId('rally-affordability-vc-free-g2'),
        type: 'vc-guerrillas',
        props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
      },
    );
    const freeFinal = applyMoveWithResolvedDecisionIds(def, vcFree, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { targetSpaces: [RALLY_SPACE, RALLY_SPACE_2], $noBaseChoice: 'place-guerrilla' },
    }).state;
    assert.equal(freeFinal.globalVars.vcResources, 0, 'Free VC Rally should bypass paid selection cap at 0 resources');
  });

  it('supports VC rally no-base replacement plus with-base place/flip branches', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = operationInitialState(def, 309, 4);
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
    const replaced = applyMoveWithResolvedDecisionIds(def, replacementSetup, {
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
    const placeChoice = applyMoveWithResolvedDecisionIds(def, withBaseSetup2, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $withBaseChoice: 'place-guerrillas' },
    }).state;
    const placedGuerrillas = (placeChoice.zones[RALLY_SPACE] ?? []).filter(
      (t) => t.props.faction === 'VC' && t.props.type === 'guerrilla',
    ).length;
    assert.equal(placedGuerrillas, 4, 'With VC base, place branch should add population(1)+bases(1)=2 guerrillas');

    const flipChoice = applyMoveWithResolvedDecisionIds(def, withBaseSetup2, {
      actionId: asActionId('rally'),
      params: { targetSpaces: [RALLY_SPACE], $withBaseChoice: 'flip-underground' },
    }).state;
    const vcGuerrillasAfterFlip = (flipChoice.zones[RALLY_SPACE] ?? []).filter(
      (t) => t.props.faction === 'VC' && t.props.type === 'guerrilla',
    );
    assert.ok(vcGuerrillasAfterFlip.every((t) => t.props.activity === 'underground'), 'Flip branch should set all VC guerrillas underground');
  });
});
