import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMoveWithResolvedDecisionIds,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const CARD_ID = 'card-38';
const CENTRAL_LAOS = 'central-laos:none';
const NE_CAMBODIA = 'northeast-cambodia:none';
const NORTH_VIETNAM = 'north-vietnam:none';
const DA_NANG = 'da-nang:none';
const HUE = 'hue:none';
const CAN_THO = 'can-tho:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findMcNamaraMove = (def: GameDef, state: GameState) =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === 'unshaded'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const zoneHas = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => token.id === asTokenId(tokenId));

describe('FITL card-38 McNamara Line', () => {
  it('redeploys all US/ARVN forces from Laos/Cambodia provinces to COIN-controlled cities by executing-faction choice', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 38001, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        arvnResources: 8,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        [CENTRAL_LAOS]: [
          makeToken('mcn-us-t-laos', 'troops', 'US'),
          makeToken('mcn-arvn-p-laos', 'police', 'ARVN'),
          makeToken('mcn-nva-t-laos', 'troops', 'NVA'),
        ],
        [NE_CAMBODIA]: [
          makeToken('mcn-us-b-cam', 'base', 'US'),
          makeToken('mcn-arvn-r-cam', 'ranger', 'ARVN'),
          makeToken('mcn-vc-g-cam', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [NORTH_VIETNAM]: [
          makeToken('mcn-us-t-north-vietnam', 'troops', 'US'),
        ],
        [DA_NANG]: [
          makeToken('mcn-dn-us', 'troops', 'US'),
          makeToken('mcn-dn-arvn', 'police', 'ARVN'),
          makeToken('mcn-dn-nva', 'troops', 'NVA'),
        ],
        [HUE]: [
          makeToken('mcn-hue-arvn', 'troops', 'ARVN'),
          makeToken('mcn-hue-vc', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('mcn-hue-nva', 'troops', 'NVA'),
        ],
        [CAN_THO]: [
          makeToken('mcn-ct-us', 'troops', 'US'),
          makeToken('mcn-ct-nva-1', 'troops', 'NVA'),
          makeToken('mcn-ct-nva-2', 'troops', 'NVA'),
        ],
      },
    };

    const move = findMcNamaraMove(def, setup);
    assert.notEqual(move, undefined, 'Expected card-38 unshaded event move');

    const result = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(zoneHas(result, CENTRAL_LAOS, 'mcn-us-t-laos'), false);
    assert.equal(zoneHas(result, CENTRAL_LAOS, 'mcn-arvn-p-laos'), false);
    assert.equal(zoneHas(result, CENTRAL_LAOS, 'mcn-nva-t-laos'), true, 'NVA should not redeploy via card-38');

    assert.equal(zoneHas(result, NE_CAMBODIA, 'mcn-us-b-cam'), false);
    assert.equal(zoneHas(result, NE_CAMBODIA, 'mcn-arvn-r-cam'), false);
    assert.equal(zoneHas(result, NE_CAMBODIA, 'mcn-vc-g-cam'), true, 'VC should not redeploy via card-38');

    assert.equal(
      zoneHas(result, NORTH_VIETNAM, 'mcn-us-t-north-vietnam'),
      true,
      'North Vietnam is outside South but not "outside Vietnam" for this event',
    );

    assert.equal(zoneHas(result, DA_NANG, 'mcn-us-t-laos'), true);
    assert.equal(zoneHas(result, DA_NANG, 'mcn-arvn-p-laos'), true);
    assert.equal(zoneHas(result, DA_NANG, 'mcn-us-b-cam'), true);
    assert.equal(zoneHas(result, DA_NANG, 'mcn-arvn-r-cam'), true);
    assert.equal(zoneHas(result, HUE, 'mcn-arvn-p-laos'), false);
    assert.equal(zoneHas(result, HUE, 'mcn-us-b-cam'), false);
    const movedPieceIds = ['mcn-us-t-laos', 'mcn-arvn-p-laos', 'mcn-us-b-cam', 'mcn-arvn-r-cam'] as const;
    const anyMovedPieceInCanTho = movedPieceIds.some((tokenId) => zoneHas(result, CAN_THO, tokenId));
    assert.equal(anyMovedPieceInCanTho, false, 'Redeployed pieces must end only in COIN-controlled cities');

    assert.equal(result.globalVars.arvnResources, 0, 'ARVN Resources should drop by 12 with floor at 0');
    assert.equal(result.globalVars.mom_mcnamaraLine, true, 'McNamara momentum should become active');
  });

  it('still applies ARVN -12 and momentum when no city is COIN-controlled, without redeploying pieces', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 38002, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        arvnResources: 20,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        [CENTRAL_LAOS]: [
          makeToken('mcn2-us-t-laos', 'troops', 'US'),
        ],
        [NE_CAMBODIA]: [
          makeToken('mcn2-arvn-b-cam', 'base', 'ARVN'),
        ],
        [DA_NANG]: [
          makeToken('mcn2-dn-us', 'troops', 'US'),
          makeToken('mcn2-dn-nva-1', 'troops', 'NVA'),
          makeToken('mcn2-dn-nva-2', 'troops', 'NVA'),
        ],
        [HUE]: [
          makeToken('mcn2-hue-vc', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('mcn2-hue-nva', 'troops', 'NVA'),
        ],
      },
    };

    const move = findMcNamaraMove(def, setup);
    assert.notEqual(move, undefined, 'Expected card-38 unshaded event move');

    const result = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(zoneHas(result, CENTRAL_LAOS, 'mcn2-us-t-laos'), true, 'No legal destination city should leave piece in place');
    assert.equal(zoneHas(result, NE_CAMBODIA, 'mcn2-arvn-b-cam'), true, 'No legal destination city should leave piece in place');
    assert.equal(result.globalVars.arvnResources, 8);
    assert.equal(result.globalVars.mom_mcnamaraLine, true);
  });
});
