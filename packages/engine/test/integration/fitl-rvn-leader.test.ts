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
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type LeaderState = 'minh' | 'khanh' | 'youngTurks' | 'ky' | 'thieu';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...extra },
});

const withActiveLeader = (state: GameState, leader: LeaderState): GameState => ({
  ...state,
  globalMarkers: {
    ...(state.globalMarkers ?? {}),
    activeLeader: leader,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const globalVarNumber = (state: GameState, varName: string): number => {
  const value = state.globalVars[varName];
  if (typeof value !== 'number') {
    throw new Error(`Expected global var ${varName} to be numeric`);
  }
  return value;
};

describe('FITL RVN leader lingering effects', () => {
  it('applies Minh +5 Aid on ARVN Train operation only', () => {
    const def = compileDef();
    const space = 'qui-nhon:none';

    const baseState = clearAllZones(initialState(def, 9001, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 20,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('arvn-train-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('arvn-train-p', 'police', 'ARVN', { type: 'police' }),
        ],
      },
    };

    const runTrain = (leader: LeaderState): GameState =>
      applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('train'),
        params: {
          targetSpaces: [space],
          $trainChoice: 'rangers',
          $subActionSpaces: [],
        },
      }).state;

    const minh = runTrain('minh');
    const thieu = runTrain('thieu');

    assert.equal(minh.globalVars.aid, 25, 'Minh should add +5 Aid on ARVN Train');
    assert.equal(thieu.globalVars.aid, 20, 'Thieu should not modify ARVN Train Aid');
  });

  it('does not add Minh Aid bonus to US Train', () => {
    const def = compileDef();
    const space = 'qui-nhon:none';

    const baseState = clearAllZones(initialState(def, 9002, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...baseState.globalVars,
        aid: 20,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('us-train-t', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const runTrain = (leader: LeaderState): GameState =>
      applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('train'),
        params: {
          targetSpaces: [space],
          $trainChoice: 'place-irregulars',
          $subActionSpaces: [],
        },
      }).state;

    const minh = runTrain('minh');
    const thieu = runTrain('thieu');

    assert.equal(minh.globalVars.aid, thieu.globalVars.aid, 'Minh bonus must not apply to US Train profile');
  });

  it('limits Khanh Transport destinations to routes that use at most one LoC', () => {
    const def = compileDef();
    const origin = 'da-nang:none';
    const farDestination = 'saigon:none';

    const baseState = clearAllZones(initialState(def, 9003, 4).state);
    const setup: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        [origin]: [
          makeToken('transport-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
    };

    const baseline = applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, 'thieu'), {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: farDestination,
      },
    });
    assert.equal(
      baseline.state.zones[farDestination]?.some((token) => token.id === 'transport-arvn-t'),
      true,
      'Baseline transport should allow farther destination through LoC/city connectivity',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, 'khanh'), {
          actionId: asActionId('transport'),
          params: {
            $transportOrigin: origin,
            $transportDestination: farDestination,
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Khanh should restrict Transport destination legality',
    );
  });

  it('keeps Khanh Transport legal for destinations reachable via at most one LoC', () => {
    const def = compileDef();
    const origin = 'da-nang:none';
    const nearDestination = 'qui-nhon:none';

    const baseState = clearAllZones(initialState(def, 90031, 4).state);
    const setup: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        [origin]: [
          makeToken('transport-arvn-near-t', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
    };

    const outcome = applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, 'khanh'), {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: nearDestination,
      },
    });

    assert.equal(
      outcome.state.zones[nearDestination]?.some((token) => token.id === 'transport-arvn-near-t'),
      true,
      'Khanh should still allow Transport along routes that include at most one LoC',
    );
  });

  it('applies Young Turks +2 Patronage on Govern', () => {
    const def = compileDef();
    const space = 'can-tho:none';

    const baseState = clearAllZones(initialState(def, 9004, 4).state);
    const setup: GameState = {
      ...baseState,
      globalVars: {
        ...baseState.globalVars,
        aid: 30,
        patronage: 10,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('govern-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('govern-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('govern-us-t', 'troops', 'US', { type: 'troops' }),
        ],
      },
      markers: {
        ...baseState.markers,
        [space]: {
          ...(baseState.markers[space] ?? {}),
          supportOpposition: 'activeSupport',
        },
      },
    };

    const runGovern = (leader: LeaderState): GameState =>
      applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('govern'),
        params: {
          targetSpaces: [space],
          [`$governMode@${space}`]: 'patronage',
        },
      }).state;

    const youngTurks = runGovern('youngTurks');
    const thieu = runGovern('thieu');

    assert.equal(
      globalVarNumber(youngTurks, 'patronage') - globalVarNumber(thieu, 'patronage'),
      2,
      'Young Turks should add +2 Patronage beyond normal Govern effects',
    );
  });

  it('applies Ky pacification cost as 4 per level (and 4 per Terror)', () => {
    const def = compileDef();
    const space = 'qui-nhon:none';

    const runPacify = (leader: LeaderState, withTerror: boolean): GameState => {
      const baseState = clearAllZones(initialState(def, withTerror ? 9006 : 9005, 4).state);
      const setup: GameState = {
        ...baseState,
        activePlayer: asPlayerId(1),
        globalVars: {
          ...baseState.globalVars,
          arvnResources: 20,
        },
        zones: {
          ...baseState.zones,
          [space]: [
            makeToken('pacify-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('pacify-arvn-p', 'police', 'ARVN', { type: 'police' }),
          ],
        },
        markers: {
          ...baseState.markers,
          [space]: {
            ...(baseState.markers[space] ?? {}),
            supportOpposition: 'neutral',
          },
        },
        zoneVars: {
          ...baseState.zoneVars,
          [space]: {
            ...(baseState.zoneVars[space] ?? {}),
            terrorCount: withTerror ? 1 : 0,
          },
        },
      };

      return applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('train'),
        params: {
          targetSpaces: [space],
          $trainChoice: 'rangers',
          $subActionSpaces: [space],
          $subAction: 'pacify',
          $pacLevels: 1,
        },
      }).state;
    };

    const kyNoTerror = runPacify('ky', false);
    const thieuNoTerror = runPacify('thieu', false);
    assert.equal(
      globalVarNumber(thieuNoTerror, 'arvnResources') - globalVarNumber(kyNoTerror, 'arvnResources'),
      1,
      'Ky should cost one extra resource for one pacification level',
    );

    const kyWithTerror = runPacify('ky', true);
    const thieuWithTerror = runPacify('thieu', true);
    assert.equal(
      globalVarNumber(thieuWithTerror, 'arvnResources') - globalVarNumber(kyWithTerror, 'arvnResources'),
      2,
      'Ky should cost one extra per Terror and one extra per support level',
    );
  });

  it('keeps Thieu as no-op and compiles deferred Desertion helper for Spec 29 wiring', () => {
    const { parsed } = compileProductionSpec();
    const profiles = parsed.doc.actionPipelines ?? [];

    const trainArvn = profiles.find((profile) => profile.id === 'train-arvn-profile');
    const govern = profiles.find((profile) => profile.id === 'govern-profile');
    const transport = profiles.find((profile) => profile.id === 'transport-profile');
    assert.ok(trainArvn && govern && transport, 'Expected train-arvn, govern, and transport profiles');

    const thieuChecks = [
      ...findDeep(trainArvn, (node) => node?.ref === 'globalMarkerState' && node?.marker === 'activeLeader'),
      ...findDeep(govern, (node) => node?.ref === 'globalMarkerState' && node?.marker === 'activeLeader'),
      ...findDeep(transport, (node) => node?.ref === 'globalMarkerState' && node?.marker === 'activeLeader'),
    ].filter((node) => JSON.stringify(node).includes('"thieu"'));
    assert.equal(thieuChecks.length, 0, 'Thieu should not have leader-specific behavior branches');

    const macros = parsed.doc.effectMacros ?? [];
    const desertionMacro = macros.find((macro) => macro.id === 'rvn-leader-failed-attempt-desertion');
    assert.ok(desertionMacro, 'Expected deferred Failed Attempt Desertion macro');

    const hasThirdsRemoval = findDeep(desertionMacro.effects, (node) =>
      node?.forEach?.limit?.op === '/' &&
      node?.forEach?.limit?.right === 3 &&
      findDeep(node.forEach?.over ?? {}, (child) => child?.prop === 'faction' && child?.eq === 'ARVN').length > 0,
    );
    assert.ok(hasThirdsRemoval.length >= 1, 'Expected Desertion helper to remove floor(ARVN cubes/3) per space');
  });

  it('compiles Failed Attempt coup duplicates with identical desertion effects and unique IDs', () => {
    const def = compileDef();
    const card129 = def.eventDecks?.[0]?.cards.find((card) => card.id === 'card-129');
    const card130 = def.eventDecks?.[0]?.cards.find((card) => card.id === 'card-130');

    assert.notEqual(card129, undefined);
    assert.notEqual(card130, undefined);
    assert.equal(card129?.order, 129);
    assert.equal(card130?.order, 130);
    assert.equal(card129?.title, 'Failed Attempt');
    assert.equal(card130?.title, 'Failed Attempt');

    assert.equal(
      card129?.unshaded?.effects?.some((effect) => 'setGlobalMarker' in effect),
      false,
      'Failed Attempt cards should not mutate activeLeader directly',
    );
    assert.equal(card130?.unshaded?.effects?.some((effect) => 'setGlobalMarker' in effect), false);

    const card129HasDesertion = findDeep(card129?.unshaded?.effects, (node) =>
      node?.forEach?.limit?.op === '/' &&
      node?.forEach?.limit?.right === 3 &&
      findDeep(node.forEach?.over ?? {}, (child) => child?.prop === 'faction' && child?.value === 'ARVN').length > 0,
    );
    const card130HasDesertion = findDeep(card130?.unshaded?.effects, (node) =>
      node?.forEach?.limit?.op === '/' &&
      node?.forEach?.limit?.right === 3 &&
      findDeep(node.forEach?.over ?? {}, (child) => child?.prop === 'faction' && child?.value === 'ARVN').length > 0,
    );

    assert.ok(card129HasDesertion.length >= 1, 'Card 129 should encode ARVN cube-thirds desertion loop');
    assert.ok(card130HasDesertion.length >= 1, 'Card 130 should encode ARVN cube-thirds desertion loop');
  });
});
