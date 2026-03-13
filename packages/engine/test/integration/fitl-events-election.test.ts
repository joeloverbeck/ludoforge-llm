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
import {
  applyMoveWithResolvedDecisionIds,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  clearAllZones,
  withNeutralSupportOppositionMarkers,
} from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-83';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const CAN_THO = 'can-tho:none';
const AN_LOC = 'an-loc:none';
const CAM_RANH = 'cam-ranh:none';
const KONTUM = 'kontum:none';
const QUI_NHON = 'qui-nhon:none';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const HUE_DA_NANG_LOC = 'loc-hue-da-nang:none';
const CITY_SPACES = [AN_LOC, CAM_RANH, CAN_THO, DA_NANG, HUE, KONTUM, QUI_NHON, SAIGON] as const;

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupState = (
  def: GameDef,
  seed: number,
  options: {
    readonly aid?: number;
    readonly markers?: GameState['markers'];
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
    readonly resetSupportToNeutral?: boolean;
  } = {},
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  const normalizedMarkers = options.resetSupportToNeutral === true
    ? withNeutralSupportOppositionMarkers(base)
    : base.markers;

  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(options.aid === undefined ? {} : { aid: options.aid }),
    },
    markers: {
      ...normalizedMarkers,
      ...(options.markers ?? {}),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options.zones ?? {}),
    },
  };
};

const findCard83Move = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

describe('FITL card-83 Election', () => {
  it('encodes the rules-accurate text and declarative chooseN structures for both sides', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-83 in production deck');
    assert.equal(card?.title, 'Election');
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'VC', 'US', 'NVA']);
    assert.equal(card?.metadata?.flavorText, 'Clean vote.');
    assert.equal(card?.unshaded?.text, '3 Passive Support spaces to Active Support. Aid +10.');
    assert.equal(
      card?.shaded?.text,
      'Ballot stuffing defeats opposition candidate Druong Dinh Dzu: Shift 2 Cities each 1 level toward Active Opposition. Aid -15.',
    );

    const unshadedJson = JSON.stringify(card?.unshaded?.effects ?? []);
    const shadedJson = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(unshadedJson, /"bind":"\$electionPassiveSupportSpaces"/);
    assert.match(unshadedJson, /"right":"passiveSupport"/);
    assert.match(unshadedJson, /"state":"activeSupport"/);
    assert.match(unshadedJson, /"var":"aid".*"delta":10/);
    assert.match(shadedJson, /"bind":"\$electionCities"/);
    assert.match(shadedJson, /"prop":"category".*"right":"city"/);
    assert.doesNotMatch(shadedJson, /"right":"saigon:none"/);
    assert.match(shadedJson, /"right":"activeOpposition"/);
    assert.match(shadedJson, /"delta":-1/);
    assert.match(shadedJson, /"var":"aid".*"delta":-15/);
  });

  it('unshaded requires exactly 3 passive-support spaces when available, upgrades only those spaces, and adds Aid once', () => {
    const def = compileDef();
    const setup = setupState(def, 83001, {
      aid: 64,
      resetSupportToNeutral: true,
      markers: {
        [HUE]: { supportOpposition: 'passiveSupport' },
        [DA_NANG]: { supportOpposition: 'passiveSupport' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
        [CAN_THO]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    });

    const move = findCard83Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-83 unshaded move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending passive-support selector for Election unshaded.');
    }

    assert.equal(pending.min, 3);
    assert.equal(pending.max, 3);
    assert.deepEqual(pending.options.map((option) => String(option.value)).sort(), [CAN_THO, DA_NANG, HUE, QUANG_NAM].sort());

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$electionPassiveSupportSpaces',
          value: [HUE, DA_NANG, QUANG_NAM],
        },
      ],
    }).state;

    assert.equal(supportState(final, HUE), 'activeSupport');
    assert.equal(supportState(final, DA_NANG), 'activeSupport');
    assert.equal(supportState(final, QUANG_NAM), 'activeSupport');
    assert.equal(supportState(final, CAN_THO), 'passiveSupport', 'Unselected passive-support space should remain unchanged');
    assert.equal(supportState(final, SAIGON), 'activeSupport', 'Already active support should remain unchanged');
    assert.equal(final.globalVars.aid, 74, 'Aid should increase by 10 exactly once');
  });

  it('unshaded scales exact selection count down when fewer than 3 passive-support spaces exist and still grants Aid +10', () => {
    const def = compileDef();
    const setup = setupState(def, 83002, {
      aid: 70,
      resetSupportToNeutral: true,
      markers: {
        [HUE]: { supportOpposition: 'passiveSupport' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
        [DA_NANG]: { supportOpposition: 'neutral' },
      },
    });

    const move = findCard83Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-83 unshaded move with reduced choice count');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending reduced passive-support selector for Election unshaded.');
    }

    assert.equal(pending.min, 2);
    assert.equal(pending.max, 2);
    assert.deepEqual(pending.options.map((option) => String(option.value)).sort(), [HUE, QUANG_NAM].sort());

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$electionPassiveSupportSpaces',
          value: [HUE, QUANG_NAM],
        },
      ],
    }).state;

    assert.equal(supportState(final, HUE), 'activeSupport');
    assert.equal(supportState(final, QUANG_NAM), 'activeSupport');
    assert.equal(supportState(final, DA_NANG), 'neutral');
    assert.equal(final.globalVars.aid, 75, 'Aid should increase by 10 and clamp at 75');
  });

  it('unshaded is a legal no-op on support when no passive-support spaces exist but still grants Aid +10', () => {
    const def = compileDef();
    const setup = setupState(def, 83003, {
      aid: 12,
      resetSupportToNeutral: true,
      markers: {
        [HUE]: { supportOpposition: 'neutral' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    });

    const move = findCard83Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-83 unshaded move even with zero passive-support spaces');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected zero-cardinality selector for Election unshaded.');
    }

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 0);
    assert.deepEqual(pending.options, []);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(supportState(final, HUE), 'neutral');
    assert.equal(supportState(final, SAIGON), 'activeSupport');
    assert.equal(final.globalVars.aid, 22);
  });

  it('shaded targets only non-maxed cities, includes Saigon, shifts each selected city one level, and applies Aid -15 once', () => {
    const def = compileDef();
    const allCitiesActiveOpposition = Object.fromEntries(
      CITY_SPACES.map((space) => [space, { supportOpposition: 'activeOpposition' }]),
    ) as GameState['markers'];
    const setup = setupState(def, 83004, {
      aid: 20,
      resetSupportToNeutral: true,
      markers: {
        ...allCitiesActiveOpposition,
        [SAIGON]: { supportOpposition: 'passiveSupport' },
        [HUE]: { supportOpposition: 'neutral' },
        [DA_NANG]: { supportOpposition: 'activeOpposition' },
        [CAN_THO]: { supportOpposition: 'passiveOpposition' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        [HUE_DA_NANG_LOC]: [makeToken('loc-us', 'troops', 'US')],
      },
    });

    const move = findCard83Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-83 shaded move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending city selector for Election shaded.');
    }

    assert.equal(pending.min, 2);
    assert.equal(pending.max, 2);
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      [CAN_THO, HUE, SAIGON].sort(),
      'Only cities that are not already Active Opposition should be selectable, and Saigon must be included',
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$electionCities',
          value: [SAIGON, HUE],
        },
      ],
    }).state;

    assert.equal(supportState(final, SAIGON), 'neutral', 'Saigon should shift one level toward Active Opposition');
    assert.equal(supportState(final, HUE), 'passiveOpposition');
    assert.equal(supportState(final, CAN_THO), 'passiveOpposition', 'Unselected eligible city should remain unchanged');
    assert.equal(supportState(final, DA_NANG), 'activeOpposition', 'Already-maxed city should remain unchanged');
    assert.equal(supportState(final, QUANG_NAM), 'passiveSupport', 'Non-city spaces must not be selectable or affected');
    assert.equal(final.globalVars.aid, 5);
  });

  it('shaded scales exact selection count down when fewer than 2 eligible cities exist and still applies Aid -15', () => {
    const def = compileDef();
    const allCitiesActiveOpposition = Object.fromEntries(
      CITY_SPACES.map((space) => [space, { supportOpposition: 'activeOpposition' }]),
    ) as GameState['markers'];
    const setup = setupState(def, 83005, {
      aid: 10,
      resetSupportToNeutral: true,
      markers: {
        ...allCitiesActiveOpposition,
        [SAIGON]: { supportOpposition: 'activeOpposition' },
        [HUE]: { supportOpposition: 'passiveSupport' },
        [DA_NANG]: { supportOpposition: 'activeOpposition' },
        [CAN_THO]: { supportOpposition: 'activeOpposition' },
        [QUANG_TRI]: { supportOpposition: 'passiveSupport' },
      },
    });

    const move = findCard83Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-83 shaded move with reduced choice count');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending reduced city selector for Election shaded.');
    }

    assert.equal(pending.min, 1);
    assert.equal(pending.max, 1);
    assert.deepEqual(pending.options.map((option) => String(option.value)), [HUE]);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$electionCities',
          value: [HUE],
        },
      ],
    }).state;

    assert.equal(supportState(final, HUE), 'neutral');
    assert.equal(supportState(final, SAIGON), 'activeOpposition');
    assert.equal(supportState(final, QUANG_TRI), 'passiveSupport', 'Province should remain untouched by city-only shaded effect');
    assert.equal(final.globalVars.aid, 0, 'Aid should decrease by 15 and clamp at 0');
  });

  it('shaded is a legal no-op on city shifts when no eligible cities exist, but still applies Aid -15', () => {
    const def = compileDef();
    const allCitiesActiveOpposition = Object.fromEntries(
      CITY_SPACES.map((space) => [space, { supportOpposition: 'activeOpposition' }]),
    ) as GameState['markers'];
    const setup = setupState(def, 83006, {
      aid: 8,
      resetSupportToNeutral: true,
      markers: {
        ...allCitiesActiveOpposition,
        [SAIGON]: { supportOpposition: 'activeOpposition' },
        [HUE]: { supportOpposition: 'activeOpposition' },
        [DA_NANG]: { supportOpposition: 'activeOpposition' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
      },
    });

    const move = findCard83Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-83 shaded move even with zero eligible cities');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected zero-cardinality city selector for Election shaded.');
    }

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 0);
    assert.deepEqual(pending.options, []);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(supportState(final, SAIGON), 'activeOpposition');
    assert.equal(supportState(final, HUE), 'activeOpposition');
    assert.equal(supportState(final, QUANG_NAM), 'passiveSupport');
    assert.equal(final.globalVars.aid, 0);
  });
});
