import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
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

const CARD_ID = 'card-44';
const TARGET_PROVINCE = 'tay-ninh:none';
const ADJACENT_CITY = 'saigon:none';
const NON_ADJACENT_CITY = 'da-nang:none';

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

const findCard44Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) => String(move.actionId) === 'event' && move.params.eventCardId === CARD_ID && move.params.side === side,
  );

describe('FITL card-44 Ia Drang', () => {
  it('unshaded grants ordered free US Air Lift -> Sweep -> Assault, allows Monsoon Sweep, and keeps ARVN follow-up free', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');
    const lookaheadZone =
      def.turnOrder?.type === 'cardDriven'
        ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
        : null;
    assert.notEqual(lookaheadZone, null, 'Expected card-driven lookahead zone');

    const base = withLookaheadCoup(def, clearAllZones(initialState(def, 44001, 4).state), true);
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
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        ...(lookaheadZone === null
          ? {}
          : { [lookaheadZone]: [makeToken('ia-drang-monsoon-lookahead', 'card', 'none', { isCoup: true })] }),
        [ADJACENT_CITY]: [
          makeToken('ia-drang-us-lift', 'troops', 'US', { type: 'troops' }),
          makeToken('ia-drang-nva-alt-space', 'troops', 'NVA', { type: 'troops' }),
        ],
        [TARGET_PROVINCE]: [
          makeToken('ia-drang-us-in-target', 'troops', 'US', { type: 'troops' }),
          makeToken('ia-drang-arvn-troop', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('ia-drang-vc-guerrilla', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('ia-drang-nva-troop', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const eventMove = findCard44Move(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected card-44 unshaded move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
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

    const preAirliftMoves = legalMoves(def, grantReadyState);
    assert.equal(
      preAirliftMoves.some((move) => String(move.actionId) === 'sweep' && move.freeOperation === true),
      false,
      'Sweep grant must stay sequence-locked until Air Lift resolves',
    );
    assert.equal(
      preAirliftMoves.some((move) => String(move.actionId) === 'assault' && move.freeOperation === true),
      false,
      'Assault grant must stay sequence-locked until Sweep resolves',
    );

    const afterAirLift = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      actionId: asActionId('airLift'),
      freeOperation: true,
      params: {
        $spaces: [TARGET_PROVINCE],
        $usLiftTroops: [],
        $coinLiftPieces: [],
      },
    }).state;

    assert.equal(
      countTokens(afterAirLift, ADJACENT_CITY, (token) => token.id === asTokenId('ia-drang-us-lift')),
      1,
      'With single-space selection, free Air Lift may resolve without moving a troop between spaces',
    );
    assert.equal(requireCardDrivenRuntime(afterAirLift).pendingFreeOperationGrants?.length, 2);

    const sweepMoves = legalMoves(def, afterAirLift).filter((move) => String(move.actionId) === 'sweep');
    const freeSweep = sweepMoves.find((move) => move.freeOperation === true);
    assert.notEqual(freeSweep, undefined, 'Expected free Sweep grant after Air Lift');
    assert.equal(
      sweepMoves.some((move) => move.freeOperation !== true),
      false,
      'During Monsoon, only the grant-marked Sweep should be legal',
    );
    assert.throws(
      () =>
        applyMove(def, afterAirLift, {
          actionId: asActionId('sweep'),
          freeOperation: true,
          params: {
            $targetSpaces: [ADJACENT_CITY],
            $movingAdjacentTroops: [],
          },
        }),
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        const details = error as Error & {
          readonly context?: {
            readonly freeOperationDenial?: {
              readonly cause?: string;
              readonly sequenceContextMismatchGrantIds?: readonly string[];
            };
          };
        };
        return (
          details.context?.freeOperationDenial?.cause === 'zoneFilterMismatch'
          && (details.context?.freeOperationDenial?.sequenceContextMismatchGrantIds?.length ?? 0) > 0
        );
      },
      'Ia Drang follow-up free Sweep should be denied outside the Air Lift-selected space context',
    );

    const afterSweep = applyMoveWithResolvedDecisionIds(def, afterAirLift, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [TARGET_PROVINCE],
        $movingAdjacentTroops: [],
      },
    }).state;
    assert.equal(requireCardDrivenRuntime(afterSweep).pendingFreeOperationGrants?.length, 1);

    const arvnBefore = Number(afterSweep.globalVars.arvnResources);
    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      actionId: asActionId('assault'),
      freeOperation: true,
      params: {
        $targetSpaces: [TARGET_PROVINCE],
        $arvnFollowupSpaces: [TARGET_PROVINCE],
      },
    }).state;

    assert.equal(final.globalVars.arvnResources, arvnBefore, 'ARVN follow-up on free US Assault should cost 0 resources');
    assert.equal(
      (requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? []).length <= 1,
      true,
      'Ia Drang sequence should progress through free operations without charging ARVN resources',
    );
  });

  it('shaded removes US troops only from the selected province and adjacent spaces, capped by availability', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 44002, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [TARGET_PROVINCE]: [
          makeToken('ia-drang-shaded-nva', 'troops', 'NVA', { type: 'troops' }),
          makeToken('ia-drang-shaded-us-province', 'troops', 'US', { type: 'troops' }),
        ],
        [ADJACENT_CITY]: [
          makeToken('ia-drang-shaded-us-adj-1', 'troops', 'US', { type: 'troops' }),
          makeToken('ia-drang-shaded-us-adj-2', 'troops', 'US', { type: 'troops' }),
        ],
        [NON_ADJACENT_CITY]: [makeToken('ia-drang-shaded-us-far', 'troops', 'US', { type: 'troops' })],
      },
    };

    const shadedMove = findCard44Move(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-44 shaded move');

    const beforeCasualties = countTokens(
      setup,
      'casualties-US:none',
      (token) => token.props.faction === 'US' && token.type === 'troops',
    );
    const overrides: readonly DecisionOverrideRule[] = [{
      when: (request: ChoicePendingRequest) => request.name === '$targetProvince',
      value: TARGET_PROVINCE,
    }];
    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, { overrides }).state;

    const afterCasualties = countTokens(
      final,
      'casualties-US:none',
      (token) => token.props.faction === 'US' && token.type === 'troops',
    );
    const losses = afterCasualties - beforeCasualties;
    assert.equal(losses >= 1, true, 'Shaded should remove at least one US troop when within-range troops exist');
    assert.equal(losses <= 3, true, 'Shaded losses must be capped by US troops in selected province plus adjacent spaces');
    assert.equal(
      countTokens(final, NON_ADJACENT_CITY, (token) => token.id === asTokenId('ia-drang-shaded-us-far')),
      1,
      'US troops outside 1-space range must not be removed by shaded Ia Drang',
    );
  });

  it('shaded caps die-roll losses at available in-range US troops', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 44003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [TARGET_PROVINCE]: [
          makeToken('ia-drang-shaded-cap-nva', 'troops', 'NVA', { type: 'troops' }),
          makeToken('ia-drang-shaded-cap-us-only', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const shadedMove = findCard44Move(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-44 shaded move');
    const overrides: readonly DecisionOverrideRule[] = [{
      when: (request: ChoicePendingRequest) => request.name === '$targetProvince',
      value: TARGET_PROVINCE,
    }];
    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, { overrides }).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.id === asTokenId('ia-drang-shaded-cap-us-only')),
      1,
      'When only one in-range US troop exists, shaded loss must cap at 1 even on high die rolls',
    );
  });

  it('shaded is unavailable when no province contains NVA troops', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 44004, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [TARGET_PROVINCE]: [
          makeToken('ia-drang-no-target-nva-guerrilla', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
          makeToken('ia-drang-no-target-us', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const shadedMove = findCard44Move(def, setup, 'shaded');
    assert.equal(shadedMove, undefined, 'Shaded should require a province with NVA Troops (not guerrillas/bases only)');
  });

  it('unshaded is suppressed when strict grant viability is required and no usable grant exists', () => {
    const baseDef = compileDef();
    const def = (() => {
      const mutable = structuredClone(baseDef) as unknown as Record<string, unknown>;
      const primaryDeck = (mutable.eventDecks as Array<Record<string, unknown>> | undefined)?.[0];
      if (primaryDeck === undefined) {
        return baseDef;
      }
      primaryDeck.cards = ((primaryDeck.cards as Array<Record<string, unknown>> | undefined) ?? []).map((card) => {
        const unshaded = card.unshaded as Record<string, unknown> | undefined;
        const grants = unshaded?.freeOperationGrants as Array<Record<string, unknown>> | undefined;
        if (card.id !== CARD_ID || grants === undefined) {
          return card;
        }
        return {
          ...card,
          unshaded: {
            ...unshaded,
            freeOperationGrants: grants.map((grant) => ({
              ...grant,
              viabilityPolicy: 'requireUsableForEventPlay' as const,
            })),
          },
        };
      });
      return mutable as unknown as GameDef;
    })();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 44005, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [TARGET_PROVINCE]: [makeToken('ia-drang-no-unshaded-us', 'troops', 'US', { type: 'troops' })],
      },
    };

    const unshadedMove = findCard44Move(def, setup, 'unshaded');
    assert.equal(
      unshadedMove,
      undefined,
      'Ia Drang unshaded should be absent when every strict viability grant is unusable in current state',
    );
  });

  it('rejects free Sweep before Air Lift sequence step resolves', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 44006, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
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
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [TARGET_PROVINCE]: [makeToken('ia-drang-seq-nva', 'troops', 'NVA', { type: 'troops' })],
      },
    };

    const eventMove = findCard44Move(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected card-44 unshaded move');
    const afterEvent = applyMove(def, setup, eventMove!).state;

    assert.throws(
      () => applyMove(def, afterEvent, { actionId: asActionId('sweep'), params: { $targetSpaces: [TARGET_PROVINCE] }, freeOperation: true }),
      () => true,
      'Attempting a later sequence step as free operation should be rejected before Air Lift resolves',
    );
  });
});
