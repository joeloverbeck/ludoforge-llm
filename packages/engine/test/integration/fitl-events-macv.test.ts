import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
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
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-69';
const CARD_SEAT_ORDER = ['arvn', 'us', 'vc', 'nva'] as const;

const AIR_LIFT_SOURCE = 'quang-tri-thua-thien:none';
const AIR_LIFT_DESTINATION = 'quang-nam:none';
const INFILTRATE_SPACE = 'tay-ninh:none';
const TAX_SPACE = 'kien-phong:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
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

const setupMacvState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  overrides?: {
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Partial<GameState['markers']>;
    readonly globalVars?: Partial<GameState['globalVars']>;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      aid: 15,
      patronage: 4,
      vcResources: 3,
      nvaResources: 5,
      ...(overrides?.globalVars ?? {}),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: [...CARD_SEAT_ORDER],
        eligibility: {
          us: true,
          arvn: true,
          vc: true,
          nva: true,
        },
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
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
      ...(overrides?.zones ?? {}),
    },
    markers: (
      overrides?.markers === undefined
        ? base.markers
        : { ...base.markers, ...overrides.markers }
    ) as GameState['markers'],
  };
};

const findMacvMove = (
  def: GameDef,
  state: GameState,
  branch: 'macv-us-then-arvn' | 'macv-nva-then-vc',
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === 'unshaded'
      && move.params.branch === branch
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const findFreeMove = (
  def: GameDef,
  state: GameState,
  actionId: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) => String(move.actionId) === actionId && move.freeOperation === true,
  );

describe('FITL card-69 MACV', () => {
  it('resolves the US-then-ARVN branch as sequential required free special activities and keeps the executing US eligible', () => {
    const def = compileDef();
    const setup = setupMacvState(def, 69001, 0, 'us', 'vc', {
      zones: {
        [AIR_LIFT_SOURCE]: [
          makeToken('macv-us-troop', 'troops', 'US', { type: 'troops' }),
        ],
        [AIR_LIFT_DESTINATION]: [
          makeToken('macv-arvn-govern', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
      markers: {
        [AIR_LIFT_DESTINATION]: { supportOpposition: 'activeSupport' },
      },
    });

    const eventMove = findMacvMove(def, setup, 'macv-us-then-arvn');
    assert.notEqual(eventMove, undefined, 'Expected MACV US->ARVN branch move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.deepEqual(requireCardDrivenRuntime(afterEvent).pendingEligibilityOverrides ?? [], [
      { seat: 'us', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);
    assert.equal(
      findFreeMove(def, afterEvent, 'airLift') !== undefined,
      true,
      'US free Air Lift should be immediately available as the first MACV grant',
    );
    assert.equal(
      findFreeMove(def, afterEvent, 'govern'),
      undefined,
      'ARVN grant must remain blocked until the US special activity resolves',
    );

    const afterAirLift = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      actionId: asActionId('airLift'),
      freeOperation: true,
      params: {
        $spaces: [AIR_LIFT_SOURCE, AIR_LIFT_DESTINATION],
        $usLiftTroops: ['macv-us-troop'],
        '$usLiftDestination@macv-us-troop': AIR_LIFT_DESTINATION,
        $coinLiftPieces: [],
      },
    }).state;
    assert.equal(
      findFreeMove(def, afterAirLift, 'govern') !== undefined,
      true,
      'ARVN free Govern should unlock after the US grant resolves',
    );

    const afterGovern = applyMoveWithResolvedDecisionIds(def, afterAirLift, {
      actionId: asActionId('govern'),
      freeOperation: true,
      params: {
        $targetSpaces: [AIR_LIFT_DESTINATION],
        [`$governMode@${AIR_LIFT_DESTINATION}`]: 'aid',
      },
    }).state;

    assert.equal(afterGovern.globalVars.aid, 18, 'Free Govern should still apply its normal Aid gain');
    assert.deepEqual(requireCardDrivenRuntime(afterGovern).pendingFreeOperationGrants ?? [], []);
  });

  it('resolves the NVA-then-VC branch as sequential required free special activities and keeps the executing NVA eligible', () => {
    const def = compileDef();
    const setup = setupMacvState(def, 69002, 2, 'nva', null, {
      zones: {
        [INFILTRATE_SPACE]: [
          makeToken('macv-nva-base', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
          makeToken('macv-nva-guerrilla', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
        ],
        [TAX_SPACE]: [
          makeToken('macv-vc-taxer', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
        'available-NVA:none': [
          makeToken('macv-nva-troop-1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('macv-nva-troop-2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('macv-nva-troop-3', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
      markers: {
        [TAX_SPACE]: { supportOpposition: 'neutral' },
      },
    });

    const eventMove = findMacvMove(def, setup, 'macv-nva-then-vc');
    assert.notEqual(eventMove, undefined, 'Expected MACV NVA->VC branch move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.deepEqual(requireCardDrivenRuntime(afterEvent).pendingEligibilityOverrides ?? [], [
      { seat: 'nva', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' },
    ]);
    assert.equal(
      findFreeMove(def, afterEvent, 'infiltrate') !== undefined,
      true,
      'NVA free Infiltrate should be immediately available as the first MACV grant',
    );
    assert.equal(
      findFreeMove(def, afterEvent, 'tax'),
      undefined,
      'VC grant must remain blocked until the NVA special activity resolves',
    );

    const afterInfiltrate = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      actionId: asActionId('infiltrate'),
      freeOperation: true,
      params: {
        $targetSpaces: [INFILTRATE_SPACE],
        [`$infiltrateMode@${INFILTRATE_SPACE}`]: 'build-up',
        [`$infiltrateGuerrillasToReplace@${INFILTRATE_SPACE}`]: [],
      },
    }).state;
    assert.equal(
      findFreeMove(def, afterInfiltrate, 'tax') !== undefined,
      true,
      'VC free Tax should unlock after the NVA grant resolves',
    );

    const afterTax = applyMoveWithResolvedDecisionIds(def, afterInfiltrate, {
      actionId: asActionId('tax'),
      freeOperation: true,
      params: {
        $targetSpaces: [TAX_SPACE],
      },
    }).state;

    assert.equal(
      (afterTax.globalVars.vcResources ?? 0) > (setup.globalVars.vcResources ?? 0),
      true,
      'Free Tax should still add VC Resources',
    );
    assert.equal(
      (afterTax.zones[TAX_SPACE] ?? []).some(
        (token) => token.id === asTokenId('macv-vc-taxer') && token.props.activity === 'active',
      ),
      true,
      'Free Tax should still activate the selected VC guerrilla',
    );
    assert.deepEqual(requireCardDrivenRuntime(afterTax).pendingFreeOperationGrants ?? [], []);
  });
});
