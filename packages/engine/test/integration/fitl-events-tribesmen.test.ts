import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-29';
const SPACE_WITH_IRREG_A = 'quang-tri-thua-thien:none';
const SPACE_WITH_IRREG_B = 'quang-nam:none';
const SPACE_WITHOUT_IRREG = 'tay-ninh:none';
const NEUTRAL_HIGHLAND = 'binh-dinh:none';
const NON_NEUTRAL_HIGHLAND = 'khanh-hoa:none';

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

const hasToken = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => String((token as Token).id) === tokenId);

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const findCard29Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.eventCardId === CARD_ID &&
      move.params.side === side,
  );

const setupEventState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly patronage?: number;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, 2901, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      patronage: overrides.patronage ?? 12,
    },
    markers: {
      ...base.markers,
      ...(overrides.markers ?? {}),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(overrides.zoneTokens ?? {}),
    },
  };
};

describe('FITL card-29 Tribesmen', () => {
  it('encodes exact text and seat order metadata', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'Tribesmen');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.equal(
      card?.unshaded?.text,
      'Remove any 4 Insurgent pieces total from spaces with Irregulars.',
    );
    assert.equal(
      card?.shaded?.text,
      'Replace all Irregulars with VC Guerrillas. 1 Neutral Highland to Active Opposition. -3 Patronage.',
    );
  });

  it('unshaded removes exactly 4 eligible Insurgent pieces from spaces with US Irregulars (including unTunneled bases only)', () => {
    const def = compileDef();
    const state = setupEventState(def, {
      zoneTokens: {
        [SPACE_WITH_IRREG_A]: [
          makeToken('tribe-irreg-a', 'irregular', 'US'),
          makeToken('tribe-remove-nva-troop', 'troops', 'NVA'),
          makeToken('tribe-remove-vc-guerrilla', 'guerrilla', 'VC'),
          makeToken('tribe-keep-vc-tunneled-base', 'base', 'VC', { tunnel: 'tunneled' }),
        ],
        [SPACE_WITH_IRREG_B]: [
          makeToken('tribe-irreg-b', 'irregular', 'US'),
          makeToken('tribe-remove-vc-untunneled-base', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('tribe-remove-nva-guerrilla', 'guerrilla', 'NVA'),
        ],
        [SPACE_WITHOUT_IRREG]: [
          makeToken('tribe-keep-vc-no-irregular', 'guerrilla', 'VC'),
        ],
      },
    });

    const move = findCard29Move(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-29 unshaded event move');

    const pending = legalChoicesEvaluate(def, state, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending choice request for card-29 unshaded.');
    }
    assert.equal(pending.type, 'chooseN');
    assert.equal(pending.max, 4);
    const optionIds = pending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(optionIds, [
      'tribe-remove-nva-guerrilla',
      'tribe-remove-nva-troop',
      'tribe-remove-vc-guerrilla',
      'tribe-remove-vc-untunneled-base',
    ]);

    const final = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.equal(hasToken(final, SPACE_WITH_IRREG_A, 'tribe-remove-nva-troop'), false);
    assert.equal(hasToken(final, SPACE_WITH_IRREG_A, 'tribe-remove-vc-guerrilla'), false);
    assert.equal(hasToken(final, SPACE_WITH_IRREG_B, 'tribe-remove-vc-untunneled-base'), false);
    assert.equal(hasToken(final, SPACE_WITH_IRREG_B, 'tribe-remove-nva-guerrilla'), false);

    assert.equal(
      hasToken(final, SPACE_WITH_IRREG_A, 'tribe-keep-vc-tunneled-base'),
      true,
      'Tunneled base must not be removable by Tribesmen unshaded',
    );
    assert.equal(
      hasToken(final, SPACE_WITHOUT_IRREG, 'tribe-keep-vc-no-irregular'),
      true,
      'Spaces without US Irregulars must not contribute removable Insurgent pieces',
    );

    assert.equal(
      countZoneTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA'),
      2,
      'Removed NVA pieces should move to available-NVA:none',
    );
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.props.faction === 'VC'),
      2,
      'Removed VC pieces should move to available-VC:none',
    );
  });

  it('unshaded removes all eligible pieces when fewer than 4 exist', () => {
    const def = compileDef();
    const state = setupEventState(def, {
      zoneTokens: {
        [SPACE_WITH_IRREG_A]: [
          makeToken('tribe-irreg-few', 'irregular', 'US'),
          makeToken('tribe-remove-only-one', 'guerrilla', 'VC'),
        ],
      },
    });

    const move = findCard29Move(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-29 unshaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.equal(hasToken(final, SPACE_WITH_IRREG_A, 'tribe-remove-only-one'), false);
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => String(token.id) === 'tribe-remove-only-one'),
      1,
      'Single eligible piece should be removed when fewer than 4 are available',
    );
  });

  it('shaded replaces map US Irregulars 1-for-1 in place with VC Guerrillas, shifts one neutral Highland to Active Opposition, and applies Patronage -3', () => {
    const def = compileDef();
    const state = setupEventState(def, {
      patronage: 12,
      markers: {
        [NEUTRAL_HIGHLAND]: { supportOpposition: 'neutral' },
        [NON_NEUTRAL_HIGHLAND]: { supportOpposition: 'passiveSupport' },
      },
      zoneTokens: {
        [SPACE_WITH_IRREG_A]: [makeToken('tribe-shade-irreg-a', 'irregular', 'US')],
        [SPACE_WITH_IRREG_B]: [makeToken('tribe-shade-irreg-b', 'irregular', 'US')],
        'available-US:none': [makeToken('tribe-available-irreg', 'irregular', 'US')],
        'available-VC:none': [
          makeToken('tribe-vc-replacement-1', 'guerrilla', 'VC'),
          makeToken('tribe-vc-replacement-2', 'guerrilla', 'VC'),
        ],
      },
    });

    const move = findCard29Move(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-29 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.equal(hasToken(final, SPACE_WITH_IRREG_A, 'tribe-shade-irreg-a'), false);
    assert.equal(hasToken(final, SPACE_WITH_IRREG_B, 'tribe-shade-irreg-b'), false);
    assert.equal(
      countZoneTokens(final, SPACE_WITH_IRREG_A, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'One VC Guerrilla should replace Irregular in first source space',
    );
    assert.equal(
      countZoneTokens(final, SPACE_WITH_IRREG_B, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'One VC Guerrilla should replace Irregular in second source space',
    );

    assert.equal(
      countZoneTokens(final, 'available-US:none', (token) => token.type === 'irregular' && token.props.faction === 'US'),
      3,
      'Both map Irregulars should move to available-US:none while pre-existing available Irregular stays',
    );
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      0,
      'Both replacement VC Guerrillas should be consumed from available-VC:none',
    );
    assert.equal(final.markers[NEUTRAL_HIGHLAND]?.supportOpposition, 'activeOpposition');
    assert.equal(
      final.markers[NON_NEUTRAL_HIGHLAND]?.supportOpposition,
      'passiveSupport',
      'Only neutral Highland spaces are eligible for the opposition shift',
    );
    assert.equal(final.globalVars.patronage, 9);
  });

  it('shaded removes all map Irregulars even when VC Guerrilla replacements are limited, and skips Highland shift if no neutral Highland exists', () => {
    const def = compileDef();
    const state = setupEventState(def, {
      patronage: 10,
      markers: {
        [NEUTRAL_HIGHLAND]: { supportOpposition: 'passiveOpposition' },
        [NON_NEUTRAL_HIGHLAND]: { supportOpposition: 'activeSupport' },
      },
      zoneTokens: {
        [SPACE_WITH_IRREG_A]: [makeToken('tribe-short-irreg-a', 'irregular', 'US')],
        [SPACE_WITH_IRREG_B]: [makeToken('tribe-short-irreg-b', 'irregular', 'US')],
        'available-VC:none': [makeToken('tribe-short-vc-only', 'guerrilla', 'VC')],
      },
    });

    const move = findCard29Move(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-29 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.equal(
      countZoneTokens(final, 'available-US:none', (token) => token.type === 'irregular' && token.props.faction === 'US'),
      2,
      'Both map Irregulars should still be removed even when fewer VC replacements are available',
    );
    assert.equal(
      countZoneTokens(final, SPACE_WITH_IRREG_A, (token) => token.props.faction === 'VC' && token.type === 'guerrilla') +
        countZoneTokens(final, SPACE_WITH_IRREG_B, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'Only one VC Guerrilla can be placed when only one is available',
    );
    assert.equal(final.markers[NEUTRAL_HIGHLAND]?.supportOpposition, 'passiveOpposition');
    assert.equal(final.markers[NON_NEUTRAL_HIGHLAND]?.supportOpposition, 'activeSupport');
    assert.equal(final.globalVars.patronage, 7);
  });
});
