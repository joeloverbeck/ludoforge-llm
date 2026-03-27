import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
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
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-30';
const COASTAL_CITY = 'hue:none';
const SECOND_COASTAL_SPACE = 'loc-hue-da-nang:none';
const NON_COASTAL_SPACE = 'can-tho:none';
const SHADED_PROVINCE_A = 'quang-tri-thua-thien:none';
const SHADED_PROVINCE_B = 'quang-nam:none';
const SHADED_CONTROL_PROVINCE = 'quang-tin-quang-ngai:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const withNeutralSupportMarkers = (state: GameState): GameState['markers'] =>
  Object.fromEntries(
    Object.entries(state.markers).map(([zoneId, zoneMarkers]) => [
      zoneId,
      zoneMarkers.supportOpposition === undefined
        ? zoneMarkers
        : { ...zoneMarkers, supportOpposition: 'neutral' },
    ]),
  ) as GameState['markers'];

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findCardMove = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
) =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch)
  );

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-30 USS New Jersey', () => {
  it('encodes rules-accurate unshaded and shaded event text plus executable effects', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(
      card?.unshaded?.text,
      'US or ARVN free Air Strikes any 1-3 coastal spaces, removing up to 2 pieces per space (no die roll and no effect on Trail).',
    );
    assert.equal(
      card?.shaded?.text,
      'Shift 2 coastal Provinces with US Troops each 2 levels toward Active Opposition.',
    );
    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => branch.id),
      ['uss-new-jersey-execute-as-us', 'uss-new-jersey-execute-as-arvn'],
    );
    assert.equal(card?.unshaded?.effectTiming, 'afterGrants');
    assert.equal(Array.isArray(card?.unshaded?.freeOperationGrants), false);
    assert.equal(Array.isArray(card?.unshaded?.effects), true);
    assert.equal(card?.unshaded?.effects?.some((effect) => 'setVar' in effect), true);
    assert.equal(Array.isArray(card?.shaded?.targets), true);
  });

  it('unshaded grants execute-as free Air Strike with coastal 1..3 targeting, max-2-per-space removal, and no Trail degrade', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected first event deck');

    const base = clearAllZones(initialState(def, 30001, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(3),
      globalVars: {
        ...base.globalVars,
        trail: 3,
      },
      markers: withNeutralSupportMarkers(base),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'vc',
            secondEligible: 'arvn',
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
        [COASTAL_CITY]: [
          makeToken('nva-t-1', 'troops', 'NVA'),
          makeToken('nva-t-2', 'troops', 'NVA'),
          makeToken('vc-g-a-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-g-a-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [SECOND_COASTAL_SPACE]: [makeToken('vc-g-loc', 'guerrilla', 'VC', { activity: 'active' })],
        [NON_COASTAL_SPACE]: [makeToken('vc-g-non-coastal', 'guerrilla', 'VC', { activity: 'active' })],
      },
    };

    assert.equal(
      countTokens(setup, COASTAL_CITY, (token) => token.props.faction === 'US' || token.props.faction === 'ARVN'),
      0,
      'Setup sanity: selected coastal city intentionally has no US/ARVN piece',
    );

    const eventMove = findCardMove(def, setup, 'unshaded', 'uss-new-jersey-execute-as-us');
    assert.notEqual(eventMove, undefined, 'Expected card-30 unshaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterEvent.length, 1);
    assert.equal(pendingAfterEvent[0]?.seat, 'vc');
    assert.equal(pendingAfterEvent[0]?.executeAsSeat, 'us');
    assert.deepEqual(pendingAfterEvent[0]?.actionIds, ['airStrike']);
    assert.equal(pendingAfterEvent[0]?.allowDuringMonsoon, true);
    assert.equal(afterEvent.globalVars.fitl_airStrikeWindowMode, 2);

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(3),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'vc',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirStrikeMove = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrikeMove, undefined, 'Expected free Air Strike legal move for execute-as grant');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeAirStrikeMove!,
          params: { ...freeAirStrikeMove!.params, $spaces: [NON_COASTAL_SPACE] },
        }),
      /Illegal move|outside options domain|cardinality mismatch|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'USS New Jersey must reject non-coastal targets',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeAirStrikeMove!,
          params: { ...freeAirStrikeMove!.params, $spaces: [] },
        }),
      /Illegal move|outside options domain|cardinality mismatch|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'USS New Jersey must require selecting at least one coastal space',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeAirStrikeMove!,
          params: {
            ...freeAirStrikeMove!.params,
            $spaces: [COASTAL_CITY, SECOND_COASTAL_SPACE, 'saigon:none', 'cam-ranh:none'],
          },
        }),
      /Illegal move|outside options domain|cardinality mismatch|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'USS New Jersey must cap selection at 3 coastal spaces',
    );

    const after = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirStrikeMove!,
      params: { ...freeAirStrikeMove!.params, $spaces: [COASTAL_CITY] },
    }).state;

    assert.equal(
      countTokens(after, COASTAL_CITY, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      2,
      'USS New Jersey should remove at most 2 enemy pieces per selected coastal space',
    );
    assert.equal(
      after.markers[COASTAL_CITY]?.supportOpposition,
      'passiveOpposition',
      'Selected populated coastal city should shift one level toward Active Opposition',
    );
    assert.equal(after.globalVars.trail, 3, 'USS New Jersey must not affect Trail');
    assert.equal(after.globalVars.fitl_airStrikeWindowMode, 0, 'USS New Jersey window should close after free grant use');
    assert.deepEqual(requireCardDrivenRuntime(after).pendingFreeOperationGrants ?? [], []);
  });

  it('shaded shifts exactly two selected coastal provinces with US troops by two levels toward Active Opposition', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected first event deck');

    const base = clearAllZones(initialState(def, 30002, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: withNeutralSupportMarkers(base),
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [SHADED_PROVINCE_A]: [makeToken('us-trp-a', 'troops', 'US')],
        [SHADED_PROVINCE_B]: [makeToken('us-trp-b', 'troops', 'US')],
        [SHADED_CONTROL_PROVINCE]: [makeToken('us-trp-c', 'troops', 'US')],
      },
    };

    const shadedMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-30 shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$targetProvince', resolvedBind: '$targetProvince' }),
        value: [SHADED_PROVINCE_A, SHADED_PROVINCE_B],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, { overrides }).state;

    assert.equal(final.markers[SHADED_PROVINCE_A]?.supportOpposition, 'activeOpposition');
    assert.equal(final.markers[SHADED_PROVINCE_B]?.supportOpposition, 'activeOpposition');
    assert.equal(
      final.markers[SHADED_CONTROL_PROVINCE]?.supportOpposition,
      'neutral',
      'Unselected eligible province should remain unchanged',
    );
  });
});
