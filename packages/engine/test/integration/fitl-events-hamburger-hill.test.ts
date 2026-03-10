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

const CARD_ID = 'card-36';
const PLEIKU_DARLAC = 'pleiku-darlac:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const SAIGON = 'saigon:none';
const QUANG_NAM = 'quang-nam:none';

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

const findHamburgerHillMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side,
  );

const setupState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, 36001, 4).state);
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

const hasToken = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => String((token as Token).id) === tokenId);

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-36 Hamburger Hill', () => {
  it('compiles card 36 with the exact event text and 1968 NVA-first seat order', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'Hamburger Hill');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'US', 'VC', 'ARVN']);
    assert.equal(
      card?.unshaded?.text,
      'Move 4 US Troops from any spaces to a Highland. Remove 1 NVA or VC Base there, even if Tunneled.',
    );
    assert.equal(
      card?.shaded?.text,
      'Place a Tunnel on an NVA or VC Highland Base. 3 US Troops there to Casualties.',
    );
  });

  it('unshaded targets a Highland only, excludes troops already there from movement, moves exactly 4 US Troops, and removes a Tunneled base', () => {
    const def = compileDef();
    const state = setupState(def, {
      zoneTokens: {
        [PLEIKU_DARLAC]: [
          makeToken('hh-us-pleiku-stay', 'troops', 'US'),
          makeToken('hh-vc-base-pleiku', 'base', 'VC', { tunnel: 'tunneled' }),
        ],
        [QUANG_TRI]: [
          makeToken('hh-us-kontum-1', 'troops', 'US'),
          makeToken('hh-us-kontum-2', 'troops', 'US'),
        ],
        [QUANG_NAM]: [
          makeToken('hh-us-quang-nam-1', 'troops', 'US'),
          makeToken('hh-us-quang-nam-2', 'troops', 'US'),
        ],
        [SAIGON]: [
          makeToken('hh-us-saigon-extra', 'troops', 'US'),
          makeToken('hh-vc-base-saigon', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });

    const move = findHamburgerHillMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-36 unshaded event move');

    const firstPending = legalChoicesEvaluate(def, state, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending Highland target selection for Hamburger Hill unshaded.');
    }
    assert.equal(firstPending.type, 'chooseOne');
    const targetOptions = new Set(firstPending.options.map((option) => String(option.value)));
    assert.equal(targetOptions.has(PLEIKU_DARLAC), true, 'Pleiku/Darlac should be a legal Highland target');
    assert.equal(targetOptions.has(SAIGON), false, 'Saigon should never be a legal Highland target');

    const secondPending = legalChoicesEvaluate(def, state, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: PLEIKU_DARLAC,
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending troop-selection step for Hamburger Hill unshaded.');
    }
    assert.equal(secondPending.type, 'chooseN');
    assert.equal(secondPending.min, 4);
    assert.equal(secondPending.max, 4);
    assert.deepEqual(
      secondPending.options.map((option) => String(option.value)).sort(),
      ['hh-us-kontum-1', 'hh-us-kontum-2', 'hh-us-quang-nam-1', 'hh-us-quang-nam-2', 'hh-us-saigon-extra'].sort(),
    );
    assert.equal(
      secondPending.options.some((option) => String(option.value) === 'hh-us-pleiku-stay'),
      false,
      'Troops already in the target Highland should not count as moved troops',
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetHighland' || request.decisionId.includes('targetHighland'),
        value: PLEIKU_DARLAC,
      },
      {
        when: (request) => request.name === '$usTroopsToMove' || request.decisionId.includes('usTroopsToMove'),
        value: ['hh-us-kontum-1', 'hh-us-kontum-2', 'hh-us-quang-nam-1', 'hh-us-quang-nam-2'],
      },
      {
        when: (request) => request.name === '$baseToRemove' || request.decisionId.includes('baseToRemove'),
        value: 'hh-vc-base-pleiku',
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides }).state;

    assert.equal(countZoneTokens(final, PLEIKU_DARLAC, (token) => token.props.faction === 'US' && token.type === 'troops'), 5);
    assert.equal(hasToken(final, PLEIKU_DARLAC, 'hh-vc-base-pleiku'), false, 'Selected Tunneled base should be removed');
    assert.equal(hasToken(final, QUANG_TRI, 'hh-us-kontum-1'), false);
    assert.equal(hasToken(final, QUANG_TRI, 'hh-us-kontum-2'), false);
    assert.equal(hasToken(final, QUANG_NAM, 'hh-us-quang-nam-1'), false);
    assert.equal(hasToken(final, QUANG_NAM, 'hh-us-quang-nam-2'), false);
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => String(token.id) === 'hh-vc-base-pleiku'),
      1,
      'Removed VC base should go to available-VC:none',
    );
    assert.equal(
      hasToken(final, SAIGON, 'hh-vc-base-saigon'),
      true,
      'Non-target non-Highland base must remain untouched',
    );
  });

  it('unshaded still removes a Highland insurgent base when no US Troops can move', () => {
    const def = compileDef();
    const state = setupState(def, {
      zoneTokens: {
        [QUANG_TRI]: [makeToken('hh-nva-base-kontum', 'base', 'NVA', { tunnel: 'tunneled' })],
        [SAIGON]: [makeToken('hh-vc-base-saigon', 'base', 'VC', { tunnel: 'untunneled' })],
      },
    });

    const move = findHamburgerHillMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-36 unshaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!, {
      overrides: [
        {
          when: (request) => request.name === '$targetHighland' || request.decisionId.includes('targetHighland'),
          value: QUANG_TRI,
        },
        {
          when: (request) => request.name === '$baseToRemove' || request.decisionId.includes('baseToRemove'),
          value: 'hh-nva-base-kontum',
        },
      ],
    }).state;

    assert.equal(hasToken(final, QUANG_TRI, 'hh-nva-base-kontum'), false);
    assert.equal(
      countZoneTokens(final, 'available-NVA:none', (token) => String(token.id) === 'hh-nva-base-kontum'),
      1,
      'Even a Tunneled Highland NVA base should be removable by the event',
    );
    assert.equal(
      hasToken(final, SAIGON, 'hh-vc-base-saigon'),
      true,
      'Non-Highland insurgent bases are irrelevant to unshaded target selection when no troops can move',
    );
  });

  it('shaded targets only Highland insurgent bases, tunnels the chosen base, and sends up to 3 US Troops there to Casualties', () => {
    const def = compileDef();
    const state = setupState(def, {
      zoneTokens: {
        [PLEIKU_DARLAC]: [
          makeToken('hh-sh-base-pleiku', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('hh-sh-us-1', 'troops', 'US'),
          makeToken('hh-sh-us-2', 'troops', 'US'),
          makeToken('hh-sh-us-3', 'troops', 'US'),
          makeToken('hh-sh-us-4', 'troops', 'US'),
        ],
        [SAIGON]: [
          makeToken('hh-sh-base-saigon', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('hh-sh-us-saigon', 'troops', 'US'),
        ],
      },
    });

    const move = findHamburgerHillMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-36 shaded event move');

    const firstPending = legalChoicesEvaluate(def, state, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending Highland base selection for Hamburger Hill shaded.');
    }
    assert.equal(firstPending.type, 'chooseOne');
    const targetOptions = new Set(firstPending.options.map((option) => String(option.value)));
    assert.equal(targetOptions.has('hh-sh-base-pleiku'), true, 'Highland base should be selectable');
    assert.equal(targetOptions.has('hh-sh-base-saigon'), false, 'Non-Highland base should not be selectable');

    const secondPending = legalChoicesEvaluate(def, state, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: 'hh-sh-base-pleiku',
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending US troop casualty selection for Hamburger Hill shaded.');
    }
    assert.equal(secondPending.type, 'chooseN');
    assert.equal(secondPending.min, 3);
    assert.equal(secondPending.max, 3);
    assert.deepEqual(
      secondPending.options.map((option) => String(option.value)).sort(),
      ['hh-sh-us-1', 'hh-sh-us-2', 'hh-sh-us-3', 'hh-sh-us-4'].sort(),
    );

    const final = applyMoveWithResolvedDecisionIds(def, state, move!, {
      overrides: [
        {
          when: (request) => request.name === '$highlandBaseTarget' || request.decisionId.includes('highlandBaseTarget'),
          value: 'hh-sh-base-pleiku',
        },
        {
          when: (request) => request.name === '$usTroopsToCasualties' || request.decisionId.includes('usTroopsToCasualties'),
          value: ['hh-sh-us-1', 'hh-sh-us-2', 'hh-sh-us-3'],
        },
      ],
    }).state;

    const pleikuBase = (final.zones[PLEIKU_DARLAC] ?? []).find((token) => String(token.id) === 'hh-sh-base-pleiku') as Token | undefined;
    assert.notEqual(pleikuBase, undefined);
    assert.equal(pleikuBase?.props.tunnel, 'tunneled', 'Chosen Highland base should gain Tunnel status');
    assert.equal(countZoneTokens(final, PLEIKU_DARLAC, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countZoneTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'), 3);
    assert.equal(
      hasToken(final, SAIGON, 'hh-sh-base-saigon'),
      true,
      'Non-Highland base should remain unchanged',
    );
  });

  it('shaded can select an already Tunneled Highland base and removes as many as possible when fewer than 3 US Troops are there', () => {
    const def = compileDef();
    const state = setupState(def, {
      zoneTokens: {
        [QUANG_TRI]: [
          makeToken('hh-sh-tunneled-base', 'base', 'VC', { tunnel: 'tunneled' }),
          makeToken('hh-sh-few-us-1', 'troops', 'US'),
          makeToken('hh-sh-few-us-2', 'troops', 'US'),
        ],
      },
    });

    const move = findHamburgerHillMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-36 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, state, move!, {
      overrides: [
        {
          when: (request) => request.name === '$highlandBaseTarget' || request.decisionId.includes('highlandBaseTarget'),
          value: 'hh-sh-tunneled-base',
        },
      ],
    }).state;

    const kontumBase = (final.zones[QUANG_TRI] ?? []).find((token) => String(token.id) === 'hh-sh-tunneled-base') as Token | undefined;
    assert.notEqual(kontumBase, undefined);
    assert.equal(kontumBase?.props.tunnel, 'tunneled');
    assert.equal(countZoneTokens(final, QUANG_TRI, (token) => token.props.faction === 'US' && token.type === 'troops'), 0);
    assert.equal(countZoneTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'), 2);
  });

  it('shaded is a legal no-op when no Highland insurgent base exists', () => {
    const def = compileDef();
    const state = setupState(def, {
      zoneTokens: {
        [SAIGON]: [
          makeToken('hh-noop-base-saigon', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('hh-noop-us-saigon', 'troops', 'US'),
        ],
      },
    });

    const move = findHamburgerHillMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-36 shaded move even without any Highland base');

    const final = applyMove(def, state, move!).state;
    assert.deepEqual(final.zones, state.zones, 'Shaded should no-op when no Highland insurgent base exists');
  });
});
