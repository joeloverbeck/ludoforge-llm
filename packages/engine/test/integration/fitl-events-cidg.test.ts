// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asTokenId,
  legalChoicesEvaluate,
  type GameState,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertEventText,
  assertNoOpEvent,
  countTokensInZone,
  findEventMove,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-81';
const SOUTH_SPACE_A = 'quang-nam:none';
const OUTSIDE_SOUTH_SPACE = 'central-laos:none';
const TARGET_HIGHLAND = 'pleiku-darlac:none';
const OTHER_HIGHLAND = 'binh-dinh:none';
const EMPTY_HIGHLAND = 'khanh-hoa:none';
const NON_HIGHLAND = 'tay-ninh:none';

describe('FITL card-81 CIDG', () => {
  it('compiles exact text and uses shared routing/placement macros while keeping CIDG-specific selectors explicit', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

    const def = compiled.gameDef!;
    const card = getEventCard(def, CARD_ID);
    const parsedCard = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.ok(parsedCard, 'Expected parsed CIDG card');

    assertEventText(def, CARD_ID, {
      title: 'CIDG',
      unshaded: 'Replace a die roll of VC Guerrillas in South Vietnam with Rangers, Irregulars, or Police.',
      shaded: 'Replace all Rangers, Police, and Irregulars in a Highland space with 2 VC Guerrillas total.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['ARVN', 'VC', 'US', 'NVA']);

    const unshadedRoll = (card.unshaded?.effects?.[0] as { rollRandom?: { bind?: string; min?: number; max?: number } })?.rollRandom;
    assert.equal(unshadedRoll?.bind, '$cidgReplacementRoll');
    assert.equal(unshadedRoll?.min, 1);
    assert.equal(unshadedRoll?.max, 6);

    const routeMacroCalls = findDeep(parsedCard, (node) => node?.macro === 'fitl-route-removed-piece-to-force-pool');
    assert.equal(routeMacroCalls.length, 2, 'CIDG should reuse the shared routing macro in both unshaded and shaded flows');

    const placementMacroCalls = findDeep(parsedCard, (node) => node?.macro === 'fitl-place-selected-piece-in-zone-underground-by-type');
    assert.equal(
      placementMacroCalls.length,
      2,
      'CIDG should reuse the shared placement/posture macro for both unshaded replacements and shaded VC placement',
    );

    const parsedUnshaded = JSON.stringify(parsedCard.unshaded?.effects ?? []);
    assert.match(parsedUnshaded, /"country".*"southVietnam"/, 'Unshaded should keep the South Vietnam source restriction explicit in the card');
    assert.match(parsedUnshaded, /"query":"concat"/, 'Unshaded should keep the mixed replacement pool explicit in the card');

    const parsedShaded = JSON.stringify(parsedCard.shaded?.effects ?? []);
    assert.match(parsedShaded, /"terrainTags".*"highland"/, 'Shaded should keep Highland eligibility explicit in the card');
    assert.match(parsedShaded, /"op":"min".*"left":2/, 'Shaded should keep the capped total of 2 VC guerrillas explicit in the card');

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"prop":"country".*"right":"southVietnam"/, 'Unshaded should restrict source guerrillas to South Vietnam');
    assert.match(serializedUnshaded, /"query":"concat"/, 'Unshaded should choose from a mixed replacement pool');
    assert.match(serializedUnshaded, /"value":"police"/, 'Unshaded should allow Police replacements');
    assert.match(serializedUnshaded, /"value":"ranger"/, 'Unshaded should allow Ranger replacements');
    assert.match(serializedUnshaded, /"value":"irregular"/, 'Unshaded should allow Irregular replacements');

    const serializedShaded = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(serializedShaded, /"value":"highland"/, 'Shaded should target Highland spaces only');
    assert.match(serializedShaded, /"available-US:none"/, 'Shaded should route Irregulars to Available');
    assert.match(serializedShaded, /"available-ARVN:none"/, 'Shaded should route Rangers and Police to Available');
    assert.match(serializedShaded, /"available-VC:none"/, 'Shaded should source VC Guerrillas from Available');
  });

  it('unshaded offers all three replacement types for a South Vietnam VC guerrilla and resolves Irregular, Ranger, and Police replacements correctly', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 81001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_SPACE_A]: [makeFitlToken('cidg-vc-a', 'guerrilla', 'VC', { activity: 'active' })],
        [OUTSIDE_SOUTH_SPACE]: [makeFitlToken('cidg-vc-outside', 'guerrilla', 'VC', { activity: 'underground' })],
        'available-US:none': [makeFitlToken('cidg-us-irregular', 'irregular', 'US', { activity: 'active' })],
        'available-ARVN:none': [
          makeFitlToken('cidg-arvn-ranger', 'ranger', 'ARVN', { activity: 'active' }),
          makeFitlToken('cidg-arvn-police', 'police', 'ARVN', { activity: 'active' }),
        ],
      },
    });
    const move = findEventMove(def, state, CARD_ID, 'unshaded');
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
      return runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;
    };

    const afterIrregular = replacementChoiceOptions('cidg-us-irregular');
    const afterRanger = replacementChoiceOptions('cidg-arvn-ranger');
    const afterPolice = replacementChoiceOptions('cidg-arvn-police');

    for (const final of [afterIrregular, afterRanger, afterPolice]) {
      assert.equal(tokenIdsInZone(final, 'available-VC:none').has('cidg-vc-a'), true);
      assert.equal(tokenIdsInZone(final, OUTSIDE_SOUTH_SPACE).has('cidg-vc-outside'), true);
    }

    const irregular = findTokenInZone(afterIrregular, SOUTH_SPACE_A, 'cidg-us-irregular');
    const ranger = findTokenInZone(afterRanger, SOUTH_SPACE_A, 'cidg-arvn-ranger');
    const police = findTokenInZone(afterPolice, SOUTH_SPACE_A, 'cidg-arvn-police');
    assert.notEqual(irregular, undefined);
    assert.notEqual(ranger, undefined);
    assert.notEqual(police, undefined);
    assert.equal(irregular?.props.activity, 'underground', 'New Irregulars must be underground');
    assert.equal(ranger?.props.activity, 'underground', 'New Rangers must be underground');
    assert.equal(police?.props.activity, 'active', 'Police should remain active');
    assert.equal(countTokensInZone(afterIrregular, 'available-US:none', (token) => token.props.faction === 'US'), 0);
    assert.equal(countTokensInZone(afterRanger, 'available-ARVN:none', (token) => token.id === asTokenId('cidg-arvn-ranger')), 0);
    assert.equal(countTokensInZone(afterPolice, 'available-ARVN:none', (token) => token.id === asTokenId('cidg-arvn-police')), 0);
  });

  it('unshaded removes eligible South Vietnam VC guerrillas even when no replacement pieces are available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 81077,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_SPACE_A]: [makeFitlToken('cidg-no-replacement-south', 'guerrilla', 'VC', { activity: 'underground' })],
        [OUTSIDE_SOUTH_SPACE]: [makeFitlToken('cidg-no-replacement-outside', 'guerrilla', 'VC', { activity: 'underground' })],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(tokenIdsInZone(final, SOUTH_SPACE_A).has('cidg-no-replacement-south'), false);
    assert.equal(tokenIdsInZone(final, 'available-VC:none').has('cidg-no-replacement-south'), true);
    assert.equal(tokenIdsInZone(final, OUTSIDE_SOUTH_SPACE).has('cidg-no-replacement-outside'), true);
    assert.equal(
      countTokensInZone(final, SOUTH_SPACE_A, (token) => token.props.faction !== 'VC'),
      0,
      'No replacement should be placed when neither Irregulars, Rangers, nor Police are available',
    );
  });

  it('shaded targets only Highlands with Rangers, Police, or Irregulars; removes all such pieces to Available; and places exactly 2 VC guerrillas there', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 81121,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TARGET_HIGHLAND]: [
          makeFitlToken('cidg-high-irregular', 'irregular', 'US', { activity: 'active' }),
          makeFitlToken('cidg-high-ranger', 'ranger', 'ARVN', { activity: 'active' }),
          makeFitlToken('cidg-high-police', 'police', 'ARVN', { activity: 'active' }),
          makeFitlToken('cidg-high-existing-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [OTHER_HIGHLAND]: [makeFitlToken('cidg-other-ranger', 'ranger', 'ARVN', { activity: 'active' })],
        [NON_HIGHLAND]: [makeFitlToken('cidg-non-high-irregular', 'irregular', 'US', { activity: 'active' })],
        'available-VC:none': [
          makeFitlToken('cidg-shaded-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('cidg-shaded-vc-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
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
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

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
      countTokensInZone(final, TARGET_HIGHLAND, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      3,
      'Target Highland should end with the pre-existing VC guerrilla plus 2 new VC guerrillas',
    );
    assert.equal(findTokenInZone(final, TARGET_HIGHLAND, 'cidg-shaded-vc-1')?.props.activity, 'underground');
    assert.equal(findTokenInZone(final, TARGET_HIGHLAND, 'cidg-shaded-vc-2')?.props.activity, 'underground');
    assert.equal(countTokensInZone(final, 'available-VC:none', (token) => token.props.faction === 'VC'), 0);
  });

  it('shaded is a legal no-op when no Highland space contains Rangers, Police, or Irregulars', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 81141,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [NON_HIGHLAND]: [
          makeFitlToken('cidg-noop-irregular', 'irregular', 'US', { activity: 'active' }),
          makeFitlToken('cidg-noop-police', 'police', 'ARVN', { activity: 'active' }),
        ],
        'available-VC:none': [makeFitlToken('cidg-noop-vc', 'guerrilla', 'VC', { activity: 'active' })],
      },
    });

    const result = assertNoOpEvent(def, state, CARD_ID, 'shaded');
    assert.equal(tokenIdsInZone(result.state, EMPTY_HIGHLAND).size, 0);
  });
});
