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

const CARD_ID = 'card-48';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TIN = 'quang-tin-quang-ngai:none';

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

const findCard48Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side,
  );

const setupNamDongState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, 48001, 4).state);
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

const hasToken = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => String((token as Token).id) === tokenId);

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-48 Nam Dong', () => {
  it('compiles card 48 with the exact rules text and province-targeted structure', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'Nam Dong');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'ARVN', 'VC', 'US']);
    assert.equal(
      card?.unshaded?.text,
      'Remove up to 3 Guerrillas from a Province with a COIN Base. Set the space to Active Support.',
    );
    assert.equal(
      card?.shaded?.text,
      'Remove a COIN Base from a Province with 0-2 COIN cubes (US to Casualties) and set it to Active Opposition.',
    );
    assert.equal(card?.unshaded?.targets?.[0]?.id, '$targetProvince');
    assert.equal(card?.shaded?.targets?.[0]?.id, '$targetProvince');
  });

  it('unshaded lets the player choose up to 3 guerrillas in a province with a COIN base, removes only those, and sets Active Support', () => {
    const def = compileDef();
    const state = setupNamDongState(def, {
      markers: {
        [QUANG_NAM]: { supportOpposition: 'passiveOpposition' },
      },
      zoneTokens: {
        [QUANG_NAM]: [
          makeToken('nam-dong-us-base', 'base', 'US'),
          makeToken('nam-dong-vc-g-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('nam-dong-vc-g-2', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('nam-dong-nva-g-1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('nam-dong-nva-g-2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('nam-dong-arvn-troop', 'troops', 'ARVN'),
        ],
      },
    });

    const move = findCard48Move(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-48 unshaded event move');

    const firstPending = legalChoicesEvaluate(def, state, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending target selection for Nam Dong unshaded.');
    }
    assert.equal(firstPending.type, 'chooseOne');
    assert.deepEqual(firstPending.options.map((option) => String(option.value)), [QUANG_NAM]);

    const secondPending = legalChoicesEvaluate(def, state, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: QUANG_NAM,
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending guerrilla selection for Nam Dong unshaded.');
    }
    assert.equal(secondPending.type, 'chooseN');
    assert.equal(secondPending.min, 0);
    assert.equal(secondPending.max, 3);
    assert.deepEqual(
      secondPending.options.map((option) => String(option.value)).sort(),
      ['nam-dong-nva-g-1', 'nam-dong-nva-g-2', 'nam-dong-vc-g-1', 'nam-dong-vc-g-2'],
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionId.includes('targetProvince'),
        value: QUANG_NAM,
      },
      {
        when: (request) => request.name === '$guerrillasToRemove' || request.decisionId.includes('guerrillasToRemove'),
        value: ['nam-dong-vc-g-1', 'nam-dong-vc-g-2', 'nam-dong-nva-g-1'],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;

    assert.equal(hasToken(final, QUANG_NAM, 'nam-dong-vc-g-1'), false);
    assert.equal(hasToken(final, QUANG_NAM, 'nam-dong-vc-g-2'), false);
    assert.equal(hasToken(final, QUANG_NAM, 'nam-dong-nva-g-1'), false);
    assert.equal(
      hasToken(final, QUANG_NAM, 'nam-dong-nva-g-2'),
      true,
      'Unchosen fourth guerrilla should remain in the province',
    );
    assert.equal(
      hasToken(final, QUANG_NAM, 'nam-dong-us-base'),
      true,
      'Unshaded should not remove the COIN base',
    );
    assert.equal(final.markers[QUANG_NAM]?.supportOpposition, 'activeSupport');
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      2,
    );
    assert.equal(
      countZoneTokens(final, 'available-NVA:none', (token) => token.type === 'guerrilla' && token.props.faction === 'NVA'),
      1,
    );
  });

  it('unshaded can remove zero guerrillas and still sets the target province to Active Support', () => {
    const def = compileDef();
    const state = setupNamDongState(def, {
      markers: {
        [QUANG_TIN]: { supportOpposition: 'activeOpposition' },
      },
      zoneTokens: {
        [QUANG_TIN]: [
          makeToken('nam-dong-arvn-base-only', 'base', 'ARVN'),
          makeToken('nam-dong-us-troop-only', 'troops', 'US'),
        ],
      },
    });

    const move = findCard48Move(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-48 unshaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionId.includes('targetProvince'),
        value: QUANG_TIN,
      },
      {
        when: (request) => request.name === '$guerrillasToRemove' || request.decisionId.includes('guerrillasToRemove'),
        value: [],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;

    assert.equal(final.markers[QUANG_TIN]?.supportOpposition, 'activeSupport');
    assert.equal(countZoneTokens(final, 'available-VC:none', () => true), 0);
    assert.equal(countZoneTokens(final, 'available-NVA:none', () => true), 0);
    assert.equal(hasToken(final, QUANG_TIN, 'nam-dong-arvn-base-only'), true);
  });

  it('unshaded is unavailable when no province has a COIN base', () => {
    const def = compileDef();
    const state = setupNamDongState(def, {
      zoneTokens: {
        [QUANG_NAM]: [makeToken('nam-dong-vc-only', 'guerrilla', 'VC')],
        'da-nang:none': [makeToken('nam-dong-us-city-base', 'base', 'US')],
      },
    });

    const move = findCard48Move(def, state, 'unshaded');
    assert.equal(move, undefined, 'Unshaded should be unavailable without a province containing a COIN base');
  });

  it('shaded only targets provinces with 0-2 COIN cubes, lets the player choose the COIN base, routes US bases to Casualties, and sets Active Opposition', () => {
    const def = compileDef();
    const state = setupNamDongState(def, {
      markers: {
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
        [QUANG_TIN]: { supportOpposition: 'neutral' },
      },
      zoneTokens: {
        [QUANG_NAM]: [
          makeToken('nam-dong-shaded-us-base', 'base', 'US'),
          makeToken('nam-dong-shaded-arvn-base', 'base', 'ARVN'),
          makeToken('nam-dong-shaded-us-troop', 'troops', 'US'),
          makeToken('nam-dong-shaded-arvn-police', 'police', 'ARVN'),
          makeToken('nam-dong-shaded-irregular', 'irregular', 'US'),
        ],
        [QUANG_TIN]: [
          makeToken('nam-dong-too-many-cubes-base', 'base', 'ARVN'),
          makeToken('nam-dong-too-many-cubes-us-1', 'troops', 'US'),
          makeToken('nam-dong-too-many-cubes-us-2', 'troops', 'US'),
          makeToken('nam-dong-too-many-cubes-arvn-police', 'police', 'ARVN'),
        ],
      },
    });

    const move = findCard48Move(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-48 shaded event move');

    const firstPending = legalChoicesEvaluate(def, state, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending target selection for Nam Dong shaded.');
    }
    assert.equal(firstPending.type, 'chooseOne');
    assert.deepEqual(
      firstPending.options.map((option) => String(option.value)),
      [QUANG_NAM],
      'Province with 3 COIN cubes should be excluded from legal targets',
    );

    const secondPending = legalChoicesEvaluate(def, state, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: QUANG_NAM,
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending base selection for Nam Dong shaded.');
    }
    assert.equal(secondPending.type, 'chooseOne');
    assert.deepEqual(
      secondPending.options.map((option) => String(option.value)).sort(),
      ['nam-dong-shaded-arvn-base', 'nam-dong-shaded-us-base'],
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionId.includes('targetProvince'),
        value: QUANG_NAM,
      },
      {
        when: (request) => request.name === '$coinBaseToRemove' || request.decisionId.includes('coinBaseToRemove'),
        value: 'nam-dong-shaded-us-base',
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;

    assert.equal(hasToken(final, QUANG_NAM, 'nam-dong-shaded-us-base'), false);
    assert.equal(
      hasToken(final, 'casualties-US:none', 'nam-dong-shaded-us-base'),
      true,
      'Selected US base should route to Casualties',
    );
    assert.equal(
      hasToken(final, QUANG_NAM, 'nam-dong-shaded-arvn-base'),
      true,
      'Unselected ARVN base should remain',
    );
    assert.equal(final.markers[QUANG_NAM]?.supportOpposition, 'activeOpposition');
    assert.equal(final.markers[QUANG_TIN]?.supportOpposition, 'neutral');
  });

  it('shaded routes an ARVN base to Available when chosen', () => {
    const def = compileDef();
    const state = setupNamDongState(def, {
      markers: {
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
      },
      zoneTokens: {
        [QUANG_NAM]: [
          makeToken('nam-dong-arvn-choice-base', 'base', 'ARVN'),
          makeToken('nam-dong-us-choice-base', 'base', 'US'),
          makeToken('nam-dong-arvn-cube-1', 'troops', 'ARVN'),
          makeToken('nam-dong-us-cube-1', 'troops', 'US'),
        ],
      },
    });

    const move = findCard48Move(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-48 shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionId.includes('targetProvince'),
        value: QUANG_NAM,
      },
      {
        when: (request) => request.name === '$coinBaseToRemove' || request.decisionId.includes('coinBaseToRemove'),
        value: 'nam-dong-arvn-choice-base',
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;

    assert.equal(hasToken(final, QUANG_NAM, 'nam-dong-arvn-choice-base'), false);
    assert.equal(hasToken(final, 'available-ARVN:none', 'nam-dong-arvn-choice-base'), true);
    assert.equal(hasToken(final, QUANG_NAM, 'nam-dong-us-choice-base'), true);
    assert.equal(final.markers[QUANG_NAM]?.supportOpposition, 'activeOpposition');
  });
});
