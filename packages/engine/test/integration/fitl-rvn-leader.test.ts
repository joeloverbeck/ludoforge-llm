// @test-class: architectural-invariant
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

type LeaderState = 'none' | 'minh' | 'khanh' | 'youngTurks' | 'ky' | 'thieu';

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
          $targetSpaces: [space],
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
          $targetSpaces: [space],
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
      activePlayer: asPlayerId(1),
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
      activePlayer: asPlayerId(1),
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
      activePlayer: asPlayerId(1),
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
          $targetSpaces: [space],
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

  it('applies Young Turks +2 Patronage even when Govern uses aid mode', () => {
    const def = compileDef();
    const space = 'can-tho:none';

    const baseState = clearAllZones(initialState(def, 9010, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 30,
        patronage: 10,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('gov-aid-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-aid-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-aid-us-t', 'troops', 'US', { type: 'troops' }),
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
          $targetSpaces: [space],
          [`$governMode@${space}`]: 'aid',
        },
      }).state;

    const yt = runGovern('youngTurks');
    const baseline = runGovern('thieu');

    assert.equal(
      globalVarNumber(yt, 'patronage') - globalVarNumber(baseline, 'patronage'),
      2,
      'Young Turks +2 Patronage should apply even in aid mode',
    );
  });

  it('applies Young Turks +2 Patronage as flat bonus (not per space) with multi-space Govern', () => {
    const def = compileDef();
    const spaceA = 'can-tho:none';
    const spaceB = 'qui-nhon:none';

    const baseState = clearAllZones(initialState(def, 9011, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 40,
        patronage: 10,
      },
      zones: {
        ...baseState.zones,
        [spaceA]: [
          makeToken('gov-multi-a-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-multi-a-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-multi-a-us-t', 'troops', 'US', { type: 'troops' }),
        ],
        [spaceB]: [
          makeToken('gov-multi-b-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-multi-b-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-multi-b-us-t', 'troops', 'US', { type: 'troops' }),
        ],
      },
      markers: {
        ...baseState.markers,
        [spaceA]: {
          ...(baseState.markers[spaceA] ?? {}),
          supportOpposition: 'activeSupport',
        },
        [spaceB]: {
          ...(baseState.markers[spaceB] ?? {}),
          supportOpposition: 'activeSupport',
        },
      },
    };

    const runGovern = (leader: LeaderState): GameState =>
      applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('govern'),
        params: {
          $targetSpaces: [spaceA, spaceB],
          [`$governMode@${spaceA}`]: 'patronage',
          [`$governMode@${spaceB}`]: 'patronage',
        },
      }).state;

    const yt = runGovern('youngTurks');
    const baseline = runGovern('thieu');

    assert.equal(
      globalVarNumber(yt, 'patronage') - globalVarNumber(baseline, 'patronage'),
      2,
      'Young Turks bonus should be flat +2 per Govern action, not +2 per space',
    );
  });

  it('does not apply Young Turks +2 Patronage on Transport', () => {
    const def = compileDef();
    const origin = 'da-nang:none';
    const destination = 'qui-nhon:none';

    const baseState = clearAllZones(initialState(def, 9012, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        patronage: 10,
      },
      zones: {
        ...baseState.zones,
        [origin]: [
          makeToken('transport-yt-t', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(
      def,
      withActiveLeader(setup, 'youngTurks'),
      {
        actionId: asActionId('transport'),
        params: {
          $transportOrigin: origin,
          $transportDestination: destination,
        },
      },
    ).state;

    assert.equal(
      globalVarNumber(result, 'patronage'),
      10,
      'Transport should not trigger Young Turks Patronage bonus',
    );
  });

  it('does not apply +2 Patronage bonus for any non-Young-Turks leader', () => {
    const def = compileDef();
    const space = 'can-tho:none';

    const baseState = clearAllZones(initialState(def, 9013, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 30,
        patronage: 10,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('gov-leaders-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-leaders-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-leaders-us-t', 'troops', 'US', { type: 'troops' }),
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

    const runGovern = (leader: LeaderState): number =>
      globalVarNumber(
        applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
          actionId: asActionId('govern'),
          params: {
            $targetSpaces: [space],
            [`$governMode@${space}`]: 'patronage',
          },
        }).state,
        'patronage',
      );

    const minh = runGovern('minh');
    const khanh = runGovern('khanh');
    const ky = runGovern('ky');
    const thieu = runGovern('thieu');

    assert.equal(minh, khanh, 'Minh and Khanh should produce identical Govern patronage');
    assert.equal(khanh, ky, 'Khanh and Ky should produce identical Govern patronage');
    assert.equal(ky, thieu, 'Ky and Thieu should produce identical Govern patronage');
  });

  it('clamps Young Turks Patronage bonus at the 75 cap', () => {
    const def = compileDef();
    const space = 'can-tho:none';

    const baseState = clearAllZones(initialState(def, 9014, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 30,
        patronage: 74,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('gov-cap-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-cap-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-cap-us-t', 'troops', 'US', { type: 'troops' }),
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

    const result = applyMoveWithResolvedDecisionIds(
      def,
      withActiveLeader(setup, 'youngTurks'),
      {
        actionId: asActionId('govern'),
        params: {
          $targetSpaces: [space],
          [`$governMode@${space}`]: 'patronage',
        },
      },
    ).state;

    assert.ok(
      globalVarNumber(result, 'patronage') <= 75,
      `Patronage should clamp at 75, got ${globalVarNumber(result, 'patronage')}`,
    );
  });

  it('applies Young Turks +2 Patronage even with cap_mandateOfHeaven shaded (1-space limit)', () => {
    const def = compileDef();
    const space = 'can-tho:none';

    const baseState = clearAllZones(initialState(def, 9015, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 30,
        patronage: 10,
      },
      globalMarkers: {
        ...baseState.globalMarkers,
        cap_mandateOfHeaven: 'shaded',
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('gov-mandate-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-mandate-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-mandate-us-t', 'troops', 'US', { type: 'troops' }),
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
          $targetSpaces: [space],
          [`$governMode@${space}`]: 'patronage',
        },
      }).state;

    const yt = runGovern('youngTurks');
    const baseline = runGovern('thieu');

    assert.equal(
      globalVarNumber(yt, 'patronage') - globalVarNumber(baseline, 'patronage'),
      2,
      'Young Turks +2 should apply even when Mandate of Heaven shaded restricts Govern to 1 space',
    );
  });

  it('stops Young Turks bonus after leader transition', () => {
    const def = compileDef();
    const space = 'can-tho:none';

    const baseState = clearAllZones(initialState(def, 9016, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        aid: 30,
        patronage: 10,
      },
      zones: {
        ...baseState.zones,
        [space]: [
          makeToken('gov-trans-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('gov-trans-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('gov-trans-us-t', 'troops', 'US', { type: 'troops' }),
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

    const ytResult = applyMoveWithResolvedDecisionIds(
      def,
      withActiveLeader(setup, 'youngTurks'),
      {
        actionId: asActionId('govern'),
        params: {
          $targetSpaces: [space],
          [`$governMode@${space}`]: 'patronage',
        },
      },
    ).state;

    const ytPatronage = globalVarNumber(ytResult, 'patronage');

    // Simulate leader transition: change leader to thieu on the same base setup
    const afterTransition = applyMoveWithResolvedDecisionIds(
      def,
      withActiveLeader(setup, 'thieu'),
      {
        actionId: asActionId('govern'),
        params: {
          $targetSpaces: [space],
          [`$governMode@${space}`]: 'patronage',
        },
      },
    ).state;

    const thieuPatronage = globalVarNumber(afterTransition, 'patronage');

    assert.equal(
      ytPatronage - thieuPatronage,
      2,
      'After leader transition from Young Turks, Govern should no longer receive +2 bonus',
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
          $targetSpaces: [space],
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

  it('verifies US Train pacification profile uses Ky-aware cost macro and leader check', () => {
    const { parsed } = compileProductionSpec();
    const profiles = parsed.doc.actionPipelines ?? [];
    const usTrainProfile = profiles.find((profile) => profile.id === 'train-us-profile');
    assert.ok(usTrainProfile, 'Expected train-us-profile in production spec');

    const macroCallNodes = findDeep(usTrainProfile, (node) =>
      node?.macro === 'rvn-leader-pacification-cost',
    );
    assert.ok(macroCallNodes.length >= 1, 'US Train profile should invoke rvn-leader-pacification-cost macro');

    const leaderComparisons = findDeep(usTrainProfile, (node) =>
      node?.op === '==' &&
      JSON.stringify(node?.left ?? {}).includes('activeLeader') &&
      node?.right === 'ky',
    );
    assert.ok(
      leaderComparisons.length >= 1,
      'US Train profile should check activeLeader == ky for cost modifier',
    );
  });

  it('applies Ky pacification cost for multiple levels at once (2 levels → 2 extra vs baseline)', () => {
    const def = compileDef();
    const space = 'qui-nhon:none';

    const runMultiPacify = (leader: LeaderState): GameState => {
      const baseState = clearAllZones(initialState(def, 9011, 4).state);
      const setup: GameState = {
        ...baseState,
        activePlayer: asPlayerId(1),
        globalVars: {
          ...baseState.globalVars,
          arvnResources: 30,
        },
        zones: {
          ...baseState.zones,
          [space]: [
            makeToken('multi-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('multi-arvn-p', 'police', 'ARVN', { type: 'police' }),
          ],
        },
        markers: {
          ...baseState.markers,
          [space]: {
            ...(baseState.markers[space] ?? {}),
            supportOpposition: 'passiveOpposition',
          },
        },
      };

      return applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('train'),
        params: {
          $targetSpaces: [space],
          $trainChoice: 'rangers',
          $subActionSpaces: [space],
          $subAction: 'pacify',
          $pacLevels: 2,
        },
      }).state;
    };

    const kyResult = runMultiPacify('ky');
    const thieuResult = runMultiPacify('thieu');
    assert.equal(
      globalVarNumber(thieuResult, 'arvnResources') - globalVarNumber(kyResult, 'arvnResources'),
      2,
      'Ky should cost 2 extra ARVN resources for 2 pacification levels (1 extra per level)',
    );
  });

  it('reverts pacification cost after leader transition from Ky to Thieu', () => {
    const def = compileDef();
    const space = 'qui-nhon:none';

    const runWithLeader = (leader: LeaderState): GameState => {
      const baseState = clearAllZones(initialState(def, 9012, 4).state);
      const setup: GameState = {
        ...baseState,
        activePlayer: asPlayerId(1),
        globalVars: {
          ...baseState.globalVars,
          arvnResources: 30,
        },
        zones: {
          ...baseState.zones,
          [space]: [
            makeToken('revert-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('revert-arvn-p', 'police', 'ARVN', { type: 'police' }),
          ],
        },
        markers: {
          ...baseState.markers,
          [space]: {
            ...(baseState.markers[space] ?? {}),
            supportOpposition: 'neutral',
          },
        },
      };

      return applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('train'),
        params: {
          $targetSpaces: [space],
          $trainChoice: 'rangers',
          $subActionSpaces: [space],
          $subAction: 'pacify',
          $pacLevels: 1,
        },
      }).state;
    };

    const kyResources = globalVarNumber(runWithLeader('ky'), 'arvnResources');
    const thieuResources = globalVarNumber(runWithLeader('thieu'), 'arvnResources');
    assert.equal(
      thieuResources - kyResources,
      1,
      'Switching from Ky to Thieu should save exactly 1 ARVN resource per pacification level',
    );
    assert.ok(
      thieuResources > kyResources,
      'Thieu should leave more ARVN resources than Ky after pacification',
    );
  });

  it('confirms Ky pacification with terror costs extra per terror AND per level (delta = 3 for 1 terror + 2 levels)', () => {
    const def = compileDef();
    const space = 'qui-nhon:none';

    const runTerrorMultiPacify = (leader: LeaderState): GameState => {
      const baseState = clearAllZones(initialState(def, 9013, 4).state);
      const setup: GameState = {
        ...baseState,
        activePlayer: asPlayerId(1),
        globalVars: {
          ...baseState.globalVars,
          arvnResources: 30,
        },
        zones: {
          ...baseState.zones,
          [space]: [
            makeToken('terror-multi-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('terror-multi-arvn-p', 'police', 'ARVN', { type: 'police' }),
          ],
        },
        markers: {
          ...baseState.markers,
          [space]: {
            ...(baseState.markers[space] ?? {}),
            supportOpposition: 'passiveOpposition',
          },
        },
        zoneVars: {
          ...baseState.zoneVars,
          [space]: {
            ...(baseState.zoneVars[space] ?? {}),
            terrorCount: 1,
          },
        },
      };

      return applyMoveWithResolvedDecisionIds(def, withActiveLeader(setup, leader), {
        actionId: asActionId('train'),
        params: {
          $targetSpaces: [space],
          $trainChoice: 'rangers',
          $subActionSpaces: [space],
          $subAction: 'pacify',
          $pacLevels: 2,
        },
      }).state;
    };

    const kyResult = runTerrorMultiPacify('ky');
    const thieuResult = runTerrorMultiPacify('thieu');
    assert.equal(
      globalVarNumber(thieuResult, 'arvnResources') - globalVarNumber(kyResult, 'arvnResources'),
      3,
      'Ky costs 1 extra per terror removal + 1 extra per each of 2 levels = 3 extra total',
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
      findDeep(node.forEach?.over ?? {}, (child) => child?.prop === 'faction' && child?.op === 'eq' && child?.value === 'ARVN').length > 0,
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

    const card129MinhCancel = findDeep(card129?.unshaded?.effects, (node) =>
      node?.setGlobalMarker?.marker === 'activeLeader' && node?.setGlobalMarker?.state === 'none',
    );
    assert.ok(
      card129MinhCancel.length >= 1,
      'Card 129 should conditionally cancel Minh (setGlobalMarker to none)',
    );
    const card130MinhCancel = findDeep(card130?.unshaded?.effects, (node) =>
      node?.setGlobalMarker?.marker === 'activeLeader' && node?.setGlobalMarker?.state === 'none',
    );
    assert.ok(
      card130MinhCancel.length >= 1,
      'Card 130 should conditionally cancel Minh (setGlobalMarker to none)',
    );

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

  it('includes none state in activeLeader globalMarkerLattice for Failed Attempt cancellation', () => {
    const def = compileDef();
    const lattice = def.globalMarkerLattices?.find((l) => l.id === 'activeLeader');
    assert.ok(lattice, 'Expected activeLeader globalMarkerLattice');
    assert.ok(
      lattice.states.includes('none'),
      'activeLeader lattice should include none state for Failed Attempt Minh cancellation',
    );
  });
});
