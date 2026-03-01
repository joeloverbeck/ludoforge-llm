import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const NORTH_VIETNAM = 'north-vietnam:none';
const SOUTH_PROVINCE = 'quang-tri-thua-thien:none';
const CENTRAL_LAOS = 'central-laos:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string>>,
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

const countTokens = (
  state: GameState,
  zone: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-6 Aces', () => {
  it('unshaded grants an Aces-window free Air Strike: exactly 1 outside-South province, 6-hit strike, and total Trail degrade of 2', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected first event deck');

    const base = clearAllZones(initialState(def, 6101, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...base.globalVars,
        trail: 3,
      },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'US',
            secondEligible: 'NVA',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken('card-6', 'card', 'none')],
        [NORTH_VIETNAM]: [
          makeToken('nva-t-1', 'troops', 'NVA'),
          makeToken('nva-t-2', 'troops', 'NVA'),
          makeToken('nva-t-3', 'troops', 'NVA'),
          makeToken('nva-t-4', 'troops', 'NVA'),
          makeToken('nva-t-5', 'troops', 'NVA'),
          makeToken('vc-g-a-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-g-a-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [SOUTH_PROVINCE]: [
          makeToken('vc-g-south', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    };

    assert.equal(
      countTokens(setup, NORTH_VIETNAM, (token) => token.props.faction === 'US' || token.props.faction === 'ARVN'),
      0,
      'Setup sanity: selected Aces target must have no US/ARVN pieces',
    );

    const eventMove = legalMoves(def, setup).find(
      (move) =>
        String(move.actionId) === 'event' &&
        move.params.eventCardId === 'card-6' &&
        move.params.side === 'unshaded',
    );
    assert.notEqual(eventMove, undefined, 'Expected card-6 unshaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterEvent.length, 1, 'Aces should queue exactly one free operation grant');
    assert.equal(pendingAfterEvent[0]?.seat, 'US', 'Aces grant must belong to US seat');
    assert.deepEqual(pendingAfterEvent[0]?.actionIds, ['airStrike']);
    assert.equal(afterEvent.globalVars.trail, 3, 'Aces Trail degrade is deferred until free grant resolution');
    assert.equal(afterEvent.globalVars.fitl_acesAirStrikeWindow, true, 'Aces targeting window should be enabled');

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'US',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirStrike = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrike, undefined, 'Expected free Air Strike legal move during Aces window');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeAirStrike!,
          params: { ...freeAirStrike!.params, spaces: [SOUTH_PROVINCE] },
        }),
      /Illegal move|outside options domain|cardinality mismatch|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'Aces must reject South Vietnam targets',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeAirStrike!,
          params: { ...freeAirStrike!.params, spaces: [NORTH_VIETNAM, CENTRAL_LAOS] },
        }),
      /Illegal move|outside options domain|cardinality mismatch|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'Aces must enforce exactly one target space',
    );

    const afterFreeStrike = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirStrike!,
      params: { ...freeAirStrike!.params, spaces: [NORTH_VIETNAM] },
    }).state;

    assert.equal(
      countTokens(
        afterFreeStrike,
        NORTH_VIETNAM,
        (token) => token.props.faction === 'NVA' || token.props.faction === 'VC',
      ),
      1,
      'Aces free Air Strike should remove at most 6 enemy pieces from the selected space',
    );
    assert.equal(afterFreeStrike.globalVars.trail, 1, 'Aces should degrade Trail by 2 boxes total (not 3)');
    assert.equal(
      afterFreeStrike.globalVars.fitl_acesAirStrikeWindow,
      false,
      'Aces targeting window should close after grant resolution',
    );
    assert.deepEqual(
      requireCardDrivenRuntime(afterFreeStrike).pendingFreeOperationGrants ?? [],
      [],
      'Aces free operation grant should be consumed',
    );
  });

  it('shaded moves up to 2 Available US Troops to Casualties and improves Trail by 2 (capped by track max)', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected first event deck');

    const base = clearAllZones(initialState(def, 6102, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        trail: 3,
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken('card-6', 'card', 'none')],
        'available-US:none': [
          makeToken('us-t-1', 'troops', 'US'),
          makeToken('us-t-2', 'troops', 'US'),
          makeToken('us-t-3', 'troops', 'US'),
          makeToken('us-base-1', 'base', 'US'),
        ],
      },
    };

    const shadedMove = legalMoves(def, setup).find(
      (move) =>
        String(move.actionId) === 'event' &&
        move.params.eventCardId === 'card-6' &&
        move.params.side === 'shaded',
    );
    assert.notEqual(shadedMove, undefined, 'Expected card-6 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Shaded Aces should move only 2 US troops out of Available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Shaded Aces should add 2 US troops to Casualties',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'Shaded Aces should not move US bases',
    );
    assert.equal(final.globalVars.trail, 4, 'Shaded Aces should improve Trail by 2 up to the max track value');
  });
});
