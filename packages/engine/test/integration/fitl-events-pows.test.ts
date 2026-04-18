// @test-class: architectural-invariant
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

const CARD_ID = 'card-40';
const AIR_STRIKE_TARGET = 'quang-tri-thua-thien:none';

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
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc',
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCardMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

describe('FITL card-40 PoWs', () => {
  it('encodes exact text and unshaded execute-as free Air Strike grant with after-grant casualty recovery', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'US', 'VC', 'ARVN']);
    assert.equal(card?.metadata?.flavorText, 'Release negotiations keep US at war.');
    assert.equal(card?.unshaded?.text, 'Free Air Strike. 2 US Troops from Casualties to Available.');
    assert.equal(card?.shaded?.text, '3 US Troops from Available to Casualties.');
    assert.equal(card?.unshaded?.effectTiming, 'afterGrants');
    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        seat: 'self',
        executeAsSeat: 'us',
        allowDuringMonsoon: true,
        sequence: { batch: 'pows-free-airstrike', step: 0 },
        operationClass: 'operation',
        actionIds: ['airStrike'],
      },
    ]);
  });

  it('unshaded grants free Air Strike to the executing faction as US, then moves exactly 2 US Troops Casualties->Available', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 40001, 2, 'nva', 'us', {
      [AIR_STRIKE_TARGET]: [
        makeToken('pows-us-t-1', 'troops', 'US'),
        makeToken('pows-vc-active-1', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      'casualties-US:none': [
        makeToken('pows-cas-us-1', 'troops', 'US'),
        makeToken('pows-cas-us-2', 'troops', 'US'),
        makeToken('pows-cas-us-3', 'troops', 'US'),
        makeToken('pows-cas-us-base', 'base', 'US'),
      ],
    });

    const eventMove = findCardMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected PoWs unshaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterEvent.length, 1);
    assert.equal(pendingAfterEvent[0]?.seat, 'nva');
    assert.equal(pendingAfterEvent[0]?.executeAsSeat, 'us');
    assert.deepEqual(pendingAfterEvent[0]?.actionIds, ['airStrike']);
    assert.equal(
      countTokens(afterEvent, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      3,
      'Casualty recovery should wait for free grant resolution (afterGrants)',
    );

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'nva',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirStrikeMove = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrikeMove, undefined, 'Expected free Air Strike legal move from PoWs grant');

    const final = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirStrikeMove!,
      params: { ...freeAirStrikeMove!.params, $spaces: [AIR_STRIKE_TARGET] },
    }).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'PoWs unshaded should move exactly 2 US Troops out of Casualties',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'PoWs unshaded should move exactly 2 US Troops into Available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'PoWs unshaded should not move US Bases',
    );
    assert.deepEqual(requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? [], []);
  });

  it('unshaded recovers all available US casualty troops when fewer than 2 exist and still grants to the executing seat', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 40002, 1, 'arvn', 'nva', {
      [AIR_STRIKE_TARGET]: [
        makeToken('pows-us-t-2', 'troops', 'US'),
        makeToken('pows-vc-active-2', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      'casualties-US:none': [
        makeToken('pows-cas-single-us-1', 'troops', 'US'),
        makeToken('pows-cas-single-us-base', 'base', 'US'),
      ],
    });

    const eventMove = findCardMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected PoWs unshaded event move');
    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterEvent[0]?.seat, 'arvn');
    assert.equal(pendingAfterEvent[0]?.executeAsSeat, 'us');

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'arvn',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };
    const freeAirStrikeMove = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrikeMove, undefined, 'Expected free Air Strike legal move from PoWs grant');

    const final = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirStrikeMove!,
      params: { ...freeAirStrikeMove!.params, $spaces: [AIR_STRIKE_TARGET] },
    }).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'PoWs unshaded should not move non-Troop US pieces from Casualties',
    );
  });

  it('shaded moves up to 3 US Troops Available->Casualties and ignores non-troop US pieces', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 40003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        'available-US:none': [
          makeToken('pows-av-us-1', 'troops', 'US'),
          makeToken('pows-av-us-2', 'troops', 'US'),
          makeToken('pows-av-us-base', 'base', 'US'),
        ],
      },
    };

    const shadedMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected PoWs shaded event move');
    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'PoWs shaded should move all available US Troops when fewer than 3 exist',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'PoWs shaded should move up to 3 US Troops into Casualties',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'PoWs shaded should not move US Bases',
    );
  });
});
