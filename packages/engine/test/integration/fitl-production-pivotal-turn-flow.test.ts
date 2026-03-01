import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const OWNED_PIVOTAL_CARD_BY_SEAT: Readonly<Record<string, string>> = {
  US: 'card-121',
  ARVN: 'card-123',
  NVA: 'card-122',
  VC: 'card-124',
};

const PLAYER_BY_SEAT: Readonly<Record<string, number>> = {
  US: 0,
  ARVN: 1,
  NVA: 2,
  VC: 3,
};

const withLookaheadCoup = (def: GameDef, state: GameState, isCoup: boolean): GameState => {
  if (state.turnOrderState.type !== 'cardDriven' || def.turnOrder?.type !== 'cardDriven') {
    return state;
  }
  const lookaheadZone = def.turnOrder.config.turnFlow.cardLifecycle.lookahead;
  const lookahead = state.zones[lookaheadZone];
  if (lookahead === undefined || lookahead.length === 0) {
    return state;
  }
  const top = lookahead[0];
  if (top === undefined) {
    return state;
  }
  const nextLookahead = [
    {
      ...top,
      props: {
        ...top.props,
        isCoup,
      },
    },
    ...lookahead.slice(1),
  ] as GameState['zones'][string];
  return {
    ...state,
    zones: { ...state.zones, [lookaheadZone]: nextLookahead },
  };
};

const withEligibilityPair = (
  state: GameState,
  options: {
    readonly activeSeat: string;
    readonly firstEligible: string;
    readonly secondEligible: string;
  },
): GameState => {
  const runtime = requireCardDrivenRuntime(state);
  return {
    ...state,
    activePlayer: asPlayerId(PLAYER_BY_SEAT[options.activeSeat] ?? 0),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        eligibility: {
          US: options.activeSeat === 'US' || options.firstEligible === 'US' || options.secondEligible === 'US',
          ARVN: options.activeSeat === 'ARVN' || options.firstEligible === 'ARVN' || options.secondEligible === 'ARVN',
          NVA: options.activeSeat === 'NVA' || options.firstEligible === 'NVA' || options.secondEligible === 'NVA',
          VC: options.activeSeat === 'VC' || options.firstEligible === 'VC' || options.secondEligible === 'VC',
        },
        currentCard: {
          ...runtime.currentCard,
          firstEligible: options.firstEligible,
          secondEligible: options.secondEligible,
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
};

describe('FITL production pivotal turn-flow integration', () => {
  it('allows only seat-owned pivotal card in pre-action window and blocks pivotal after first non-pass action', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = withLookaheadCoup(def, initialState(def, 11, 4).state, false);
    const preActionWinnerState = withEligibilityPair(start, {
      activeSeat: 'VC',
      firstEligible: 'US',
      secondEligible: 'VC',
    });
    const activeSeat = 'VC';
    const expectedCardId = OWNED_PIVOTAL_CARD_BY_SEAT[activeSeat];
    assert.notEqual(expectedCardId, undefined, `Missing pivotal ownership mapping for seat ${activeSeat}`);

    const openingMoves = legalMoves(def, preActionWinnerState);
    const openingPivotalMoves = openingMoves.filter((move) => move.actionId === asActionId('pivotalEvent'));
    assert.equal(
      openingPivotalMoves.some((move) => move.params.eventCardId === expectedCardId),
      true,
      `Expected pivotalEvent(${expectedCardId}) to be available for winning seat ${activeSeat}`,
    );

    const firstApplicableNonPass = openingMoves.find((move) => {
      if (move.actionId === asActionId('pass') || move.actionId === asActionId('pivotalEvent')) {
        return false;
      }
      try {
        applyMove(def, preActionWinnerState, move);
        return true;
      } catch {
        return false;
      }
    });
    assert.notEqual(firstApplicableNonPass, undefined, 'Expected at least one directly-applicable non-pass, non-pivotal move');

    const afterFirst = applyMove(def, preActionWinnerState, firstApplicableNonPass!);
    const followupMoves = legalMoves(def, afterFirst.state);
    assert.equal(followupMoves.some((move) => move.actionId === asActionId('pivotalEvent')), false);
  });

  it('enforces precedence order VC > ARVN > NVA > US for pivotal window contenders', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = withLookaheadCoup(def, initialState(def, 19, 4).state, false);
    const checks: ReadonlyArray<{
      readonly lowerSeat: string;
      readonly higherSeat: string;
    }> = [
      { lowerSeat: 'US', higherSeat: 'NVA' },
      { lowerSeat: 'NVA', higherSeat: 'ARVN' },
      { lowerSeat: 'ARVN', higherSeat: 'VC' },
    ];

    for (const check of checks) {
      const lowerState = withEligibilityPair(start, {
        activeSeat: check.lowerSeat,
        firstEligible: check.lowerSeat,
        secondEligible: check.higherSeat,
      });
      const lowerMoves = legalMoves(def, lowerState);
      assert.equal(
        lowerMoves.some((move) => move.actionId === asActionId('pivotalEvent')),
        false,
        `Expected lower-precedence seat ${check.lowerSeat} to be blocked by seat ${check.higherSeat}`,
      );

      const higherState = withEligibilityPair(start, {
        activeSeat: check.higherSeat,
        firstEligible: check.lowerSeat,
        secondEligible: check.higherSeat,
      });
      const higherMoves = legalMoves(def, higherState);
      const expectedCardId = OWNED_PIVOTAL_CARD_BY_SEAT[check.higherSeat];
      const higherPivotalMoves = higherMoves.filter((move) => move.actionId === asActionId('pivotalEvent'));
      assert.equal(
        higherPivotalMoves.some((move) => move.params.eventCardId === expectedCardId),
        true,
        `Expected higher-precedence seat ${check.higherSeat} to retain exactly its own pivotal move`,
      );
      assert.equal(higherPivotalMoves.length, 1);
    }
  });
});
