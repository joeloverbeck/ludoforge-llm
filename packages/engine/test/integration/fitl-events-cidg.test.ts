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
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-81';
const SOUTH_SPACE_A = 'quang-nam:none';
const SOUTH_SPACE_B = 'saigon:none';
const SOUTH_SPACE_C = 'kien-phong:none';
const OUTSIDE_SOUTH_SPACE = 'central-laos:none';
const TARGET_HIGHLAND = 'pleiku-darlac:none';
const OTHER_HIGHLAND = 'binh-dinh:none';
const EMPTY_HIGHLAND = 'khanh-hoa:none';
const NON_HIGHLAND = 'tay-ninh:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extraProps,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupEventState = (
  def: GameDef,
  seed: number,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(overrides.zoneTokens ?? {}),
    },
  };
};

const findCidgMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.eventCardId === CARD_ID
      && move.params.side === side,
  );

const tokenIdsInZone = (state: GameState, zone: string): Set<string> =>
  new Set((state.zones[zone] ?? []).map((token) => String((token as Token).id)));

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const findToken = (state: GameState, zone: string, tokenId: string): Token | undefined =>
  (state.zones[zone] ?? []).find((token) => String((token as Token).id) === asTokenId(tokenId)) as Token | undefined;

describe('FITL card-81 CIDG', () => {
  it('compiles exact text and declarative die-roll / Highland replacement structure', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'CIDG');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'VC', 'US', 'NVA']);
    assert.equal(
      card?.unshaded?.text,
      'Replace a die roll of VC Guerrillas in South Vietnam with Rangers, Irregulars, or Police.',
    );
    assert.equal(
      card?.shaded?.text,
      'Replace all Rangers, Police, and Irregulars in a Highland space with 2 VC Guerrillas total.',
    );

    const unshadedRoll = (card?.unshaded?.effects?.[0] as { rollRandom?: { bind?: string; min?: number; max?: number } })?.rollRandom;
    assert.equal(unshadedRoll?.bind, '$cidgReplacementRoll');
    assert.equal(unshadedRoll?.min, 1);
    assert.equal(unshadedRoll?.max, 6);

    const serializedUnshaded = JSON.stringify(card?.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"prop":"country".*"right":"southVietnam"/, 'Unshaded should restrict source guerrillas to South Vietnam');
    assert.match(serializedUnshaded, /"query":"concat"/, 'Unshaded should choose from a mixed replacement pool');
    assert.match(serializedUnshaded, /"value":"police"/, 'Unshaded should allow Police replacements');
    assert.match(serializedUnshaded, /"value":"ranger"/, 'Unshaded should allow Ranger replacements');
    assert.match(serializedUnshaded, /"value":"irregular"/, 'Unshaded should allow Irregular replacements');

    const serializedShaded = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(serializedShaded, /"value":"highland"/, 'Shaded should target Highland spaces only');
    assert.match(serializedShaded, /"available-US:none"/, 'Shaded should route Irregulars to Available');
    assert.match(serializedShaded, /"available-ARVN:none"/, 'Shaded should route Rangers and Police to Available');
    assert.match(serializedShaded, /"available-VC:none"/, 'Shaded should source VC Guerrillas from Available');
  });

  it('unshaded offers all three replacement types for a South Vietnam VC guerrilla and resolves Irregular, Ranger, and Police replacements correctly', () => {
    const def = compileDef();
    const state = setupEventState(def, 81001, {
      zoneTokens: {
        [SOUTH_SPACE_A]: [makeToken('cidg-vc-a', 'guerrilla', 'VC', { activity: 'active' })],
        [OUTSIDE_SOUTH_SPACE]: [makeToken('cidg-vc-outside', 'guerrilla', 'VC', { activity: 'underground' })],
        'available-US:none': [makeToken('cidg-us-irregular', 'irregular', 'US', { activity: 'active' })],
        'available-ARVN:none': [
          makeToken('cidg-arvn-ranger', 'ranger', 'ARVN', { activity: 'active' }),
          makeToken('cidg-arvn-police', 'police', 'ARVN', { activity: 'active' }),
        ],
      },
    });
    const move = findCidgMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected CIDG unshaded move');

    const firstPending = legalChoicesEvaluate(def, state, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected direct VC-guerrilla selection for CIDG unshaded when only one South Vietnam VC guerrilla is eligible.');
    }
    assert.deepEqual(
      firstPending.options.map((option) => String(option.value)).sort(),
      ['cidg-vc-a'],
      'Only South Vietnam VC guerrillas should be eligible for unshaded replacement',
    );

    const replacementChoiceOptions = (replacementId: string): GameState => {
      const overrides: readonly DecisionOverrideRule[] = [
        {
          when: matchesDecisionRequest({ name: '$cidgVcGuerrillasToReplace', resolvedBind: '$cidgVcGuerrillasToReplace' }),
          value: [asTokenId('cidg-vc-a')],
        },
        {
          when: matchesDecisionRequest({
            namePattern: /^\$cidgReplacementPiece/u,
            resolvedBindPattern: /^\$cidgReplacementPiece/u,
            type: 'chooseOne',
          }),
          value: asTokenId(replacementId),
        },
      ];
      return applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;
    };

    const afterIrregular = replacementChoiceOptions('cidg-us-irregular');
    const afterRanger = replacementChoiceOptions('cidg-arvn-ranger');
    const afterPolice = replacementChoiceOptions('cidg-arvn-police');

    for (const final of [afterIrregular, afterRanger, afterPolice]) {
      assert.equal(tokenIdsInZone(final, 'available-VC:none').has('cidg-vc-a'), true);
      assert.equal(tokenIdsInZone(final, OUTSIDE_SOUTH_SPACE).has('cidg-vc-outside'), true);
    }

    const irregular = findToken(afterIrregular, SOUTH_SPACE_A, 'cidg-us-irregular');
    const ranger = findToken(afterRanger, SOUTH_SPACE_A, 'cidg-arvn-ranger');
    const police = findToken(afterPolice, SOUTH_SPACE_A, 'cidg-arvn-police');
    assert.notEqual(irregular, undefined);
    assert.notEqual(ranger, undefined);
    assert.notEqual(police, undefined);
    assert.equal(irregular?.props.activity, 'underground', 'New Irregulars must be underground');
    assert.equal(ranger?.props.activity, 'underground', 'New Rangers must be underground');
    assert.equal(police?.props.activity, 'active', 'Police should remain active');
    assert.equal(countZoneTokens(afterIrregular, 'available-US:none', (token) => token.props.faction === 'US'), 0);
    assert.equal(countZoneTokens(afterRanger, 'available-ARVN:none', (token) => token.id === asTokenId('cidg-arvn-ranger')), 0);
    assert.equal(countZoneTokens(afterPolice, 'available-ARVN:none', (token) => token.id === asTokenId('cidg-arvn-police')), 0);
  });

  it('unshaded removes eligible South Vietnam VC guerrillas even when no replacement pieces are available', () => {
    const def = compileDef();
    const state = setupEventState(def, 81077, {
      zoneTokens: {
        [SOUTH_SPACE_A]: [makeToken('cidg-no-replacement-south', 'guerrilla', 'VC', { activity: 'underground' })],
        [OUTSIDE_SOUTH_SPACE]: [makeToken('cidg-no-replacement-outside', 'guerrilla', 'VC', { activity: 'underground' })],
      },
    });

    const move = findCidgMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected CIDG unshaded move');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.equal(tokenIdsInZone(final, SOUTH_SPACE_A).has('cidg-no-replacement-south'), false);
    assert.equal(tokenIdsInZone(final, 'available-VC:none').has('cidg-no-replacement-south'), true);
    assert.equal(tokenIdsInZone(final, OUTSIDE_SOUTH_SPACE).has('cidg-no-replacement-outside'), true);
    assert.equal(
      countZoneTokens(final, SOUTH_SPACE_A, (token) => token.props.faction !== 'VC'),
      0,
      'No replacement should be placed when neither Irregulars, Rangers, nor Police are available',
    );
  });

  it('shaded targets only Highlands with Rangers, Police, or Irregulars; removes all such pieces to Available; and places exactly 2 VC guerrillas there', () => {
    const def = compileDef();
    const state = setupEventState(def, 81121, {
      zoneTokens: {
        [TARGET_HIGHLAND]: [
          makeToken('cidg-high-irregular', 'irregular', 'US', { activity: 'active' }),
          makeToken('cidg-high-ranger', 'ranger', 'ARVN', { activity: 'active' }),
          makeToken('cidg-high-police', 'police', 'ARVN', { activity: 'active' }),
          makeToken('cidg-high-existing-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [OTHER_HIGHLAND]: [makeToken('cidg-other-ranger', 'ranger', 'ARVN', { activity: 'active' })],
        [NON_HIGHLAND]: [makeToken('cidg-non-high-irregular', 'irregular', 'US', { activity: 'active' })],
        'available-VC:none': [
          makeToken('cidg-shaded-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('cidg-shaded-vc-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findCidgMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected CIDG shaded move');

    const pending = legalChoicesEvaluate(def, state, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending Highland selection for CIDG shaded.');
    }
    assert.equal(pending.type, 'chooseOne');
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      [OTHER_HIGHLAND, TARGET_HIGHLAND].sort(),
      'Shaded should only offer Highland spaces that contain Rangers, Police, or Irregulars',
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$cidgHighlandSpace', resolvedBind: '$cidgHighlandSpace' }),
        value: TARGET_HIGHLAND,
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;

    assert.equal(tokenIdsInZone(final, TARGET_HIGHLAND).has('cidg-high-irregular'), false);
    assert.equal(tokenIdsInZone(final, TARGET_HIGHLAND).has('cidg-high-ranger'), false);
    assert.equal(tokenIdsInZone(final, TARGET_HIGHLAND).has('cidg-high-police'), false);
    assert.equal(tokenIdsInZone(final, 'available-US:none').has('cidg-high-irregular'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('cidg-high-ranger'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('cidg-high-police'), true);

    assert.equal(tokenIdsInZone(final, OTHER_HIGHLAND).has('cidg-other-ranger'), true, 'Unselected Highland should remain untouched');
    assert.equal(tokenIdsInZone(final, NON_HIGHLAND).has('cidg-non-high-irregular'), true, 'Non-Highland pieces must never be affected');
    assert.equal(tokenIdsInZone(final, TARGET_HIGHLAND).has('cidg-high-existing-vc'), true, 'Pre-existing VC pieces should remain');
    assert.equal(
      countZoneTokens(final, TARGET_HIGHLAND, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      3,
      'Target Highland should end with the pre-existing VC guerrilla plus 2 new VC guerrillas',
    );
    assert.equal(findToken(final, TARGET_HIGHLAND, 'cidg-shaded-vc-1')?.props.activity, 'underground');
    assert.equal(findToken(final, TARGET_HIGHLAND, 'cidg-shaded-vc-2')?.props.activity, 'underground');
    assert.equal(countZoneTokens(final, 'available-VC:none', (token) => token.props.faction === 'VC'), 0);
  });

  it('shaded is a legal no-op when no Highland space contains Rangers, Police, or Irregulars', () => {
    const def = compileDef();
    const state = setupEventState(def, 81141, {
      zoneTokens: {
        [NON_HIGHLAND]: [
          makeToken('cidg-noop-irregular', 'irregular', 'US', { activity: 'active' }),
          makeToken('cidg-noop-police', 'police', 'ARVN', { activity: 'active' }),
        ],
        'available-VC:none': [makeToken('cidg-noop-vc', 'guerrilla', 'VC', { activity: 'active' })],
      },
    });

    const move = findCidgMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected CIDG shaded move even with no legal Highland target');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!).state;

    assert.deepEqual(final.zones, state.zones, 'Shaded should no-op when no Highland contains Rangers, Police, or Irregulars');
    assert.deepEqual(final.markers, state.markers);
    assert.equal(tokenIdsInZone(final, EMPTY_HIGHLAND).size, 0);
  });
});
