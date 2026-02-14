import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, initialState, legalMoves, type GameState, type Token } from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const LOC_SPACE = 'loc-hue-da-nang:none';
const RALLY_SPACE = 'quang-nam:none';
const ATTACK_SPACE = 'quang-tri-thua-thien:none';
const CENTRAL_LAOS = 'central-laos:none';
const SOUTHERN_LAOS = 'southern-laos:none';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
  turnOrderState: { type: 'roundRobin' },
});

const withMom = (state: GameState, vars: Record<string, boolean>): GameState => ({
  ...state,
  globalVars: {
    ...state.globalVars,
    ...vars,
  },
});

const countEnemyGuerrillas = (state: GameState, zone: string): number =>
  (state.zones[zone] ?? []).filter((token) => token.type === 'guerrilla' && (token.props.faction === 'NVA' || token.props.faction === 'VC')).length;

describe('FITL momentum formula modifiers', () => {
  it('Wild Weasels limits Air Strike removal to 1 and enforces degrade-vs-remove behavior', () => {
    const { parsed, compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = RALLY_SPACE;

    const airStrikeProfile = parsed.doc.actionPipelines?.find((profile) => profile.id === 'air-strike-profile');
    assert.ok(airStrikeProfile, 'Expected air-strike-profile in parsed production doc');
    const selectSpacesStage = airStrikeProfile.stages.find((stage) => stage.stage === 'select-spaces');
    const stageEffects = (selectSpacesStage?.effects ?? []) as Array<{ chooseN?: { max?: unknown } }>;
    const selectChooseN = stageEffects[0]?.chooseN;
    assert.ok(selectChooseN, 'Expected chooseN selector in Air Strike select-spaces stage');
    assert.equal(typeof selectChooseN?.max, 'object', 'Expected expression-valued chooseN.max in Air Strike select stage');

    const base = withActivePlayer(
      {
        ...initialState(def, 9101, 2),
        globalVars: {
          ...initialState(def, 9101, 2).globalVars,
          trail: 2,
        },
        zones: {
          ...initialState(def, 9101, 2).zones,
          [space]: [
            makeToken('ww-us', 'troops', 'US', { type: 'troops' }),
            makeToken('ww-nva-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-nva-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-nva-g3', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-vc-g4', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          ],
        },
      },
      0,
    );

    const withoutMomentum = applyMoveWithResolvedDecisionIds(def, base, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(withoutMomentum.globalVars.trail, 1, 'Baseline Air Strike should degrade Trail when requested');

    const withWildWeasels = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_wildWeasels: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(withWildWeasels.globalVars.trail, 2, 'Wild Weasels should block Trail degrade when a removal space is selected');
    assert.equal(countEnemyGuerrillas(base, space) - countEnemyGuerrillas(withWildWeasels, space), 1, 'Wild Weasels should remove exactly 1 guerrilla');

    const degradeOnly = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_wildWeasels: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(degradeOnly.globalVars.trail, 1, 'Wild Weasels should still allow Trail degrade when no removal spaces are selected');
  });

  it('ADSID applies -6 NVA Resources when Trail changes and does not trigger without Trail change', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const base = withActivePlayer(
      {
        ...initialState(def, 9102, 2),
        globalVars: {
          ...initialState(def, 9102, 2).globalVars,
          trail: 2,
          nvaResources: 10,
        },
      },
      0,
    );

    const changed = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_adsid: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(changed.globalVars.trail, 1);
    assert.equal(changed.globalVars.nvaResources, 4, 'ADSID should deduct 6 resources on Trail change');

    const unchanged = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_adsid: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(unchanged.globalVars.trail, 2);
    assert.equal(unchanged.globalVars.nvaResources, 10, 'ADSID should not trigger when Trail is unchanged');

    const baseNva = withActivePlayer(
      {
        ...initialState(def, 9102, 4),
        globalVars: {
          ...initialState(def, 9102, 4).globalVars,
          trail: 2,
          nvaResources: 10,
        },
      },
      2,
    );

    const multiChange = applyMoveWithResolvedDecisionIds(def, withMom(baseNva, { mom_adsid: true }), {
      actionId: asActionId('rally'),
      params: {
        targetSpaces: [],
        $improveTrail: 'yes',
        $trailImproveSpaces: [CENTRAL_LAOS, SOUTHERN_LAOS],
      },
    }).state;

    assert.equal(multiChange.globalVars.trail, 4, 'Two Trail improvements should resolve deterministically in one action');
    assert.equal(multiChange.globalVars.nvaResources, 0, 'ADSID should apply once per Trail change (2 changes => -12 resources)');
  });

  it('Claymores removes 1 guerrilla from each activated marching group', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('clay-march-g');
    const state = withActivePlayer(
      {
        ...initialState(def, 9103, 4),
        globalVars: {
          ...initialState(def, 9103, 4).globalVars,
          nvaResources: 8,
        },
        zones: {
          ...initialState(def, 9103, 4).zones,
          [RALLY_SPACE]: [
            {
              id: mover,
              type: 'guerrilla',
              props: { faction: 'NVA', type: 'guerrilla', activity: 'underground' },
            },
          ],
          [LOC_SPACE]: [
            makeToken('clay-us-1', 'troops', 'US', { type: 'troops' }),
            makeToken('clay-us-2', 'troops', 'US', { type: 'troops' }),
            makeToken('clay-us-3', 'troops', 'US', { type: 'troops' }),
          ],
        },
      },
      2,
    );

    const result = applyMoveWithResolvedDecisionIds(def, withMom(state, { mom_claymores: true }), {
      actionId: asActionId('march'),
      params: {
        targetSpaces: [LOC_SPACE],
        chainSpaces: [],
        $movingGuerrillas: [mover],
        $movingTroops: [],
      },
    }).state;

    const moved = (result.zones[LOC_SPACE] ?? []).find((token) => token.id === mover);
    assert.equal(moved, undefined, 'Claymores should remove the activated marching guerrilla');
  });

  it('559th Transport Group caps Infiltrate target spaces to 1', () => {
    const { parsed, compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const first = RALLY_SPACE;
    const second = ATTACK_SPACE;
    const base = withActivePlayer(
      {
        ...initialState(def, 9104, 4),
        zones: {
          ...initialState(def, 9104, 4).zones,
          [first]: [makeToken('inf559-base-1', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' })],
          [second]: [makeToken('inf559-base-2', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' })],
        },
      },
      2,
    );

    const infiltrateProfile = parsed.doc.actionPipelines?.find((profile) => profile.id === 'infiltrate-profile');
    assert.ok(infiltrateProfile, 'Expected infiltrate-profile in parsed production doc');
    const has559LimitBranch = JSON.stringify(infiltrateProfile.stages[0]?.effects ?? []).includes('mom_559thTransportGrp');
    assert.equal(has559LimitBranch, true, 'Expected mom_559thTransportGrp max-space branch in infiltrate select stage');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_559thTransportGrp: true }), {
          actionId: asActionId('infiltrate'),
          params: {
            targetSpaces: [first, second],
            [`$infiltrateMode@${first}`]: 'build-up',
            [`$infiltrateMode@${second}`]: 'build-up',
            [`$infiltrateGuerrillasToReplace@${first}`]: [],
            [`$infiltrateGuerrillasToReplace@${second}`]: [],
          },
        }),
      /Illegal move/,
    );
  });

  it('Body Count makes ARVN Assault/Patrol cost-eligible at 0 resources and wires +3 Aid macro', () => {
    const { parsed, compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const assaultProfile = parsed.doc.actionPipelines?.find((profile) => profile.id === 'assault-arvn-profile');
    assert.ok(assaultProfile, 'Expected assault-arvn-profile in parsed production doc');
    assert.equal(
      JSON.stringify(assaultProfile.legality).includes('mom_bodyCount'),
      true,
      'Expected Body Count legality override on ARVN Assault',
    );
    assert.equal(
      JSON.stringify(assaultProfile.stages).includes('mom-body-count-award-aid'),
      true,
      'Expected Body Count aid macro in ARVN Assault resolution',
    );

    const patrolState = withActivePlayer(
      {
        ...initialState(def, 9106, 2),
        globalVars: {
          ...initialState(def, 9106, 2).globalVars,
          arvnResources: 0,
        },
      },
      1,
    );

    const withoutBodyCount = legalMoves(def, patrolState).some((move) => move.actionId === asActionId('patrol'));
    const withBodyCount = legalMoves(def, withMom(patrolState, { mom_bodyCount: true })).some(
      (move) => move.actionId === asActionId('patrol'),
    );
    assert.equal(withoutBodyCount, false, 'ARVN Patrol should be unavailable at 0 resources without Body Count');
    assert.equal(withBodyCount, true, 'ARVN Patrol should become available at 0 resources with Body Count');

    const patrolProfile = parsed.doc.actionPipelines?.find((profile) => profile.id === 'patrol-arvn-profile');
    assert.ok(patrolProfile, 'Expected patrol-arvn-profile in parsed production doc');
    assert.equal(
      JSON.stringify(patrolProfile.stages).includes('mom-body-count-award-aid'),
      true,
      'Expected Body Count aid macro in ARVN Patrol free-assault resolution',
    );
  });
});
