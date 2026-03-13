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
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-68';
const POPULATED_PROVINCE = 'quang-nam:none';
const SECOND_POPULATED_PROVINCE = 'binh-dinh:none';
const THIRD_POPULATED_PROVINCE = 'quang-tri-thua-thien:none';
const POPULATION_ZERO_PROVINCE = 'central-laos:none';
const NVA_CONTROLLED_PROVINCE = 'quang-tin-quang-ngai:none';

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
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
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

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const hasToken = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => String((token as Token).id) === asTokenId(tokenId));

const findGreenBeretsMove = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.eventCardId === CARD_ID
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch),
  );

describe('FITL card-68 Green Berets', () => {
  it('compiles exact text, seat order, and marker-legality-gated province targeting on both sides', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'Green Berets');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'US', 'VC', 'NVA']);
    assert.equal(card?.metadata?.flavorText, 'Elite trainers.');
    assert.equal(
      card?.unshaded?.text,
      'Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support.',
    );
    assert.equal(
      card?.shaded?.text,
      'Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition.',
    );

    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => branch.id),
      ['place-irregulars-and-support', 'place-rangers-and-support'],
    );

    for (const branch of card?.unshaded?.branches ?? []) {
      const branchTarget = branch.targets?.[0];
      const branchSelector = branchTarget?.selector as { filter?: { condition?: Record<string, unknown> } } | undefined;
      const branchCardinality = branchTarget?.cardinality as { max?: number } | undefined;
      const branchFilter = branchSelector?.filter?.condition;
      const branchFilterJson = JSON.stringify(branchFilter);
      assert.equal(branch.targets?.[0]?.selector?.query, 'mapSpaces');
      assert.equal(branch.targets?.[0]?.id, '$targetProvince');
      assert.equal(branchCardinality?.max, 1);
      assert.match(branchFilterJson, /"prop":"category".*"province"/, 'Unshaded province target must stay province-only');
      assert.match(branchFilterJson, /"op":"markerStateAllowed"/, 'Unshaded province target must use marker legality');
      assert.match(branchFilterJson, /"state":"activeSupport"/, 'Unshaded province target must target Active Support legality');
      assert.match(branchFilterJson, /"prop":"faction".*"NVA"/, 'Unshaded province target must require no NVA Control');
    }

    const shadedTarget = card?.shaded?.targets?.[0];
    const shadedSelector = shadedTarget?.selector as { filter?: { condition?: Record<string, unknown> } } | undefined;
    const shadedCardinality = shadedTarget?.cardinality as { max?: number } | undefined;
    const shadedFilter = shadedSelector?.filter?.condition;
    const shadedFilterJson = JSON.stringify(shadedFilter);
    assert.equal(shadedTarget?.id, '$oppositionProvince');
    assert.equal(shadedTarget?.selector?.query, 'mapSpaces');
    assert.equal(shadedCardinality?.max, 1);
    assert.match(shadedFilterJson, /"prop":"category".*"province"/, 'Shaded opposition province must stay province-only');
    assert.match(shadedFilterJson, /"op":"markerStateAllowed"/, 'Shaded opposition province must use marker legality');
    assert.match(shadedFilterJson, /"state":"activeOpposition"/, 'Shaded opposition province must target Active Opposition legality');

    const shadedEffects = shadedTarget?.effects ?? [];
    assert.equal(typeof (shadedEffects[0] as { chooseN?: unknown } | undefined)?.chooseN, 'object');
    assert.equal(typeof (shadedEffects[1] as { chooseN?: unknown } | undefined)?.chooseN, 'object');
    assert.deepEqual(shadedEffects.at(-1), {
      setMarker: {
        space: '$oppositionProvince',
        marker: 'supportOpposition',
        state: 'activeOpposition',
      },
    });
  });

  it('unshaded branches only target populated provinces without NVA Control and place up to 3 available pieces', () => {
    const def = compileDef();
    const setup = setupEventState(def, 68001, {
      markers: {
        [POPULATED_PROVINCE]: { supportOpposition: 'neutral' },
        [SECOND_POPULATED_PROVINCE]: { supportOpposition: 'passiveOpposition' },
        [POPULATION_ZERO_PROVINCE]: { supportOpposition: 'neutral' },
        [NVA_CONTROLLED_PROVINCE]: { supportOpposition: 'neutral' },
      },
      zoneTokens: {
        'available-US:none': [
          makeToken('gb-irregular-1', 'irregular', 'US'),
          makeToken('gb-irregular-2', 'irregular', 'US'),
          makeToken('gb-irregular-3', 'irregular', 'US'),
        ],
        'available-ARVN:none': [
          makeToken('gb-ranger-1', 'ranger', 'ARVN'),
          makeToken('gb-ranger-2', 'ranger', 'ARVN'),
        ],
        [NVA_CONTROLLED_PROVINCE]: [
          makeToken('gb-nva-control-1', 'guerrilla', 'NVA'),
          makeToken('gb-nva-control-2', 'troops', 'NVA'),
          makeToken('gb-vc-helper', 'guerrilla', 'VC'),
        ],
      },
    });

    const irregularMove = findGreenBeretsMove(def, setup, 'unshaded', 'place-irregulars-and-support');
    assert.notEqual(irregularMove, undefined, 'Expected Green Berets irregular branch move');
    const irregularPending = legalChoicesEvaluate(def, setup, irregularMove!);
    assert.equal(irregularPending.kind, 'pending');
    if (irregularPending.kind !== 'pending') {
      throw new Error('Expected pending province selection for Green Berets irregular branch.');
    }
    assert.equal(irregularPending.type, 'chooseOne');
    const irregularOptions = irregularPending.options.map((option) => String(option.value));
    assert.equal(irregularOptions.includes(POPULATED_PROVINCE), true);
    assert.equal(irregularOptions.includes(SECOND_POPULATED_PROVINCE), true);
    assert.equal(irregularOptions.includes(POPULATION_ZERO_PROVINCE), false, 'Population-0 provinces must be excluded');
    assert.equal(irregularOptions.includes(NVA_CONTROLLED_PROVINCE), false, 'NVA-Controlled provinces must be excluded');

    const irregularFinal = applyMoveWithResolvedDecisionIds(def, setup, irregularMove!, {
      overrides: [
        {
          when: (request) => request.name === '$targetProvince' || request.decisionKey.includes('targetProvince'),
          value: POPULATED_PROVINCE,
        },
      ],
    }).state;
    assert.equal(
      countZoneTokens(irregularFinal, POPULATED_PROVINCE, (token) => token.type === 'irregular' && token.props.faction === 'US'),
      3,
    );
    assert.equal(
      countZoneTokens(irregularFinal, 'available-US:none', (token) => token.type === 'irregular' && token.props.faction === 'US'),
      0,
      'Irregular branch should place all 3 available US Irregulars',
    );
    assert.equal(irregularFinal.markers[POPULATED_PROVINCE]?.supportOpposition, 'activeSupport');

    const rangerMove = findGreenBeretsMove(def, setup, 'unshaded', 'place-rangers-and-support');
    assert.notEqual(rangerMove, undefined, 'Expected Green Berets ranger branch move');
    const rangerFinal = applyMoveWithResolvedDecisionIds(def, setup, rangerMove!, {
      overrides: [
        {
          when: (request) => request.name === '$targetProvince' || request.decisionKey.includes('targetProvince'),
          value: SECOND_POPULATED_PROVINCE,
        },
      ],
    }).state;
    assert.equal(
      countZoneTokens(rangerFinal, SECOND_POPULATED_PROVINCE, (token) => token.type === 'ranger' && token.props.faction === 'ARVN'),
      2,
      'Ranger branch should place all available Rangers when fewer than 3 exist',
    );
    assert.equal(
      countZoneTokens(rangerFinal, 'available-ARVN:none', (token) => token.type === 'ranger' && token.props.faction === 'ARVN'),
      0,
    );
    assert.equal(rangerFinal.markers[SECOND_POPULATED_PROVINCE]?.supportOpposition, 'activeSupport');
  });

  it('shaded only targets populated source provinces, removes 1-3 Irregulars including from other provinces, and sets the selected province to Active Opposition', () => {
    const def = compileDef();
    const setup = setupEventState(def, 68003, {
      markers: {
        [POPULATED_PROVINCE]: { supportOpposition: 'passiveSupport' },
        [SECOND_POPULATED_PROVINCE]: { supportOpposition: 'neutral' },
        [THIRD_POPULATED_PROVINCE]: { supportOpposition: 'passiveOpposition' },
        [POPULATION_ZERO_PROVINCE]: { supportOpposition: 'neutral' },
      },
      zoneTokens: {
        [POPULATED_PROVINCE]: [
          makeToken('gb-shaded-target-1', 'irregular', 'US'),
          makeToken('gb-shaded-target-2', 'irregular', 'US'),
        ],
        [SECOND_POPULATED_PROVINCE]: [
          makeToken('gb-shaded-other-1', 'irregular', 'US'),
        ],
        [POPULATION_ZERO_PROVINCE]: [
          makeToken('gb-shaded-pop0-1', 'irregular', 'US'),
        ],
      },
    });

    const move = findGreenBeretsMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Green Berets shaded move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending province selection for Green Berets shaded.');
    }
    assert.equal(firstPending.type, 'chooseOne');
    assert.deepEqual(
      firstPending.options.map((option) => String(option.value)).sort(),
      [POPULATED_PROVINCE, SECOND_POPULATED_PROVINCE].sort(),
      'Shaded target options must exclude population-0 provinces even when they contain US Irregulars',
    );

    const secondPending = legalChoicesEvaluate(def, setup, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionKey]: POPULATED_PROVINCE,
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending selected-province Irregular removal for Green Berets shaded.');
    }
    assert.equal(secondPending.type, 'chooseN');
    assert.equal(secondPending.min, 1);
    assert.equal(secondPending.max, 2);
    assert.deepEqual(
      secondPending.options.map((option) => String(option.value)).sort(),
      ['gb-shaded-target-1', 'gb-shaded-target-2'],
    );

    const thirdPending = legalChoicesEvaluate(def, setup, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionKey]: POPULATED_PROVINCE,
        [secondPending.decisionKey]: ['gb-shaded-target-1', 'gb-shaded-target-2'],
      },
    });
    assert.equal(thirdPending.kind, 'pending');
    if (thirdPending.kind !== 'pending') {
      throw new Error('Expected pending other-province Irregular removal for Green Berets shaded.');
    }
    assert.equal(thirdPending.type, 'chooseN');
    assert.equal(thirdPending.min, 0);
    assert.equal(thirdPending.max, 1, 'Selected-province removals should reduce the remaining budget from 3 to 1');
    assert.deepEqual(
      thirdPending.options.map((option) => String(option.value)).sort(),
      ['gb-shaded-other-1', 'gb-shaded-pop0-1'].sort(),
      'Remaining removals may come from any other province, including population-0 provinces',
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$oppositionProvince' || request.decisionKey.includes('oppositionProvince'),
        value: POPULATED_PROVINCE,
      },
      {
        when: (request) => request.name === '$provinceIrregularsToRemove' || request.decisionKey.includes('provinceIrregularsToRemove'),
        value: ['gb-shaded-target-1', 'gb-shaded-target-2'],
      },
      {
        when: (request) => request.name === '$otherIrregularsToRemove' || request.decisionKey.includes('otherIrregularsToRemove'),
        value: ['gb-shaded-pop0-1'],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(hasToken(final, POPULATED_PROVINCE, 'gb-shaded-target-1'), false);
    assert.equal(hasToken(final, POPULATED_PROVINCE, 'gb-shaded-target-2'), false);
    assert.equal(hasToken(final, POPULATION_ZERO_PROVINCE, 'gb-shaded-pop0-1'), false);
    assert.equal(hasToken(final, SECOND_POPULATED_PROVINCE, 'gb-shaded-other-1'), true, 'Unchosen Irregular should remain');
    assert.equal(
      countZoneTokens(final, 'available-US:none', (token) => token.type === 'irregular' && token.props.faction === 'US'),
      3,
      'Shaded should move all selected US Irregulars to Available',
    );
    assert.equal(final.markers[POPULATED_PROVINCE]?.supportOpposition, 'activeOpposition');
    assert.equal(final.markers[SECOND_POPULATED_PROVINCE]?.supportOpposition, 'neutral');
    assert.equal(final.markers[POPULATION_ZERO_PROVINCE]?.supportOpposition, 'neutral');
  });

  it('shaded is unavailable when all US Irregulars are in population-0 provinces', () => {
    const def = compileDef();
    const setup = setupEventState(def, 68004, {
      markers: {
        [POPULATION_ZERO_PROVINCE]: { supportOpposition: 'neutral' },
      },
      zoneTokens: {
        [POPULATION_ZERO_PROVINCE]: [
          makeToken('gb-pop0-only-1', 'irregular', 'US'),
          makeToken('gb-pop0-only-2', 'irregular', 'US'),
        ],
      },
    });

    assert.equal(
      findGreenBeretsMove(def, setup, 'shaded'),
      undefined,
      'Shaded must be unavailable when no removed Irregular province can legally be set to Opposition',
    );
  });
});
