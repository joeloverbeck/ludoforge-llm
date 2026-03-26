import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import {
  clearAllZones,
  withNeutralSupportOppositionMarkers,
} from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-72';
const ACTIVE_OPPOSITION_A = 'hue:none';
const ACTIVE_OPPOSITION_B = 'quang-nam:none';
const PASSIVE_OPPOSITION_SPACE = 'quang-tin-quang-ngai:none';
const CENTRAL_LAOS = 'central-laos:none';
const SOUTHERN_LAOS = 'southern-laos:none';
const NORTHEAST_CAMBODIA = 'northeast-cambodia:none';
const FISHHOOK = 'the-fishhook:none';
const PARROTS_BEAK = 'the-parrots-beak:none';
const SIHANOUKVILLE = 'sihanoukville:none';

const makeToken = (id: string, type: string, faction: string, extra?: Readonly<Record<string, unknown>>): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extra ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findCard72Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-72 Body Count', () => {
  it('encodes exact card text, momentum flagging, and shaded selectors through generic event data', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Body Count');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'US', 'VC']);
    assert.equal(card?.metadata?.flavorText, 'Crossover point.');
    assert.equal(
      card?.unshaded?.text,
      'Until Coup, Assault and Patrol add +3 Aid per Guerrilla removed and cost 0. MOMENTUM',
    );
    assert.equal(
      card?.shaded?.text,
      "'If it's dead, it's VC': Place 1 VC Guerrilla in each Active Opposition space, 2 NVA Troops in each Laos/Cambodia space.",
    );
    assert.equal(card?.tags?.includes('momentum'), true);
    assert.deepEqual(card?.unshaded?.lastingEffects?.[0]?.setupEffects, tagEffectAsts([
      { setVar: { scope: 'global', var: 'mom_bodyCount', value: true } },
    ]));
    assert.deepEqual(card?.unshaded?.lastingEffects?.[0]?.teardownEffects, tagEffectAsts([
      { setVar: { scope: 'global', var: 'mom_bodyCount', value: false } },
    ]));

    const parsedCard = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(parsedCard, undefined, 'Expected parsed card-72 definition');

    const activeOppositionLoop = findDeep(parsedCard?.shaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { forEach?: { over?: { query?: string; filter?: Record<string, unknown> } } };
      return candidate.forEach?.over?.query === 'mapSpaces'
        && JSON.stringify(candidate.forEach.over.filter).includes('"marker":"supportOpposition"')
        && JSON.stringify(candidate.forEach.over.filter).includes('"right":"activeOpposition"');
    });
    const laosCambodiaLoop = findDeep(parsedCard?.shaded?.effects ?? [], (node: unknown) => {
      const candidate = node as { forEach?: { over?: { filter?: { conditionMacro?: string } } } };
      return candidate.forEach?.over?.filter?.conditionMacro === 'fitl-space-in-laos-cambodia';
    });

    assert.equal(activeOppositionLoop.length > 0, true, 'Expected shaded to iterate all Active Opposition spaces');
    assert.equal(laosCambodiaLoop.length > 0, true, 'Expected shaded to reuse fitl-space-in-laos-cambodia');
  });

  it('unshaded execution turns on the momentum flag immediately', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 72001, 4).state);
    assert.equal(base.turnOrderState.type, 'cardDriven');

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'arvn',
            secondEligible: 'nva',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
      },
    };

    const move = findCard72Move(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-72 unshaded move');

    const result = applyMove(def, state, move!).state;
    assert.equal(result.globalVars.mom_bodyCount, true, 'Body Count unshaded should activate the round momentum flag');
  });

  it('shaded places 1 VC guerrilla in each Active Opposition space and 2 NVA troops in each Laos/Cambodia space', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 72002, 4).state);

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [ACTIVE_OPPOSITION_A]: { ...(base.markers[ACTIVE_OPPOSITION_A] ?? {}), supportOpposition: 'activeOpposition' },
        [ACTIVE_OPPOSITION_B]: { ...(base.markers[ACTIVE_OPPOSITION_B] ?? {}), supportOpposition: 'activeOpposition' },
        [PASSIVE_OPPOSITION_SPACE]: { ...(base.markers[PASSIVE_OPPOSITION_SPACE] ?? {}), supportOpposition: 'passiveOpposition' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        'available-VC:none': [
          makeToken('body-count-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('body-count-vc-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'available-NVA:none': [
          makeToken('body-count-nva-1', 'troops', 'NVA'),
          makeToken('body-count-nva-2', 'troops', 'NVA'),
          makeToken('body-count-nva-3', 'troops', 'NVA'),
          makeToken('body-count-nva-4', 'troops', 'NVA'),
          makeToken('body-count-nva-5', 'troops', 'NVA'),
          makeToken('body-count-nva-6', 'troops', 'NVA'),
          makeToken('body-count-nva-7', 'troops', 'NVA'),
          makeToken('body-count-nva-8', 'troops', 'NVA'),
          makeToken('body-count-nva-9', 'troops', 'NVA'),
          makeToken('body-count-nva-10', 'troops', 'NVA'),
          makeToken('body-count-nva-11', 'troops', 'NVA'),
          makeToken('body-count-nva-12', 'troops', 'NVA'),
        ],
      },
    };

    const move = findCard72Move(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-72 shaded move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.equal(
      countTokens(result, ACTIVE_OPPOSITION_A, (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      1,
      'Shaded should place 1 VC Guerrilla in the first Active Opposition space',
    );
    assert.equal(
      countTokens(result, ACTIVE_OPPOSITION_B, (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      1,
      'Shaded should place 1 VC Guerrilla in the second Active Opposition space',
    );
    assert.equal(
      countTokens(result, PASSIVE_OPPOSITION_SPACE, (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      0,
      'Shaded must not place VC Guerrillas into non-Active-Opposition spaces',
    );

    for (const laosCambodiaSpace of [
      CENTRAL_LAOS,
      SOUTHERN_LAOS,
      NORTHEAST_CAMBODIA,
      FISHHOOK,
      PARROTS_BEAK,
      SIHANOUKVILLE,
    ]) {
      assert.equal(
        countTokens(result, laosCambodiaSpace, (token) => token.type === 'troops' && token.props.faction === 'NVA'),
        2,
        `Shaded should place 2 NVA Troops into ${laosCambodiaSpace}`,
      );
    }
    assert.equal(
      countTokens(result, 'available-NVA:none', (token) => token.type === 'troops' && token.props.faction === 'NVA'),
      0,
      'Shaded should consume all 12 available NVA Troops when six Laos/Cambodia spaces exist',
    );
  });

  it('shaded implements what it can when available VC guerrillas or NVA troops are insufficient', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 72003, 4).state);

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(3),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [ACTIVE_OPPOSITION_A]: { ...(base.markers[ACTIVE_OPPOSITION_A] ?? {}), supportOpposition: 'activeOpposition' },
        [ACTIVE_OPPOSITION_B]: { ...(base.markers[ACTIVE_OPPOSITION_B] ?? {}), supportOpposition: 'activeOpposition' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        'available-VC:none': [
          makeToken('body-count-few-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'available-NVA:none': [
          makeToken('body-count-few-nva-1', 'troops', 'NVA'),
          makeToken('body-count-few-nva-2', 'troops', 'NVA'),
          makeToken('body-count-few-nva-3', 'troops', 'NVA'),
          makeToken('body-count-few-nva-4', 'troops', 'NVA'),
          makeToken('body-count-few-nva-5', 'troops', 'NVA'),
        ],
      },
    };

    const move = findCard72Move(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-72 shaded move with limited pools');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    const totalVcPlaced = countTokens(
      result,
      ACTIVE_OPPOSITION_A,
      (token) => token.type === 'guerrilla' && token.props.faction === 'VC',
    ) + countTokens(
      result,
      ACTIVE_OPPOSITION_B,
      (token) => token.type === 'guerrilla' && token.props.faction === 'VC',
    );
    const totalNvaPlaced =
      countTokens(result, CENTRAL_LAOS, (token) => token.type === 'troops' && token.props.faction === 'NVA')
      + countTokens(result, SOUTHERN_LAOS, (token) => token.type === 'troops' && token.props.faction === 'NVA')
      + countTokens(result, NORTHEAST_CAMBODIA, (token) => token.type === 'troops' && token.props.faction === 'NVA')
      + countTokens(result, FISHHOOK, (token) => token.type === 'troops' && token.props.faction === 'NVA')
      + countTokens(result, PARROTS_BEAK, (token) => token.type === 'troops' && token.props.faction === 'NVA')
      + countTokens(result, SIHANOUKVILLE, (token) => token.type === 'troops' && token.props.faction === 'NVA');

    assert.equal(totalVcPlaced, 1, 'Shaded should place only the single available VC Guerrilla');
    assert.equal(totalNvaPlaced, 5, 'Shaded should place only the available NVA Troops across Laos/Cambodia');
    assert.equal(
      countTokens(result, 'available-VC:none', (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      0,
      'Shaded should consume the last available VC Guerrilla',
    );
    assert.equal(
      countTokens(result, 'available-NVA:none', (token) => token.type === 'troops' && token.props.faction === 'NVA'),
      0,
      'Shaded should consume the last available NVA Troop',
    );
  });
});
