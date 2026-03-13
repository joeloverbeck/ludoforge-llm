import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-75';
const TAY_NINH = 'tay-ninh:none';
const FISHHOOK = 'the-fishhook:none';
const PARROTS_BEAK = 'the-parrots-beak:none';
const NE_CAMBODIA = 'northeast-cambodia:none';
const SOUTHERN_LAOS = 'southern-laos:none';
const CENTRAL_LAOS = 'central-laos:none';

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

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly monsoon?: boolean;
    readonly arvnResources?: number;
    readonly nvaResources?: number;
    readonly vcResources?: number;
    readonly trail?: number;
  },
): GameState => {
  const base = withLookaheadCoup(def, clearAllZones(initialState(def, seed, 4).state), options?.monsoon === true);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      ...(options?.arvnResources === undefined ? {} : { arvnResources: options.arvnResources }),
      ...(options?.nvaResources === undefined ? {} : { nvaResources: options.nvaResources }),
      ...(options?.vcResources === undefined ? {} : { vcResources: options.vcResources }),
      ...(options?.trail === undefined ? {} : { trail: options.trail }),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
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
      ...zones,
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

describe('FITL card-75 Sihanouk', () => {
  it('unshaded US branch keeps Sweep Monsoon-legal, restricts both free ops to Cambodia, and preserves the free ARVN follow-up', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 75001, 0, 'us', 'arvn', {
      [TAY_NINH]: [
        makeToken('sihanouk-us-troop-1', 'troops', 'US', { type: 'troops' }),
        makeToken('sihanouk-us-troop-2', 'troops', 'US', { type: 'troops' }),
      ],
      [FISHHOOK]: [
        makeToken('sihanouk-arvn-troop', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('sihanouk-vc-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
    }, {
      monsoon: true,
      arvnResources: 0,
    });

    const eventMove = findCardMove(def, setup, 'unshaded', 'sihanouk-execute-as-us');
    assert.notEqual(eventMove, undefined, 'Expected Sihanouk US branch');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const freeSweep = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'sweep' && move.freeOperation === true,
    );
    assert.notEqual(freeSweep, undefined, 'Expected Monsoon-legal free Sweep');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, afterEvent, {
          ...freeSweep!,
          params: {
            ...freeSweep!.params,
            $targetSpaces: [TAY_NINH],
            $movingAdjacentTroops: [],
          },
        }),
      /Illegal move|outside options domain|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'Free Sweep must stay Cambodia-only',
    );

    const afterSweep = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [FISHHOOK],
        $movingAdjacentTroops: ['sihanouk-us-troop-1', 'sihanouk-us-troop-2'],
      },
    }).state;

    const sweptGuerrilla = (afterSweep.zones[FISHHOOK] ?? []).find((token) => token.id === asTokenId('sihanouk-vc-underground')) as Token | undefined;
    assert.equal(sweptGuerrilla?.props.activity, 'active');

    const freeAssault = legalMoves(def, afterSweep).find(
      (move) => String(move.actionId) === 'assault' && move.freeOperation === true,
    );
    assert.notEqual(freeAssault, undefined, 'Expected follow-up free Assault');

    const arvnBefore = Number(afterSweep.globalVars.arvnResources);
    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      ...freeAssault!,
      params: {
        ...freeAssault!.params,
        $targetSpaces: [FISHHOOK],
        $arvnFollowupSpaces: [FISHHOOK],
      },
    }).state;

    assert.equal(final.globalVars.arvnResources, arvnBefore, 'ARVN follow-up should remain free on the US branch');
    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('sihanouk-vc-underground')),
      1,
      'US branch Assault should remove the activated VC guerrilla',
    );
  });

  it('unshaded ARVN branch keeps both free ops in Cambodia and charges no ARVN Resources', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 75002, 1, 'arvn', 'us', {
      [TAY_NINH]: [
        makeToken('sihanouk-arvn-origin-1', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('sihanouk-arvn-origin-2', 'troops', 'ARVN', { type: 'troops' }),
      ],
      [FISHHOOK]: [makeToken('sihanouk-arvn-target', 'base', 'VC', { type: 'base', tunnel: 'untunneled' })],
    }, {
      monsoon: true,
      arvnResources: 0,
    });

    const eventMove = findCardMove(def, setup, 'unshaded', 'sihanouk-execute-as-arvn');
    assert.notEqual(eventMove, undefined, 'Expected Sihanouk ARVN branch');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const freeSweep = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'sweep' && move.freeOperation === true,
    );
    assert.notEqual(freeSweep, undefined, 'Expected ARVN free Sweep');

    const afterSweep = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [FISHHOOK],
        [`$movingTroops@${FISHHOOK}`]: ['sihanouk-arvn-origin-1', 'sihanouk-arvn-origin-2'],
      },
    }).state;

    const freeAssault = legalMoves(def, afterSweep).find(
      (move) => String(move.actionId) === 'assault' && move.freeOperation === true,
    );
    assert.notEqual(freeAssault, undefined, 'Expected ARVN follow-up free Assault');

    const arvnBefore = Number(afterSweep.globalVars.arvnResources);
    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      ...freeAssault!,
      params: {
        ...freeAssault!.params,
        $targetSpaces: [FISHHOOK],
      },
    }).state;

    assert.equal(final.globalVars.arvnResources, arvnBefore, 'ARVN branch should remain free');
    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('sihanouk-arvn-target')),
      1,
      'ARVN branch Assault should remove the VC base',
    );
  });

  it('shaded restricts VC March origins to the just-Rallyd space and preserves NVA Trail chaining after the initial restricted move', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 75003, 3, 'vc', 'nva', {
      [TAY_NINH]: [makeToken('sihanouk-vc-outside', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })],
      'available-VC:none': [makeToken('sihanouk-vc-rally', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })],
      'available-NVA:none': [makeToken('sihanouk-nva-rally', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' })],
    }, {
      nvaResources: 5,
      vcResources: 5,
      trail: 1,
    });

    const eventMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected Sihanouk shaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const vcRally = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'rally' && move.freeOperation === true,
    );
    assert.notEqual(vcRally, undefined, 'Expected VC free Rally first');

    const afterVcRally = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...vcRally!,
      params: {
        ...vcRally!.params,
        $targetSpaces: [FISHHOOK],
        $noBaseChoice: 'place-guerrilla',
      },
    }).state;

    const vcMarch = legalMoves(def, afterVcRally).find(
      (move) => String(move.actionId) === 'march' && move.freeOperation === true,
    );
    assert.notEqual(vcMarch, undefined, 'Expected VC free March after Rally');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, afterVcRally, {
          ...vcMarch!,
          params: {
            ...vcMarch!.params,
            $targetSpaces: [PARROTS_BEAK],
            $chainSpaces: [],
            [`$movingGuerrillas@${PARROTS_BEAK}`]: ['sihanouk-vc-outside'],
            [`$movingTroops@${PARROTS_BEAK}`]: [],
          },
        }),
      /Illegal move|choiceRuntimeValidationFailed|outside options domain|ACTION_NOT_LEGAL_IN_CURRENT_STATE/,
      'VC March must not allow movers from non-Rally spaces',
    );

    const afterVcMarch = applyMoveWithResolvedDecisionIds(def, afterVcRally, {
      ...vcMarch!,
      params: {
        ...vcMarch!.params,
        $targetSpaces: [PARROTS_BEAK],
        $chainSpaces: [],
        [`$movingGuerrillas@${PARROTS_BEAK}`]: ['sihanouk-vc-rally'],
        [`$movingTroops@${PARROTS_BEAK}`]: [],
      },
    }).state;

    assert.equal(
      countTokens(afterVcMarch, PARROTS_BEAK, (token) => token.id === asTokenId('sihanouk-vc-rally')),
      1,
      'VC March should allow the just-Rallyd guerrilla to move',
    );
    assert.equal(
      countTokens(afterVcMarch, TAY_NINH, (token) => token.id === asTokenId('sihanouk-vc-outside')),
      1,
      'VC guerrillas outside the Rally set must remain in place',
    );

    const nvaRally = legalMoves(def, afterVcMarch).find(
      (move) => String(move.actionId) === 'rally' && move.freeOperation === true,
    );
    assert.notEqual(nvaRally, undefined, 'Expected NVA free Rally after the VC batch');

    const afterNvaRally = applyMoveWithResolvedDecisionIds(def, afterVcMarch, {
      ...nvaRally!,
      params: {
        ...nvaRally!.params,
        $targetSpaces: [NE_CAMBODIA],
        $noBaseChoice: 'place-guerrilla',
        $improveTrail: 'no',
      },
    }).state;

    const nvaMarch = legalMoves(def, afterNvaRally).find(
      (move) => String(move.actionId) === 'march' && move.freeOperation === true,
    );
    assert.notEqual(nvaMarch, undefined, 'Expected NVA free March after Rally');

    const final = applyMoveWithResolvedDecisionIds(def, afterNvaRally, {
      ...nvaMarch!,
      params: {
        ...nvaMarch!.params,
        $targetSpaces: [SOUTHERN_LAOS],
        $chainSpaces: [CENTRAL_LAOS],
        [`$movingGuerrillas@${SOUTHERN_LAOS}`]: ['sihanouk-nva-rally'],
        [`$movingTroops@${SOUTHERN_LAOS}`]: [],
        [`$movingGuerrillas@${CENTRAL_LAOS}`]: ['sihanouk-nva-rally'],
        [`$movingTroops@${CENTRAL_LAOS}`]: [],
      },
    }).state;

    assert.equal(
      countTokens(final, CENTRAL_LAOS, (token) => token.id === asTokenId('sihanouk-nva-rally')),
      1,
      'NVA Trail chaining should still work after the initial origin-restricted move',
    );
  });
});
