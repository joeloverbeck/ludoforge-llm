import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
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

const CARD_ID = 'card-62';
const SAIGON = 'saigon:none';
const DA_NANG = 'da-nang:none';
const NORTHEAST_CAMBODIA = 'northeast-cambodia:none';
const PARROTS_BEAK = 'the-parrots-beak:none';

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

const withLookaheadCoup = (def: GameDef, state: GameState): GameState => {
  if (state.turnOrderState.type !== 'cardDriven' || def.turnOrder?.type !== 'cardDriven') {
    return state;
  }
  const lookaheadZone = def.turnOrder.config.turnFlow.cardLifecycle.lookahead;
  const lookahead = state.zones[lookaheadZone] ?? [];
  const [top, ...rest] = lookahead;
  const coupTop: Token = top === undefined
    ? makeToken('cambodian-civil-war-lookahead', 'card', 'none', { isCoup: true })
    : {
      ...top,
      props: {
        ...top.props,
        isCoup: true,
      },
    };
  return {
    ...state,
    zones: {
      ...state.zones,
      [lookaheadZone]: [coupTop, ...rest],
    },
  };
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc',
  zones: Readonly<Record<string, readonly Token[]>>,
  globalVarOverrides?: Readonly<Record<string, number | boolean>>,
): GameState => {
  const base = withLookaheadCoup(def, clearAllZones(initialState(def, seed, 4).state));
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      ...(globalVarOverrides ?? {}),
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
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && (branch === undefined || move.params.branch === branch),
  );

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-62 Cambodian Civil War', () => {
  it('encodes exact text plus dual unshaded branches for US-vs-ARVN Cambodia Sweep follow-ups', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(
      card?.unshaded?.text,
      'US free Air Lifts into and US or ARVN free Sweeps within Cambodia. Remove 2 NVA/VC Bases from Cambodia.',
    );
    assert.equal(card?.shaded?.text, 'NVA places a total of 12 NVA Troops and Guerrillas in Cambodia.');
    assert.equal(card?.unshaded?.effectTiming, 'afterGrants');

    const branches = card?.unshaded?.branches ?? [];
    assert.deepEqual(
      branches.map((branch) => branch.id),
      ['cambodian-civil-war-us-sweep', 'cambodian-civil-war-arvn-sweep'],
    );

    const usBranchGrants = branches[0]?.freeOperationGrants ?? [];
    assert.equal(usBranchGrants.length, 2);
    assert.equal(usBranchGrants[0]?.seat, 'us');
    assert.deepEqual(usBranchGrants[0]?.actionIds, ['airLift']);
    assert.deepEqual(usBranchGrants[0]?.executionContext?.airLiftDestinationProfile, { scalarArray: ['cambodia-only'] });
    assert.equal(usBranchGrants[1]?.seat, 'us');
    assert.deepEqual(usBranchGrants[1]?.actionIds, ['sweep']);
    assert.equal(usBranchGrants[1]?.allowDuringMonsoon, true);

    const arvnBranchGrants = branches[1]?.freeOperationGrants ?? [];
    assert.equal(arvnBranchGrants.length, 2);
    assert.equal(arvnBranchGrants[0]?.seat, 'us');
    assert.deepEqual(arvnBranchGrants[0]?.actionIds, ['airLift']);
    assert.deepEqual(arvnBranchGrants[0]?.executionContext?.airLiftDestinationProfile, { scalarArray: ['cambodia-only'] });
    assert.equal(arvnBranchGrants[1]?.seat, 'arvn');
    assert.deepEqual(arvnBranchGrants[1]?.actionIds, ['sweep']);
    assert.equal(arvnBranchGrants[1]?.allowDuringMonsoon, true);
  });

  it('unshaded US-sweep branch hands control from ARVN to US, enforces Cambodia-only Air Lift destinations, allows Monsoon Sweep, and removes exactly 2 untunneled bases', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 62001, 1, 'arvn', 'us', {
      [SAIGON]: [
        makeToken('ccw-us-origin', 'troops', 'US', { type: 'troops' }),
        makeToken('ccw-arvn-origin', 'troops', 'ARVN', { type: 'troops' }),
      ],
      [NORTHEAST_CAMBODIA]: [
        makeToken('ccw-vc-base-untunneled', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        makeToken('ccw-vc-base-tunneled', 'base', 'VC', { type: 'base', tunnel: 'tunneled' }),
      ],
      [PARROTS_BEAK]: [
        makeToken('ccw-nva-base-untunneled', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' }),
      ],
    });

    const eventMove = findCardMove(def, setup, 'unshaded', 'cambodian-civil-war-us-sweep');
    assert.notEqual(eventMove, undefined, 'Expected card-62 US-sweep branch');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(afterEvent.activePlayer, asPlayerId(0), 'US should decide the Air Lift details');
    assert.equal(pendingAfterEvent.length, 2);
    assert.equal(pendingAfterEvent[0]?.seat, 'us');
    assert.equal(pendingAfterEvent[1]?.seat, 'us');

    const freeAirLift = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'airLift' && move.freeOperation === true,
    );
    assert.notEqual(freeAirLift, undefined, 'Expected free Air Lift after event');

    assert.throws(
      () =>
        applyMove(def, afterEvent, {
          ...freeAirLift!,
          params: {
            ...freeAirLift!.params,
            $spaces: [SAIGON, DA_NANG],
            $usLiftTroops: ['ccw-us-origin'],
            '$usLiftDestination@ccw-us-origin': DA_NANG,
            $coinLiftPieces: [],
          },
        }),
      () => true,
      'Air Lift destinations outside Cambodia should be rejected',
    );

    const afterAirLift = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...freeAirLift!,
      params: {
        ...freeAirLift!.params,
        $spaces: [SAIGON, NORTHEAST_CAMBODIA],
        $usLiftTroops: ['ccw-us-origin'],
        '$usLiftDestination@ccw-us-origin': NORTHEAST_CAMBODIA,
        $coinLiftPieces: [],
      },
    }).state;

    assert.equal(
      countTokens(afterAirLift, NORTHEAST_CAMBODIA, (token) => token.id === asTokenId('ccw-us-origin')),
      1,
      'Air Lift should move US troops into Cambodia',
    );
    assert.equal(afterAirLift.activePlayer, asPlayerId(0), 'US should remain the decision maker for the US Sweep branch');

    const sweepMoves = legalMoves(def, afterAirLift).filter((move) => String(move.actionId) === 'sweep');
    assert.equal(sweepMoves.length > 0, true, 'Expected free Sweep after Air Lift');
    assert.equal(
      sweepMoves.every((move) => move.freeOperation === true),
      true,
      'During Monsoon, only the grant-marked Cambodia Sweep should be legal',
    );

    const freeSweep = sweepMoves[0];
    const final = applyMoveWithResolvedDecisionIds(def, afterAirLift, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [NORTHEAST_CAMBODIA],
        $movingAdjacentTroops: [],
      },
    }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('ccw-vc-base-untunneled')),
      1,
      'Untunneled VC base should be removed after the grant sequence',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.id === asTokenId('ccw-nva-base-untunneled')),
      1,
      'Untunneled NVA base should be removed after the grant sequence',
    );
    assert.equal(
      countTokens(final, NORTHEAST_CAMBODIA, (token) => token.id === asTokenId('ccw-vc-base-tunneled')),
      1,
      'Tunneled bases should remain immune to Cambodian Civil War unshaded removal',
    );
    assert.deepEqual(requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? [], []);
  });

  it('unshaded ARVN-sweep branch hands control from US to ARVN and keeps ARVN Sweep free during Monsoon', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 62002, 0, 'us', 'nva', {
      [SAIGON]: [
        makeToken('ccw-us-origin-arvn-branch', 'troops', 'US', { type: 'troops' }),
        makeToken('ccw-arvn-origin-arvn-branch', 'troops', 'ARVN', { type: 'troops' }),
      ],
      [PARROTS_BEAK]: [
        makeToken('ccw-vc-base-arvn-branch', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
      ],
    }, {
      arvnResources: 9,
    });

    const eventMove = findCardMove(def, setup, 'unshaded', 'cambodian-civil-war-arvn-sweep');
    assert.notEqual(eventMove, undefined, 'Expected card-62 ARVN-sweep branch');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    assert.equal(afterEvent.activePlayer, asPlayerId(0), 'US should resolve the opening Air Lift');

    const freeAirLift = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'airLift' && move.freeOperation === true,
    );
    assert.notEqual(freeAirLift, undefined, 'Expected free Air Lift after event');

    const afterAirLift = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...freeAirLift!,
      params: {
        ...freeAirLift!.params,
        $spaces: [SAIGON, PARROTS_BEAK],
        $usLiftTroops: [],
        $coinLiftPieces: ['ccw-arvn-origin-arvn-branch'],
        '$coinLiftDestination@ccw-arvn-origin-arvn-branch': PARROTS_BEAK,
      },
    }).state;

    const pendingAfterAirLift = requireCardDrivenRuntime(afterAirLift).pendingFreeOperationGrants ?? [];
    assert.equal(afterAirLift.activePlayer, asPlayerId(1), 'ARVN should decide the follow-up Sweep details');
    assert.equal(pendingAfterAirLift.length, 1);
    assert.equal(pendingAfterAirLift[0]?.seat, 'arvn');

    const arvnBefore = Number(afterAirLift.globalVars.arvnResources);
    const freeSweep = legalMoves(def, afterAirLift).find(
      (move) => String(move.actionId) === 'sweep' && move.freeOperation === true,
    );
    assert.notEqual(freeSweep, undefined, 'Expected ARVN free Sweep after US Air Lift');

    const final = applyMoveWithResolvedDecisionIds(def, afterAirLift, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [PARROTS_BEAK],
        $movingAdjacentTroops: [],
      },
    }).state;

    assert.equal(final.globalVars.arvnResources, arvnBefore, 'ARVN follow-up Sweep should remain free');
    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('ccw-vc-base-arvn-branch')),
      1,
      'The post-sequence base removal should still fire on the ARVN branch',
    );
    assert.deepEqual(requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? [], []);
  });

  it('unshaded removes only the available untunneled base when fewer than 2 exist in Cambodia', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 62003, 1, 'arvn', 'us', {
      [SAIGON]: [makeToken('ccw-us-origin-single-base', 'troops', 'US', { type: 'troops' })],
      [NORTHEAST_CAMBODIA]: [
        makeToken('ccw-single-vc-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        makeToken('ccw-single-vc-tunnel', 'base', 'VC', { type: 'base', tunnel: 'tunneled' }),
      ],
    });

    const eventMove = findCardMove(def, setup, 'unshaded', 'cambodian-civil-war-us-sweep');
    assert.notEqual(eventMove, undefined, 'Expected card-62 US-sweep branch');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
    const freeAirLift = legalMoves(def, afterEvent).find(
      (move) => String(move.actionId) === 'airLift' && move.freeOperation === true,
    );
    assert.notEqual(freeAirLift, undefined, 'Expected free Air Lift after event');

    const afterAirLift = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      ...freeAirLift!,
      params: {
        ...freeAirLift!.params,
        $spaces: [SAIGON, NORTHEAST_CAMBODIA],
        $usLiftTroops: ['ccw-us-origin-single-base'],
        '$usLiftDestination@ccw-us-origin-single-base': NORTHEAST_CAMBODIA,
        $coinLiftPieces: [],
      },
    }).state;

    const freeSweep = legalMoves(def, afterAirLift).find(
      (move) => String(move.actionId) === 'sweep' && move.freeOperation === true,
    );
    assert.notEqual(freeSweep, undefined, 'Expected free Sweep after Air Lift');

    const final = applyMoveWithResolvedDecisionIds(def, afterAirLift, {
      ...freeSweep!,
      params: {
        ...freeSweep!.params,
        $targetSpaces: [NORTHEAST_CAMBODIA],
        $movingAdjacentTroops: [],
      },
    }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('ccw-single-vc-base')),
      1,
      'The lone untunneled insurgent base should be removed',
    );
    assert.equal(
      countTokens(final, NORTHEAST_CAMBODIA, (token) => token.id === asTokenId('ccw-single-vc-tunnel')),
      1,
      'A tunneled base should remain even when it is the only other insurgent base present',
    );
  });

  it('shaded places exactly 12 NVA Troops/Guerrillas in Cambodia when enough are available', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const available: Token[] = [
      ...Array.from({ length: 8 }, (_, index) => makeToken(`ccw-shaded-t-${index + 1}`, 'troops', 'NVA', { type: 'troops' })),
      ...Array.from({ length: 5 }, (_, index) => makeToken(`ccw-shaded-g-${index + 1}`, 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' })),
      makeToken('ccw-shaded-base-ignored', 'base', 'NVA', { type: 'base' }),
    ];

    const base = clearAllZones(initialState(def, 62004, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        'available-NVA:none': available,
      },
    };

    const shadedMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request: ChoicePendingRequest) => request.decisionKey.includes('distributeTokens.selectTokens'),
        value: available
          .filter((token) => token.id !== asTokenId('ccw-shaded-g-5') && token.id !== asTokenId('ccw-shaded-base-ignored'))
          .map((token) => String(token.id)),
      },
      {
        when: (request: ChoicePendingRequest) => request.decisionKey.includes('distributeTokens.chooseDestination'),
        value: NORTHEAST_CAMBODIA,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, { overrides }).state;

    assert.equal(
      countTokens(final, NORTHEAST_CAMBODIA, (token) => token.props.faction === 'NVA' && (token.type === 'troops' || token.type === 'guerrilla')),
      12,
      'Shaded should place a total of 12 NVA Troops/Guerrillas into Cambodia',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.id === asTokenId('ccw-shaded-g-5')),
      1,
      'One eligible NVA piece should remain Available after placing 12 of 13',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.id === asTokenId('ccw-shaded-base-ignored')),
      1,
      'NVA Bases should not be eligible for shaded placement',
    );
  });

  it('shaded places all available eligible NVA Troops/Guerrillas when fewer than 12 exist', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const available = [
      makeToken('ccw-shaded-few-t-1', 'troops', 'NVA', { type: 'troops' }),
      makeToken('ccw-shaded-few-t-2', 'troops', 'NVA', { type: 'troops' }),
      makeToken('ccw-shaded-few-g-1', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
    ];

    const base = clearAllZones(initialState(def, 62005, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        'available-NVA:none': available,
      },
    };

    const shadedMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request: ChoicePendingRequest) => request.decisionKey.includes('distributeTokens.chooseDestination'),
        value: PARROTS_BEAK,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, { overrides }).state;

    assert.equal(
      countTokens(final, PARROTS_BEAK, (token) => token.props.faction === 'NVA' && (token.type === 'troops' || token.type === 'guerrilla')),
      3,
      'Shaded should place every eligible NVA Troop/Guerrilla when fewer than 12 are available',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && (token.type === 'troops' || token.type === 'guerrilla')),
      0,
      'No eligible NVA Troops/Guerrillas should remain Available after the capped placement',
    );
  });
});
