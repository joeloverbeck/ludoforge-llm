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
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  clearAllZones,
  withNeutralSupportOppositionMarkers,
} from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-66';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const QUANG_NAM = 'quang-nam:none';
const CAN_THO = 'can-tho:none';
const KIEN_HOA = 'kien-hoa-vinh-binh:none';
const HUE_DA_NANG_LOC = 'loc-hue-da-nang:none';

const unshadedPiecesBranch = 'us-oop-to-south-vietnam';
const unshadedPatronageBranch = 'patronage-minus-3';
const unshadedNoneBranch = 'no-additional-effect';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extras: Readonly<Record<string, string | number | boolean>> = {},
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

const setupState = (
  def: GameDef,
  seed: number,
  options: {
    readonly aid?: number;
    readonly arvnResources?: number;
    readonly patronage?: number;
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: GameState['markers'];
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
      ...(options.arvnResources === undefined ? {} : { arvnResources: options.arvnResources }),
      ...(options.patronage === undefined ? {} : { patronage: options.patronage }),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options.zones ?? {}),
    },
    markers: {
      ...normalizedMarkers,
      ...(options.markers ?? {}),
    },
  };
};

const findCard66Move = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch)
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

describe('FITL card-66 Ambassador Taylor', () => {
  it('encodes exact text, metadata, and the three unshaded choices including explicit decline-both', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-66 in production deck');
    assert.equal(card?.title, 'Ambassador Taylor');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'US', 'VC', 'NVA']);
    assert.equal(card?.metadata?.flavorText, 'Interventionist.');
    assert.equal(
      card?.unshaded?.text,
      'Aid and ARVN Resources each +9. Up to 2 US pieces from out-of-play to South Vietnam or, if desired, Patronage -3.',
    );
    assert.equal(
      card?.shaded?.text,
      'Saigon seen as US puppet: Remove Support from 3 spaces outside Saigon. Patronage -3.',
    );
    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => String(branch.id)),
      [unshadedPiecesBranch, unshadedPatronageBranch, unshadedNoneBranch],
    );

    const unshadedText = JSON.stringify(card?.unshaded?.branches ?? []);
    assert.match(unshadedText, /"var":"aid".*"delta":9/);
    assert.match(unshadedText, /"var":"arvnResources".*"delta":9/);
    assert.match(unshadedText, /"zone":"out-of-play-US:none"/);
    assert.match(unshadedText, /"country".*"southVietnam"/);
    assert.match(unshadedText, /"prop":"type".*"value":"base"/);
    assert.match(unshadedText, /"var":"patronage".*"delta":-3/);

    const shadedText = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(shadedText, /"bind":"\$ambTaylorSupportSpaces"/);
    assert.match(shadedText, /"marker":"supportOpposition".*"right":"passiveSupport"/);
    assert.match(shadedText, /"marker":"supportOpposition".*"right":"activeSupport"/);
    assert.match(shadedText, /"id".*"saigon:none"/);
    assert.match(shadedText, /"shiftMarker".*"delta":-2/);
    assert.match(shadedText, /"shiftMarker".*"delta":-1/);
  });

  it('unshaded US-piece branch moves up to 2 US pieces from out of play into South Vietnam, including bases but not LoCs for bases', () => {
    const def = compileDef();
    const setup = setupState(def, 66001, {
      aid: 68,
      arvnResources: 67,
      zones: {
        'out-of-play-US:none': [
          makeToken('at-us-troop', 'troops', 'US'),
          makeToken('at-us-base', 'base', 'US'),
          makeToken('at-us-irregular', 'irregular', 'US', { activity: 'underground' }),
        ],
        [DA_NANG]: [
          makeToken('at-dn-base-1', 'base', 'ARVN'),
          makeToken('at-dn-base-2', 'base', 'US'),
        ],
      },
    });

    const move = findCard66Move(def, setup, 'unshaded', unshadedPiecesBranch);
    assert.notEqual(move, undefined, 'Expected card-66 unshaded US-piece branch');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending out-of-play piece selector for Ambassador Taylor.');
    }
    if (firstPending.type !== 'chooseN') {
      throw new Error('Expected chooseN out-of-play piece selector for Ambassador Taylor.');
    }
    assert.equal(firstPending.min, 0);
    assert.equal(firstPending.max, 2);

    const baseDestinationPending = legalChoicesEvaluate(def, setup, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionKey]: [asTokenId('at-us-base')],
      },
    });
    assert.equal(baseDestinationPending.kind, 'pending');
    if (baseDestinationPending.kind !== 'pending') {
      throw new Error('Expected pending base destination selector for Ambassador Taylor.');
    }

    const destinationOptions = baseDestinationPending.options.map((option) => String(option.value));
    assert.equal(destinationOptions.includes(HUE), true, 'South Vietnam cities/provinces should be legal base destinations');
    assert.equal(destinationOptions.includes(HUE_DA_NANG_LOC), false, 'Bases must not be placeable onto LoCs');
    assert.equal(destinationOptions.includes(DA_NANG), false, 'Bases must respect the 2-Base stacking limit');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$ambTaylorUsPieces',
        value: [asTokenId('at-us-troop'), asTokenId('at-us-base')],
      },
      {
        when: (request) => request.name === `$ambTaylorDest@${asTokenId('at-us-troop')}`,
        value: HUE_DA_NANG_LOC,
      },
      {
        when: (request) => request.name === `$ambTaylorDest@${asTokenId('at-us-base')}`,
        value: HUE,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(final.globalVars.aid, 75, 'Aid should increase by 9 and clamp at 75');
    assert.equal(final.globalVars.arvnResources, 75, 'ARVN Resources should increase by 9 and clamp at 75');
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 1);
    assert.equal(countMatching(final, HUE_DA_NANG_LOC, (token) => String(token.id) === 'at-us-troop'), 1);
    assert.equal(countMatching(final, HUE, (token) => String(token.id) === 'at-us-base'), 1);
    assert.equal(countMatching(final, DA_NANG, (token) => String(token.id) === 'at-us-base'), 0);
    assert.equal(
      countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'at-us-irregular'),
      1,
      'Unselected US piece should remain out of play',
    );
  });

  it('unshaded patronage branch applies the fixed track gains and optional Patronage -3 without moving any pieces', () => {
    const def = compileDef();
    const setup = setupState(def, 66002, {
      aid: 10,
      arvnResources: 12,
      patronage: 2,
      zones: {
        'out-of-play-US:none': [
          makeToken('at-unused-us-1', 'troops', 'US'),
          makeToken('at-unused-us-2', 'base', 'US'),
        ],
      },
    });

    const move = findCard66Move(def, setup, 'unshaded', unshadedPatronageBranch);
    assert.notEqual(move, undefined, 'Expected card-66 unshaded patronage branch');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(final.globalVars.aid, 19);
    assert.equal(final.globalVars.arvnResources, 21);
    assert.equal(final.globalVars.patronage, 0, 'Patronage should decrease by 3 and clamp at 0');
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 2);
  });

  it('unshaded explicit decline-both branch still grants Aid +9 and ARVN Resources +9 while leaving Patronage and pieces unchanged', () => {
    const def = compileDef();
    const setup = setupState(def, 66003, {
      aid: 5,
      arvnResources: 8,
      patronage: 14,
      zones: {
        'out-of-play-US:none': [makeToken('at-still-oop', 'troops', 'US')],
      },
    });

    const move = findCard66Move(def, setup, 'unshaded', unshadedNoneBranch);
    assert.notEqual(move, undefined, 'Expected card-66 explicit decline-both branch');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(final.globalVars.aid, 14);
    assert.equal(final.globalVars.arvnResources, 17);
    assert.equal(final.globalVars.patronage, 14);
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'at-still-oop'), 1);
  });

  it('shaded requires exactly 3 supported non-Saigon spaces when available, removes Support to Neutral, and applies Patronage -3 once', () => {
    const def = compileDef();
    const setup = setupState(def, 66004, {
      patronage: 10,
      resetSupportToNeutral: true,
      markers: {
        [HUE]: { supportOpposition: 'activeSupport' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
        [CAN_THO]: { supportOpposition: 'activeSupport' },
        [KIEN_HOA]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    });

    const move = findCard66Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-66 shaded move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending support-space selector for Ambassador Taylor shaded.');
    }
    if (pending.type !== 'chooseN') {
      throw new Error('Expected chooseN support-space selector for Ambassador Taylor shaded.');
    }

    assert.equal(pending.min, 3);
    assert.equal(pending.max, 3);
    const options = pending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(options, [CAN_THO, HUE, KIEN_HOA, QUANG_NAM].sort());

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$ambTaylorSupportSpaces',
          value: [HUE, QUANG_NAM, CAN_THO],
        },
      ],
    }).state;

    assert.equal(supportState(final, HUE), 'neutral');
    assert.equal(supportState(final, QUANG_NAM), 'neutral');
    assert.equal(supportState(final, CAN_THO), 'neutral');
    assert.equal(supportState(final, KIEN_HOA), 'passiveSupport', 'Unselected supported space should remain unchanged');
    assert.equal(supportState(final, SAIGON), 'activeSupport', 'Saigon must never be affected by shaded');
    assert.equal(final.globalVars.patronage, 7);
  });

  it('shaded automatically scales exact selection count down when fewer than 3 eligible spaces exist', () => {
    const def = compileDef();
    const setup = setupState(def, 66005, {
      patronage: 4,
      resetSupportToNeutral: true,
      markers: {
        [HUE]: { supportOpposition: 'activeSupport' },
        [QUANG_NAM]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    });

    const move = findCard66Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-66 shaded move with two eligible spaces');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending support-space selector for reduced-count Ambassador Taylor shaded.');
    }
    if (pending.type !== 'chooseN') {
      throw new Error('Expected chooseN reduced-count support-space selector for Ambassador Taylor shaded.');
    }

    assert.equal(pending.min, 2);
    assert.equal(pending.max, 2);
    assert.deepEqual(pending.options.map((option) => String(option.value)).sort(), [HUE, QUANG_NAM].sort());

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{ when: (request) => request.name === '$ambTaylorSupportSpaces', value: [HUE, QUANG_NAM] }],
    }).state;

    assert.equal(supportState(final, HUE), 'neutral');
    assert.equal(supportState(final, QUANG_NAM), 'neutral');
    assert.equal(supportState(final, SAIGON), 'activeSupport');
    assert.equal(final.globalVars.patronage, 1);
  });

  it('shaded is a legal no-op on support removal when no eligible spaces exist, but still applies Patronage -3', () => {
    const def = compileDef();
    const setup = setupState(def, 66006, {
      patronage: 2,
      resetSupportToNeutral: true,
      markers: {
        [SAIGON]: { supportOpposition: 'activeSupport' },
        [HUE]: { supportOpposition: 'neutral' },
      },
    });

    const move = findCard66Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-66 shaded move even with zero eligible support spaces');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected zero-cardinality support selector for Ambassador Taylor shaded.');
    }
    if (pending.type !== 'chooseN') {
      throw new Error('Expected chooseN zero-cardinality support selector for Ambassador Taylor shaded.');
    }

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 0);
    assert.deepEqual(pending.options, []);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(supportState(final, SAIGON), 'activeSupport');
    assert.equal(supportState(final, HUE), 'neutral');
    assert.equal(final.globalVars.patronage, 0);
  });
});
