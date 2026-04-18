// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const TARGET_SPACE = 'saigon:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
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
  return {
    ...state,
    zones: {
      ...state.zones,
      [lookaheadZone]: [
        {
          ...top,
          props: {
            ...top.props,
            isCoup,
          },
        },
        ...lookahead.slice(1),
      ],
    },
  };
};

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const findCard23Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) => String(move.actionId) === 'event' && move.params.eventCardId === 'card-23' && move.params.side === side,
  );

describe('FITL card-23 Operation Attleboro', () => {
  it('unshaded grants Air Lift -> Sweep -> Assault in tunnel spaces, allows Monsoon Sweep, removes tunneled bases, and keeps ARVN follow-up free', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = withLookaheadCoup(def, clearAllZones(initialState(def, 23001, 4).state), true);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...base.globalVars,
        arvnResources: 0,
      },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'us',
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
        [eventDeck!.discardZone]: [makeToken('card-23', 'card', 'none')],
        [TARGET_SPACE]: [
          makeToken('attleboro-us-troop', 'troops', 'US', { type: 'troops' }),
          makeToken('attleboro-arvn-troop', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('attleboro-vc-base-tunnel', 'base', 'VC', { type: 'base', tunnel: 'tunneled' }),
        ],
      },
    };

    const eventMove = findCard23Move(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected card-23 unshaded move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    assert.equal(afterEvent.globalVars.fitl_operationAttleboroTunnelOverride, true, 'Tunnel override window should open after event execution');
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants?.length, 3);

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'us',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirLift = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airLift' && move.freeOperation === true,
    );
    assert.notEqual(freeAirLift, undefined, 'Expected first grant to be free Air Lift');

    const afterAirLift = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeAirLift!,
      params: {
        ...freeAirLift!.params,
        $spaces: [TARGET_SPACE],
        $usLiftTroops: [],
        $coinLiftPieces: [],
      },
    }).state;

    const sweepMoves = legalMoves(def, afterAirLift).filter((move) => String(move.actionId) === 'sweep');
    assert.equal(sweepMoves.length > 0, true, 'Expected Sweep to be available from the second grant');
    assert.equal(
      sweepMoves.some((move) => move.freeOperation === true),
      true,
      'Monsoon should still allow a granted free Sweep during Attleboro',
    );

    const freeSweep = sweepMoves.find((move) => move.freeOperation === true);
    assert.notEqual(freeSweep, undefined);

    const afterSweep = applyMoveWithResolvedDecisionIds(def, afterAirLift, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [TARGET_SPACE],
        $movingAdjacentTroops: [],
      },
    }).state;

    const freeAssault = legalMoves(def, afterSweep).find(
      (move) => String(move.actionId) === 'assault' && move.freeOperation === true,
    );
    assert.notEqual(freeAssault, undefined, 'Expected third grant to be free Assault');

    const arvnBefore = Number(afterSweep.globalVars.arvnResources);
    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      ...freeAssault!,
      params: {
        ...freeAssault!.params,
        $targetSpaces: [TARGET_SPACE],
        $arvnFollowupSpaces: [TARGET_SPACE],
      },
    }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('attleboro-vc-base-tunnel')),
      1,
      'Tunneled base should be removed as if no Tunnel during Attleboro Assault',
    );
    assert.equal(final.globalVars.arvnResources, arvnBefore, 'Free US Assault should allow ARVN follow-up at cost 0');
  });

  it('shaded removes a die-roll number of US troops from a selected tunnel space (capped by availability)', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 23002, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken('card-23', 'card', 'none')],
        [TARGET_SPACE]: [
          makeToken('attleboro-shaded-us-1', 'troops', 'US', { type: 'troops' }),
          makeToken('attleboro-shaded-us-2', 'troops', 'US', { type: 'troops' }),
          makeToken('attleboro-shaded-nva-base', 'base', 'NVA', { type: 'base', tunnel: 'tunneled' }),
        ],
      },
    };

    const shadedMove = findCard23Move(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-23 shaded move');

    const beforeCasualties = countTokens(setup, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops');
    const overrides: readonly DecisionOverrideRule[] = [{
      when: (request: ChoicePendingRequest) => request.name === '$targetSpace',
      value: TARGET_SPACE,
    }];
    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, { overrides }).state;

    const afterCasualties = countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops');
    const losses = afterCasualties - beforeCasualties;
    assert.equal(losses >= 1, true, 'Shaded should remove at least 1 US troop when available');
    assert.equal(losses <= 2, true, 'Shaded losses should cap at available US troops within range');
  });

  it('shaded is unavailable if no tunnel spaces exist', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 23003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken('card-23', 'card', 'none')],
        [TARGET_SPACE]: [makeToken('attleboro-no-tunnel-us-1', 'troops', 'US', { type: 'troops' })],
      },
    };

    const shadedMove = findCard23Move(def, setup, 'shaded');
    assert.equal(shadedMove, undefined, 'Shaded should be unavailable when no tunnel space can be selected');
  });
});
