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
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-54';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
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
  eligibility: Readonly<Record<'us' | 'arvn' | 'nva' | 'vc', boolean>>,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
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
        seatOrder: ['nva', 'vc', 'us', 'arvn'],
        eligibility,
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

const findSonTayMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

describe('FITL card-54 Son Tay', () => {
  it('encodes exact rules text, immediate US eligibility, and next-card ineligibility windows', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);
    assert.equal(card?.unshaded?.text, '2 Troop Casualties to Available. NVA Ineligible through next card. US Eligible.');
    assert.equal(card?.shaded?.text, 'Any 2 Casualties out of play. US Ineligible through next card.');
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'us' }, eligible: true, windowId: 'make-eligible-now' },
      { target: { kind: 'seat', seat: 'nva' }, eligible: false, windowId: 'make-ineligible' },
    ]);
    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'us' }, eligible: false, windowId: 'make-ineligible' },
    ]);
  });

  it('unshaded recovers up to 2 US troop casualties immediately, makes US current-card eligible, and queues NVA next-card ineligibility', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 54001, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'casualties-US:none': [
        makeToken('son-tay-us-t-1', 'troops', 'US'),
        makeToken('son-tay-us-t-2', 'troops', 'US'),
        makeToken('son-tay-us-base', 'base', 'US'),
      ],
    });

    const move = findSonTayMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Son Tay unshaded event move');

    const result = applyMove(def, setup, move!);
    const final = result.state;
    const runtime = requireCardDrivenRuntime(final);

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Son Tay unshaded should move exactly 2 US troop casualties to Available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Son Tay unshaded should empty the available troop casualties budget',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'Son Tay unshaded must not move non-troop US casualties',
    );
    assert.deepEqual(runtime.eligibility, { us: true, arvn: false, nva: true, vc: true });
    assert.equal(runtime.currentCard.firstEligible, 'vc');
    assert.equal(runtime.currentCard.secondEligible, 'us');
    assert.equal(final.activePlayer, asPlayerId(3));
    assert.deepEqual(runtime.pendingEligibilityOverrides ?? [], [
      { seat: 'nva', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
    ]);

    const overrideCreate = result.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    );
    assert.deepEqual(
      (overrideCreate as { overrides?: readonly unknown[] } | undefined)?.overrides,
      [
        { seat: 'us', eligible: true, windowId: 'make-eligible-now', duration: 'turn' },
        { seat: 'nva', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
      ],
    );
  });

  it('unshaded implements what it can when fewer than 2 US troop casualties exist and ignores non-troops', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 54002, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'casualties-US:none': [
        makeToken('son-tay-single-troop', 'troops', 'US'),
        makeToken('son-tay-irregular', 'irregular', 'US'),
        makeToken('son-tay-base', 'base', 'US'),
      ],
    });

    const move = findSonTayMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Son Tay unshaded event move');
    const final = applyMove(def, setup, move!).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'irregular'),
      1,
      'Son Tay unshaded should not move irregular casualties',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'Son Tay unshaded should not move base casualties',
    );
  });

  it('shaded moves any chosen 2 US casualties out of play and queues US next-card ineligibility', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 54003, 2, {
      us: true,
      arvn: false,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'casualties-US:none': [
        makeToken('son-tay-shaded-troop', 'troops', 'US'),
        makeToken('son-tay-shaded-irregular', 'irregular', 'US'),
        makeToken('son-tay-shaded-base', 'base', 'US'),
      ],
    });

    const move = findSonTayMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Son Tay shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$casualtiesToOutOfPlay',
          value: [asTokenId('son-tay-shaded-irregular'), asTokenId('son-tay-shaded-base')],
        },
      ],
    }).state;
    const runtime = requireCardDrivenRuntime(final);

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.id === asTokenId('son-tay-shaded-irregular')),
      1,
    );
    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.id === asTokenId('son-tay-shaded-base')),
      1,
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.id === asTokenId('son-tay-shaded-troop')),
      1,
      'Unselected casualty should remain in the casualties box',
    );
    assert.deepEqual(runtime.pendingEligibilityOverrides ?? [], [
      { seat: 'us', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
    ]);
    assert.deepEqual(runtime.eligibility, { us: true, arvn: false, nva: true, vc: true });
    assert.equal(runtime.currentCard.firstEligible, 'vc');
    assert.equal(runtime.currentCard.secondEligible, 'us');
  });
});
