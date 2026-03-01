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
  us: 'card-121',
  arvn: 'card-123',
  nva: 'card-122',
  vc: 'card-124',
};

const PLAYER_BY_SEAT: Readonly<Record<string, number>> = {
  us: 0,
  arvn: 1,
  nva: 2,
  vc: 3,
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
          us: options.activeSeat === 'us' || options.firstEligible === 'us' || options.secondEligible === 'us',
          arvn: options.activeSeat === 'arvn' || options.firstEligible === 'arvn' || options.secondEligible === 'arvn',
          nva: options.activeSeat === 'nva' || options.firstEligible === 'nva' || options.secondEligible === 'nva',
          vc: options.activeSeat === 'vc' || options.firstEligible === 'vc' || options.secondEligible === 'vc',
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
      activeSeat: 'vc',
      firstEligible: 'us',
      secondEligible: 'vc',
    });
    const activeSeat = 'vc';
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
      { lowerSeat: 'us', higherSeat: 'nva' },
      { lowerSeat: 'nva', higherSeat: 'arvn' },
      { lowerSeat: 'arvn', higherSeat: 'vc' },
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
