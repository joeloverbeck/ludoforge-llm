import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, asPlayerId, asTokenId, initialState, legalMoves, type GameState, type Token } from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
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
    const secondSpace = ATTACK_SPACE;

    const airStrikeProfile = parsed.doc.actionPipelines?.find((profile) => profile.id === 'air-strike-profile');
    assert.ok(airStrikeProfile, 'Expected air-strike-profile in parsed production doc');
    const selectSpacesStage = airStrikeProfile.stages.find((stage) => stage.stage === 'select-spaces');
    const stageEffects = (selectSpacesStage?.effects ?? []) as Array<{ chooseN?: { max?: unknown } }>;
    const selectChooseN = stageEffects[0]?.chooseN;
    assert.ok(selectChooseN, 'Expected chooseN selector in Air Strike select-spaces stage');
    assert.equal(typeof selectChooseN?.max, 'object', 'Expected expression-valued chooseN.max in Air Strike select stage');
    assert.equal(
      JSON.stringify(selectChooseN?.max).includes('mom_wildWeasels'),
      false,
      'Wild Weasels should not change Air Strike selected-space cap',
    );

    const base = withActivePlayer(
      {
        ...initialState(def, 9101, 4).state,
        globalVars: {
          ...initialState(def, 9101, 4).state.globalVars,
          trail: 2,
        },
        zones: {
          ...initialState(def, 9101, 4).state.zones,
          [space]: [
            makeToken('ww-us', 'troops', 'US', { type: 'troops' }),
            makeToken('ww-nva-g1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-nva-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-nva-g3', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-vc-g4', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          ],
          [secondSpace]: [
            makeToken('ww-us-2', 'troops', 'US', { type: 'troops' }),
            makeToken('ww-vc-g5', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
            makeToken('ww-vc-g6', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
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

    const multiSpaceWithWildWeasels = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_wildWeasels: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space, secondSpace],
        $degradeTrail: 'yes',
      },
    }).state;

    const removedAcrossBothSpaces = (
      countEnemyGuerrillas(base, space)
      + countEnemyGuerrillas(base, secondSpace)
    ) - (
      countEnemyGuerrillas(multiSpaceWithWildWeasels, space)
      + countEnemyGuerrillas(multiSpaceWithWildWeasels, secondSpace)
    );
    assert.equal(removedAcrossBothSpaces, 1, 'Wild Weasels should remove only 1 piece total even across multiple selected spaces');
    assert.equal(multiSpaceWithWildWeasels.globalVars.trail, 2, 'Wild Weasels should block Trail degrade whenever any removal spaces are selected');

    const degradeOnly = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_wildWeasels: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(degradeOnly.globalVars.trail, 1, 'Wild Weasels should still allow Trail degrade when no removal spaces are selected');
  });

  it('card-5 unshaded removes shaded SA-2s only when executed, otherwise applies fallback penalty', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

    const base = withActivePlayer(
      {
        ...clearAllZones(initialState(def, 9110, 4).state),
        zones: {
          ...clearAllZones(initialState(def, 9110, 4).state).zones,
          [eventDeck!.discardZone]: [makeToken('card-5', 'card', 'none')],
        },
        globalVars: {
          ...initialState(def, 9110, 4).state.globalVars,
          trail: 3,
          nvaResources: 15,
        },
      },
      0,
    );

    const eventMove = legalMoves(def, base).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(eventMove, undefined, 'Expected card-5 unshaded event move');

    const withSa2sShaded: GameState = {
      ...base,
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        cap_sa2s: 'shaded',
      },
    };
    const removedSa2s = applyMoveWithResolvedDecisionIds(def, withSa2sShaded, eventMove!).state;
    assert.equal(removedSa2s.globalMarkers?.cap_sa2s, 'inactive', 'card-5 unshaded should cancel shaded SA-2s immediately');
    assert.equal(removedSa2s.globalVars.trail, 3, 'card-5 unshaded should not degrade Trail when shaded SA-2s are removed');
    assert.equal(removedSa2s.globalVars.nvaResources, 15, 'card-5 unshaded should not change NVA Resources when shaded SA-2s are removed');

    const withSa2sUnshaded: GameState = {
      ...base,
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        cap_sa2s: 'unshaded',
      },
    };
    const fallbackFromUnshadedSa2s = applyMoveWithResolvedDecisionIds(def, withSa2sUnshaded, eventMove!).state;
    assert.equal(fallbackFromUnshadedSa2s.globalMarkers?.cap_sa2s, 'unshaded', 'card-5 unshaded should not remove non-shaded SA-2s');
    assert.equal(fallbackFromUnshadedSa2s.globalVars.trail, 1, 'card-5 unshaded fallback should degrade Trail by 2');
    assert.equal(fallbackFromUnshadedSa2s.globalVars.nvaResources, 6, 'card-5 unshaded fallback should reduce NVA Resources by 9');
  });

  it('ADSID applies -6 NVA Resources when Trail changes and does not trigger without Trail change', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const base = withActivePlayer(
      {
        ...initialState(def, 9102, 4).state,
        globalVars: {
          ...initialState(def, 9102, 4).state.globalVars,
          trail: 2,
          nvaResources: 10,
        },
      },
      0,
    );

    const changedBaseline = applyMoveWithResolvedDecisionIds(def, base, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'yes',
      },
    }).state;

    const changed = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_adsid: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(changed.globalVars.trail, 1);
    assert.equal(
      changed.globalVars.nvaResources,
      Number(changedBaseline.globalVars.nvaResources) - 6,
      'ADSID should deduct an additional 6 resources when Trail changes',
    );

    const unchangedBaseline = applyMoveWithResolvedDecisionIds(def, base, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'no',
      },
    }).state;

    const unchanged = applyMoveWithResolvedDecisionIds(def, withMom(base, { mom_adsid: true }), {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(unchanged.globalVars.trail, base.globalVars.trail);
    assert.equal(
      unchanged.globalVars.nvaResources,
      Number(unchangedBaseline.globalVars.nvaResources),
      'ADSID should not change resources when Trail is unchanged',
    );

    const baseNva = withActivePlayer(
      {
        ...initialState(def, 9102, 4).state,
        globalVars: {
          ...initialState(def, 9102, 4).state.globalVars,
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

    const clearedForCoup = clearAllZones(initialState(def, 9102, 4).state);
    const coupBase: GameState = {
      ...clearedForCoup,
      currentPhase: asPhaseId('coupResources'),
      activePlayer: asPlayerId(0),
      globalVars: {
        ...clearedForCoup.globalVars,
        trail: 3,
        nvaResources: 20,
      },
      zones: {
        ...clearedForCoup.zones,
        'played:none': [{ id: asTokenId('adsid-coup-played'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('adsid-coup-lookahead'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('adsid-coup-deck'), type: 'card', props: { isCoup: false } }],
        [CENTRAL_LAOS]: [makeToken('adsid-coup-us', 'troops', 'US', { type: 'troops' })],
      },
    };
    const coupChangedBaseline = applyMoveWithResolvedDecisionIds(def, coupBase, {
      actionId: asActionId('coupResourcesResolve'),
      params: {},
    }).state;
    const coupChanged = applyMoveWithResolvedDecisionIds(def, withMom(coupBase, { mom_adsid: true }), {
      actionId: asActionId('coupResourcesResolve'),
      params: {},
    }).state;

    assert.equal(coupChangedBaseline.currentPhase, asPhaseId('coupSupport'));
    assert.equal(coupChanged.currentPhase, asPhaseId('coupSupport'));
    assert.equal(coupChanged.globalVars.trail, 2, 'Coup sequence should degrade Trail by 1 when Laos/Cambodia is COIN-controlled');
    assert.equal(
      coupChanged.globalVars.nvaResources,
      Number(coupChangedBaseline.globalVars.nvaResources) - 6,
      'ADSID should trigger from coup-round Trail change',
    );

    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');
    const clearedForEvent = clearAllZones(initialState(def, 9110, 4).state);
    const eventBase = withActivePlayer(
      {
        ...clearedForEvent,
        zones: {
          ...clearedForEvent.zones,
          [eventDeck!.discardZone]: [makeToken('card-5', 'card', 'none')],
        },
        globalVars: {
          ...clearedForEvent.globalVars,
          trail: 3,
          nvaResources: 15,
        },
        globalMarkers: {
          cap_sa2s: 'unshaded',
        },
      },
      0,
    );
    const card5UnshadedMove = legalMoves(def, eventBase).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(card5UnshadedMove, undefined, 'Expected card-5 unshaded event move');

    const eventChangedBaseline = applyMoveWithResolvedDecisionIds(def, eventBase, card5UnshadedMove!).state;
    const eventChanged = applyMoveWithResolvedDecisionIds(
      def,
      withMom(eventBase, { mom_adsid: true }),
      card5UnshadedMove!,
    ).state;

    assert.equal(eventChanged.globalVars.trail, 1, 'card-5 fallback should still degrade Trail by 2');
    assert.equal(
      eventChanged.globalVars.nvaResources,
      Number(eventChangedBaseline.globalVars.nvaResources) - 6,
      'ADSID should trigger from Trail changes caused by Events',
    );
  });

  it('Claymores removes 1 guerrilla from each activated marching group', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const mover = asTokenId('clay-march-g');
    const state = withActivePlayer(
      {
        ...initialState(def, 9103, 4).state,
        globalVars: {
          ...initialState(def, 9103, 4).state.globalVars,
          nvaResources: 8,
        },
        zones: {
          ...initialState(def, 9103, 4).state.zones,
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
        [`$movingGuerrillas@${LOC_SPACE}`]: [mover],
        [`$movingTroops@${LOC_SPACE}`]: [],
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
        ...initialState(def, 9104, 4).state,
        zones: {
          ...initialState(def, 9104, 4).state.zones,
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
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('Body Count makes ARVN Assault/Patrol cost-eligible at 0 resources and awards +3 Aid on ARVN Assault removals', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const assaultSpace = 'quang-tin-quang-ngai:none';
    const assaultState = withActivePlayer(
      {
        ...initialState(def, 9105, 4).state,
        globalVars: {
          ...initialState(def, 9105, 4).state.globalVars,
          arvnResources: 0,
          aid: 12,
        },
        zones: {
          ...initialState(def, 9105, 4).state.zones,
          [assaultSpace]: [
            makeToken('bodycount-arvn-assault', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('bodycount-arvn-assault-2', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('bodycount-vc-guerrilla', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          ],
        },
      },
      1,
    );

    const assaultWithoutBodyCount = legalMoves(def, assaultState).some((move) => move.actionId === asActionId('assault'));
    const assaultWithBodyCountState = withMom(assaultState, { mom_bodyCount: true });
    const assaultWithBodyCount = legalMoves(def, assaultWithBodyCountState).some((move) => move.actionId === asActionId('assault'));
    assert.equal(assaultWithoutBodyCount, false, 'ARVN Assault should be unavailable at 0 resources without Body Count');
    assert.equal(assaultWithBodyCount, true, 'ARVN Assault should become available at 0 resources with Body Count');

    const assaultBeforeAid = Number(assaultWithBodyCountState.globalVars.aid ?? 0);
    const assaultFinal = applyMoveWithResolvedDecisionIds(def, assaultWithBodyCountState, {
      actionId: asActionId('assault'),
      params: {
        targetSpaces: [assaultSpace],
        $arvnFollowupSpaces: [],
      },
    }).state;
    assert.equal(assaultFinal.globalVars.aid, assaultBeforeAid + 3, 'Body Count should add +3 Aid on ARVN Assault removals');

    const patrolState = withActivePlayer(
      {
        ...initialState(def, 9106, 4).state,
        globalVars: {
          ...initialState(def, 9106, 4).state.globalVars,
          arvnResources: 0,
        },
        zones: {
          ...initialState(def, 9106, 4).state.zones,
          [RALLY_SPACE]: [
            makeToken('bodycount-arvn-patrol', 'troops', 'ARVN', { type: 'troops' }),
          ],
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
  });
});
