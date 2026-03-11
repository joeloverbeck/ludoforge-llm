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
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-67';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const SAIGON = 'saigon:none';
const CAM_RANH = 'cam-ranh:none';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TIN = 'quang-tin-quang-ngai:none';
const PLEIKU = 'pleiku-darlac:none';
const COASTAL_LOC = 'loc-hue-da-nang:none';

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

const findCardMove = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch),
  );

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const nameIs = (name: string) => (request: ChoicePendingRequest) => request.name === name;
const nameIncludes = (fragment: string) => (request: ChoicePendingRequest) => request.name.includes(fragment);

describe('FITL card-67 Amphib Landing', () => {
  it('unshaded US branch relocates US Troops, grants Monsoon-legal free Sweep, and constrains both free ops to the selected coastal space', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = withLookaheadCoup(def, clearAllZones(initialState(def, 67001, 4).state), true);
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
        [SAIGON]: [makeToken('us-saigon-troop', 'troops', 'US', { type: 'troops' })],
        [HUE]: [makeToken('vc-hue-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })],
        [DA_NANG]: [
          makeToken('us-da-nang-troop', 'troops', 'US', { type: 'troops' }),
          makeToken('vc-da-nang-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
      },
    };

    const move = findCardMove(def, setup, 'unshaded', 'amphib-landing-execute-as-us');
    assert.notEqual(move, undefined, 'Expected card-67 US branch event move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: nameIs('$amphibLandingOperationSpace'), value: HUE },
      { when: nameIs('$amphibLandingUsSourceSpace'), value: [SAIGON] },
      { when: nameIncludes('$amphibLandingUsTroops@'), value: [asTokenId('us-saigon-troop')] },
      { when: nameIncludes('$amphibLandingUsDestination@'), value: HUE },
    ];
    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countTokens(afterEvent, SAIGON, (token) => token.id === asTokenId('us-saigon-troop')), 0);
    assert.equal(countTokens(afterEvent, HUE, (token) => token.id === asTokenId('us-saigon-troop')), 1);

    const pending = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 2);
    assert.equal(pending[0]?.seat, 'us');
    assert.equal(pending[1]?.seat, 'us');

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

    const freeSweep = legalMoves(def, grantReadyState).find(
      (candidate) => String(candidate.actionId) === 'sweep' && candidate.freeOperation === true,
    );
    assert.notEqual(freeSweep, undefined, 'Expected Monsoon-legal free Sweep');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, grantReadyState, {
          ...freeSweep!,
          params: { ...freeSweep!.params, $targetSpaces: [DA_NANG], $movingAdjacentTroops: [] },
        }),
      /Illegal move|outside options domain|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'Free Sweep must stay restricted to the event-selected coastal space',
    );

    const afterSweep = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeSweep!,
      params: { ...freeSweep!.params, $targetSpaces: [HUE], $movingAdjacentTroops: [] },
    }).state;

    const hueGuerrilla = (afterSweep.zones[HUE] ?? []).find(
      (token) => token.id === asTokenId('vc-hue-underground'),
    ) as Token | undefined;
    assert.equal(hueGuerrilla?.props.activity, 'active', 'Free Sweep should activate the underground VC guerrilla');

    const freeAssault = legalMoves(def, afterSweep).find(
      (candidate) => String(candidate.actionId) === 'assault' && candidate.freeOperation === true,
    );
    assert.notEqual(freeAssault, undefined, 'Expected follow-up free Assault');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, afterSweep, {
          ...freeAssault!,
          params: { ...freeAssault!.params, $targetSpaces: [DA_NANG], $arvnFollowupSpaces: [] },
        }),
      /Illegal move|outside options domain|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'Free Assault must stay restricted to the same coastal space',
    );

    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      ...freeAssault!,
      params: { ...freeAssault!.params, $targetSpaces: [HUE], $arvnFollowupSpaces: [] },
    }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('vc-hue-underground')),
      1,
      'Free Assault should remove the activated VC guerrilla from the selected coastal space',
    );
  });

  it('unshaded ARVN branch relocates ARVN Troops and resolves free Sweep and Assault at zero ARVN resource cost', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = withLookaheadCoup(def, clearAllZones(initialState(def, 67002, 4).state), true);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(1),
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
            firstEligible: 'arvn',
            secondEligible: 'us',
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
        [CAM_RANH]: [
          makeToken('arvn-cam-ranh-troop-1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('arvn-cam-ranh-troop-2', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [QUANG_TIN]: [makeToken('vc-quang-tin-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })],
      },
    };

    const move = findCardMove(def, setup, 'unshaded', 'amphib-landing-execute-as-arvn');
    assert.notEqual(move, undefined, 'Expected card-67 ARVN branch event move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: nameIs('$amphibLandingOperationSpace'), value: QUANG_TIN },
      { when: nameIs('$amphibLandingArvnSourceSpace'), value: [CAM_RANH] },
      {
        when: nameIncludes('$amphibLandingArvnTroops@'),
        value: [asTokenId('arvn-cam-ranh-troop-1'), asTokenId('arvn-cam-ranh-troop-2')],
      },
      { when: nameIncludes('$amphibLandingArvnDestination@'), value: QUANG_TIN },
    ];
    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(afterEvent, QUANG_TIN, (token) => token.props.faction === 'ARVN' && token.props.type === 'troops'),
      2,
      'ARVN branch should relocate the chosen Troops into the selected coastal operation space',
    );

    const pending = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 2);
    assert.equal(pending[0]?.seat, 'arvn');
    assert.equal(pending[1]?.seat, 'arvn');

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'arvn',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeSweep = legalMoves(def, grantReadyState).find(
      (candidate) => String(candidate.actionId) === 'sweep' && candidate.freeOperation === true,
    );
    assert.notEqual(freeSweep, undefined, 'Expected free ARVN Sweep');

    const afterSweep = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeSweep!,
      params: { ...freeSweep!.params, $targetSpaces: [QUANG_TIN], $movingAdjacentTroops: [] },
    }).state;

    const activatedGuerrilla = (afterSweep.zones[QUANG_TIN] ?? []).find(
      (token) => token.id === asTokenId('vc-quang-tin-underground'),
    ) as Token | undefined;
    assert.equal(activatedGuerrilla?.props.activity, 'active', 'Free ARVN Sweep should activate the underground VC guerrilla');

    const freeAssault = legalMoves(def, afterSweep).find(
      (candidate) => String(candidate.actionId) === 'assault' && candidate.freeOperation === true,
    );
    assert.notEqual(freeAssault, undefined, 'Expected free ARVN Assault');

    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      ...freeAssault!,
      params: { ...freeAssault!.params, $targetSpaces: [QUANG_TIN] },
    }).state;

    assert.equal(final.globalVars.arvnResources, 0, 'Free ARVN operations should not spend ARVN Resources');
    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('vc-quang-tin-underground')),
      1,
      'ARVN free Assault should remove the VC guerrilla after the free Sweep activates it',
    );
  });

  it('shaded relocates up to 3 VC pieces from a coastal source space and queues US/ARVN next-card ineligibility', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 67003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(3),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'vc',
            secondEligible: 'nva',
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
        [QUANG_NAM]: [
          makeToken('vc-coastal-base', 'base', 'VC', { type: 'base' }),
          makeToken('vc-coastal-g1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('vc-coastal-g2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-67 shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: nameIs('$amphibLandingVcSourceSpace'), value: QUANG_NAM },
      {
        when: nameIs('$amphibLandingVcPieces'),
        value: [asTokenId('vc-coastal-base'), asTokenId('vc-coastal-g1'), asTokenId('vc-coastal-g2')],
      },
      { when: nameIncludes('$amphibLandingVcDestination@vc-coastal-base'), value: PLEIKU },
      { when: nameIncludes('$amphibLandingVcDestination@vc-coastal-g1'), value: COASTAL_LOC },
      { when: nameIncludes('$amphibLandingVcDestination@vc-coastal-g2'), value: HUE },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countTokens(final, QUANG_NAM, (token) => token.props.faction === 'VC'), 0);
    assert.equal(countTokens(final, PLEIKU, (token) => token.id === asTokenId('vc-coastal-base')), 1);
    assert.equal(countTokens(final, COASTAL_LOC, (token) => token.id === asTokenId('vc-coastal-g1')), 1);
    assert.equal(countTokens(final, HUE, (token) => token.id === asTokenId('vc-coastal-g2')), 1);
    assert.deepEqual(
      requireCardDrivenRuntime(final).pendingEligibilityOverrides,
      [
        { seat: 'us', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
        { seat: 'arvn', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
      ],
      'Shaded should queue both US and ARVN as ineligible through the next card',
    );
  });

  it('shaded forbids relocating a VC Base onto a LoC', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 67004, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(3),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'vc',
            secondEligible: 'nva',
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
        [QUANG_NAM]: [makeToken('vc-base-only', 'base', 'VC', { type: 'base' })],
      },
    };

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-67 shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: nameIs('$amphibLandingVcSourceSpace'), value: QUANG_NAM },
      { when: nameIs('$amphibLandingVcPieces'), value: [asTokenId('vc-base-only')] },
      { when: nameIncludes('$amphibLandingVcDestination@vc-base-only'), value: COASTAL_LOC },
    ];

    assert.throws(
      () => applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }),
      /Illegal move|outside options domain|choiceRuntimeValidationFailed/,
      'VC Base relocation should reject LoC destinations',
    );
  });
});
