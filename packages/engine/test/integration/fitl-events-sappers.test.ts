import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
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
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-53';
const SAIGON = 'saigon:none';
const QUANG_NAM = 'quang-nam:none';
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';
const QUANG_TIN = 'quang-tin-quang-ngai:none';
const NORTH_VIETNAM = 'north-vietnam:none';
const CENTRAL_LAOS = 'central-laos:none';
const NORTHEAST_CAMBODIA = 'northeast-cambodia:none';
const DA_NANG = 'da-nang:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extras: Readonly<Record<string, unknown>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extras,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  assert.equal(base.turnOrderState.type, 'cardDriven');
  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    activePlayer: asPlayerId(2),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'nva',
          secondEligible: 'vc',
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

const findCard53Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const hasToken = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => String((token as Token).id) === tokenId);

const countTroops = (state: GameState, zone: string): number =>
  (state.zones[zone] ?? []).filter((token) => (token as Token).props.faction === 'NVA' && (token as Token).type === 'troops').length;

describe('FITL card-53 Sappers', () => {
  it('encodes the exact rules text, remain-eligible override, and per-side executable structure', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-53 in production deck');
    assert.equal(card?.title, 'Sappers');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);
    assert.equal(card?.unshaded?.text, 'Remove 2 NVA Troops each from up to 3 spaces in South Vietnam. Remain Eligible.');
    assert.equal(card?.shaded?.text, 'Remove up to 1 US and 2 ARVN Bases from any Provinces (US to Casualties).');
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.equal(card?.unshaded?.targets?.[0]?.id, '$targetSouthVietnamSpace');
    assert.equal(card?.unshaded?.targets?.[0]?.application, 'each');
    assert.equal((card?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 3);
    assert.equal((card?.shaded?.effects?.[0] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$usBasesToRemove');
    assert.equal((card?.shaded?.effects?.[1] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$arvnBasesToRemove');
  });

  it('unshaded targets only South Vietnam spaces with NVA troops, removes up to 2 from each selected space, and keeps NVA eligible next card', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 53001, {
      [SAIGON]: [
        makeToken('sappers-sai-1', 'troops', 'NVA'),
        makeToken('sappers-sai-2', 'troops', 'NVA'),
        makeToken('sappers-sai-3', 'troops', 'NVA'),
      ],
      [QUANG_NAM]: [makeToken('sappers-qn-1', 'troops', 'NVA')],
      [LOC_HUE_DA_NANG]: [
        makeToken('sappers-loc-1', 'troops', 'NVA'),
        makeToken('sappers-loc-2', 'troops', 'NVA'),
      ],
      [QUANG_TIN]: [makeToken('sappers-qt-guerrilla', 'guerrilla', 'NVA', { activity: 'active' })],
      [NORTH_VIETNAM]: [
        makeToken('sappers-north-1', 'troops', 'NVA'),
        makeToken('sappers-north-2', 'troops', 'NVA'),
      ],
      [CENTRAL_LAOS]: [makeToken('sappers-laos-1', 'troops', 'NVA')],
      [NORTHEAST_CAMBODIA]: [makeToken('sappers-cambodia-1', 'troops', 'NVA')],
    });

    const move = findCard53Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-53 unshaded event move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending South Vietnam target selection for Sappers unshaded.');
    }
    assert.equal(pending.type, 'chooseN');
    assert.equal(pending.min, 0);
    assert.equal(pending.max, 3);
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      [LOC_HUE_DA_NANG, QUANG_NAM, SAIGON],
      'Only South Vietnam spaces with NVA troops should be selectable',
    );

    const first = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{
        when: (request) => request.name === '$targetSouthVietnamSpace' || request.decisionId.includes('targetSouthVietnamSpace'),
        value: [SAIGON, QUANG_NAM, LOC_HUE_DA_NANG],
      }],
    });

    assert.equal(countTroops(first.state, SAIGON), 1, 'Saigon should lose exactly 2 NVA troops');
    assert.equal(countTroops(first.state, QUANG_NAM), 0, 'Single-troop space should remove only what exists');
    assert.equal(countTroops(first.state, LOC_HUE_DA_NANG), 0, 'LoC spaces in South Vietnam should be legal targets');
    assert.equal(countTroops(first.state, NORTH_VIETNAM), 2, 'North Vietnam must remain untouched');
    assert.equal(countTroops(first.state, CENTRAL_LAOS), 1, 'Laos must remain untouched');
    assert.equal(countTroops(first.state, NORTHEAST_CAMBODIA), 1, 'Cambodia must remain untouched');
    assert.equal(countTroops(first.state, 'available-NVA:none'), 5, 'Exactly 5 NVA troops should move to Available');

    assert.deepEqual(
      requireCardDrivenRuntime(first.state).pendingEligibilityOverrides,
      [{ seat: 'nva', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
      'Unshaded should queue remain-eligible for the executing NVA seat',
    );

    const passMove = legalMoves(def, first.state).find((candidate) => String(candidate.actionId) === 'pass');
    assert.notEqual(passMove, undefined, 'Expected a legal pass move for the second actor');
    const second = applyMove(def, first.state, passMove!);
    assert.equal(requireCardDrivenRuntime(second.state).eligibility.nva, true, 'NVA should remain eligible on the following card');
  });

  it('shaded only offers province bases, routes US bases to Casualties and ARVN bases to Available, and respects the 1/2 base caps', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 53002, {
      [QUANG_NAM]: [
        makeToken('sappers-us-province-base', 'base', 'US'),
        makeToken('sappers-arvn-province-base-1', 'base', 'ARVN'),
        makeToken('sappers-arvn-province-base-2', 'base', 'ARVN'),
      ],
      [QUANG_TIN]: [makeToken('sappers-arvn-province-base-3', 'base', 'ARVN')],
      [DA_NANG]: [
        makeToken('sappers-us-city-base', 'base', 'US'),
        makeToken('sappers-arvn-city-base', 'base', 'ARVN'),
      ],
    });

    const move = findCard53Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-53 shaded event move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending US-base selection for Sappers shaded.');
    }
    assert.equal(firstPending.type, 'chooseN');
    assert.equal(firstPending.min, 0);
    assert.equal(firstPending.max, 1);
    assert.deepEqual(
      firstPending.options.map((option) => String(option.value)),
      ['sappers-us-province-base'],
      'US city bases must not be removable',
    );

    const secondPending = legalChoicesEvaluate(def, setup, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: ['sappers-us-province-base'],
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending ARVN-base selection for Sappers shaded.');
    }
    assert.equal(secondPending.type, 'chooseN');
    assert.equal(secondPending.min, 0);
    assert.equal(secondPending.max, 2);
    assert.deepEqual(
      secondPending.options.map((option) => String(option.value)).sort(),
      ['sappers-arvn-province-base-1', 'sappers-arvn-province-base-2', 'sappers-arvn-province-base-3'],
      'Only province ARVN bases should be removable',
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$usBasesToRemove' || request.decisionId.includes('usBasesToRemove'),
        value: ['sappers-us-province-base'],
      },
      {
        when: (request) => request.name === '$arvnBasesToRemove' || request.decisionId.includes('arvnBasesToRemove'),
        value: ['sappers-arvn-province-base-1', 'sappers-arvn-province-base-3'],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(hasToken(final, QUANG_NAM, 'sappers-us-province-base'), false);
    assert.equal(hasToken(final, 'casualties-US:none', 'sappers-us-province-base'), true, 'US bases must route to Casualties');
    assert.equal(hasToken(final, QUANG_NAM, 'sappers-arvn-province-base-1'), false);
    assert.equal(hasToken(final, QUANG_TIN, 'sappers-arvn-province-base-3'), false);
    assert.equal(hasToken(final, 'available-ARVN:none', 'sappers-arvn-province-base-1'), true);
    assert.equal(hasToken(final, 'available-ARVN:none', 'sappers-arvn-province-base-3'), true);
    assert.equal(hasToken(final, QUANG_NAM, 'sappers-arvn-province-base-2'), true, 'Unselected third ARVN base should remain');
    assert.equal(hasToken(final, DA_NANG, 'sappers-us-city-base'), true, 'US city bases must remain');
    assert.equal(hasToken(final, DA_NANG, 'sappers-arvn-city-base'), true, 'ARVN city bases must remain');
  });
});
