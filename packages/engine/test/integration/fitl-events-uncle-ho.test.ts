// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ILLEGAL_MOVE_REASONS,
  applyMove,
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
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-50';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const CAN_THO = 'can-tho:none';
const CENTRAL_LAOS = 'central-laos:none';
const NORTH_VIETNAM = 'north-vietnam:none';

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

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc',
  zones: Readonly<Record<string, readonly Token[]>>,
  { clear = true }: { readonly clear?: boolean } = {},
): GameState => {
  const baseState = clear ? clearAllZones(initialState(def, seed, 4).state) : initialState(def, seed, 4).state;
  const runtime = requireCardDrivenRuntime(baseState);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected production FITL event deck');

  return {
    ...baseState,
    activePlayer: asPlayerId(activePlayer),
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
      ...baseState.zones,
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

const withGrantReadyState = (
  state: GameState,
  activePlayer: 0 | 1 | 2 | 3,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
): GameState => {
  const runtime = requireCardDrivenRuntime(state);
  return {
    ...state,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
};

const countTokens = (state: GameState, zoneId: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const firstGrantedLimitedOperationMove = (def: GameDef, state: GameState): Move | undefined => {
  const operation = legalMoves(def, state).find((move) => move.actionClass === 'operation');
  return operation === undefined
    ? undefined
    : {
        ...operation,
        freeOperation: true,
        actionClass: 'limitedOperation',
      };
};

describe('FITL card-50 Uncle Ho', () => {
  it('unshaded troop branch moves exactly 4 out-of-play US Troops into South Vietnam destinations and queues 2 ARVN free Limited Operations', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 50001, 2, 'nva', 'arvn', {
      'out-of-play-US:none': [
        makeToken('uncle-ho-us-oop-1', 'troops', 'US'),
        makeToken('uncle-ho-us-oop-2', 'troops', 'US'),
        makeToken('uncle-ho-us-oop-3', 'troops', 'US'),
        makeToken('uncle-ho-us-oop-4', 'troops', 'US'),
        makeToken('uncle-ho-us-oop-5', 'troops', 'US'),
      ],
      [CENTRAL_LAOS]: [makeToken('uncle-ho-laos-marker', 'troops', 'NVA')],
      [NORTH_VIETNAM]: [makeToken('uncle-ho-nv-marker', 'troops', 'NVA')],
    });

    const move = findCardMove(def, setup, 'unshaded', 'place-us-troops-and-arvn-two-free-limited-ops');
    assert.notEqual(move, undefined, 'Expected unshaded Uncle Ho troop branch event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: [
          asTokenId('uncle-ho-us-oop-1'),
          asTokenId('uncle-ho-us-oop-2'),
          asTokenId('uncle-ho-us-oop-3'),
          asTokenId('uncle-ho-us-oop-4'),
        ],
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: SAIGON },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: HUE },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[2]'), value: QUANG_TRI },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[3]'), value: CAN_THO },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Exactly one unselected US Troop should remain out of play',
    );
    assert.equal(countTokens(final, SAIGON, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, HUE, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, QUANG_TRI, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, CAN_THO, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(
      countTokens(final, CENTRAL_LAOS, (token) => token.props.faction === 'US'),
      0,
      'Unshaded troop branch must not place US forces in Laos',
    );
    assert.equal(
      countTokens(final, NORTH_VIETNAM, (token) => token.props.faction === 'US'),
      0,
      'Unshaded troop branch must not place US forces in North Vietnam',
    );

    const pending = requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? [];
    assert.deepEqual(
      pending.map((grant) => ({
        seat: grant.seat,
        operationClass: grant.operationClass,
        sequenceIndex: grant.sequenceIndex,
      })),
      [
        { seat: 'arvn', operationClass: 'limitedOperation', sequenceIndex: 0 },
        { seat: 'arvn', operationClass: 'limitedOperation', sequenceIndex: 1 },
      ],
    );
    assert.equal(pending[0]?.sequenceBatchId, pending[1]?.sequenceBatchId);
    assert.match(String(pending[0]?.sequenceBatchId), /uncle-ho-unshaded-arvn-two$/);
  });

  it('unshaded troop branch executes partially when fewer than 4 out-of-play US Troops exist', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 50002, 2, 'nva', 'arvn', {
      'out-of-play-US:none': [
        makeToken('uncle-ho-few-1', 'troops', 'US'),
        makeToken('uncle-ho-few-2', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', 'place-us-troops-and-arvn-two-free-limited-ops');
    assert.notEqual(move, undefined, 'Expected unshaded Uncle Ho troop branch event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
          value: [asTokenId('uncle-ho-few-1'), asTokenId('uncle-ho-few-2')],
        },
        { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: SAIGON },
        { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: HUE },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'All available out-of-play US Troops should move when fewer than 4 exist',
    );
    assert.equal(countTokens(final, SAIGON, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, HUE, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(
      (requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? []).filter((grant) => grant.seat === 'arvn').length,
      2,
      'ARVN should still receive both free Limited Operations',
    );
  });

  it('unshaded resource branch adds 9 ARVN Resources before granting 2 ARVN free Limited Operations', () => {
    const def = compileDef();
    const baseSetup = setupCardDrivenState(def, 50003, 2, 'nva', 'arvn', {
      'available-ARVN:none': [
        makeToken('uncle-ho-arvn-available-1', 'troops', 'ARVN'),
        makeToken('uncle-ho-arvn-available-2', 'troops', 'ARVN'),
      ],
      'saigon:none': [
        makeToken('uncle-ho-arvn-opener', 'troops', 'ARVN'),
        makeToken('uncle-ho-vc-target', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });
    const setup: GameState = {
      ...baseSetup,
      globalVars: {
        ...baseSetup.globalVars,
        arvnResources: 11,
      },
    };

    const move = findCardMove(def, setup, 'unshaded', 'add-arvn-resources-and-arvn-two-free-limited-ops');
    assert.notEqual(move, undefined, 'Expected unshaded Uncle Ho resources branch event move');

    const afterEvent = applyMove(def, setup, move!).state;
    assert.equal(afterEvent.globalVars.arvnResources, 20, 'ARVN Resources should increase by exactly 9');

    const pending = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 2);
    assert.equal(pending.every((grant) => grant.seat === 'arvn'), true);
    assert.equal(pending.every((grant) => grant.operationClass === 'limitedOperation'), true);

    const arvnGrantReady = withGrantReadyState(afterEvent, 1, 'arvn');
    const freeLimited = firstGrantedLimitedOperationMove(def, arvnGrantReady);
    assert.notEqual(freeLimited, undefined, 'ARVN should have an operation that can consume the granted free Limited Operation');

    const afterFreeLimited = applyMoveWithResolvedDecisionIds(def, arvnGrantReady, freeLimited!).state;
    assert.equal(
      (requireCardDrivenRuntime(afterFreeLimited).pendingFreeOperationGrants ?? []).length,
      1,
      'Consuming one granted ARVN Limited Operation should leave exactly one queued grant',
    );
  });

  it('shaded queues VC then NVA limited-operation chains and only unlocks NVA after 3 VC free Limited Operations resolve', () => {
    const def = compileDef();
    const baseSetup = setupCardDrivenState(def, 50004, 2, 'nva', 'arvn', {
      'available-VC:none': [
        makeToken('uncle-ho-vc-avail-1', 'guerrilla', 'VC'),
        makeToken('uncle-ho-vc-avail-2', 'guerrilla', 'VC'),
        makeToken('uncle-ho-vc-avail-3', 'guerrilla', 'VC'),
        makeToken('uncle-ho-vc-avail-4', 'guerrilla', 'VC'),
      ],
      'available-NVA:none': [
        makeToken('uncle-ho-nva-avail-1', 'guerrilla', 'NVA'),
        makeToken('uncle-ho-nva-avail-2', 'guerrilla', 'NVA'),
        makeToken('uncle-ho-nva-avail-3', 'guerrilla', 'NVA'),
        makeToken('uncle-ho-nva-avail-4', 'guerrilla', 'NVA'),
      ],
      [SAIGON]: [makeToken('uncle-ho-vc-base', 'base', 'VC', { tunnel: 'untunneled' })],
      [QUANG_TRI]: [makeToken('uncle-ho-nva-base', 'base', 'NVA', { tunnel: 'untunneled' })],
    });
    const setup: GameState = {
      ...baseSetup,
      globalVars: {
        ...baseSetup.globalVars,
        trail: 2,
      },
    };

    const move = findCardMove(def, setup, 'shaded', 'vc-then-nva-six-free-limited-ops');
    assert.notEqual(move, undefined, 'Expected shaded Uncle Ho event move');

    const afterEvent = applyMove(def, setup, move!).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.deepEqual(
      pendingAfterEvent.map((grant) => grant.seat),
      ['vc', 'vc', 'vc', 'nva', 'nva', 'nva'],
    );
    assert.equal(pendingAfterEvent.every((grant) => grant.operationClass === 'limitedOperation'), true);

    const nvaLockedState = withGrantReadyState(afterEvent, 2, 'nva');
    const nvaLockedMove = firstGrantedLimitedOperationMove(def, nvaLockedState);
    assert.notEqual(nvaLockedMove, undefined, 'Fixture should offer NVA an operation candidate for lock testing');

    let current = afterEvent;
    for (let index = 0; index < 3; index += 1) {
      const vcGrantReady = withGrantReadyState(current, 3, 'vc');
      const vcMove = firstGrantedLimitedOperationMove(def, vcGrantReady);
      assert.notEqual(vcMove, undefined, `Expected VC free Limited Operation ${index + 1}`);
      current = applyMoveWithResolvedDecisionIds(def, vcGrantReady, vcMove!).state;
    }

    const pendingAfterVc = requireCardDrivenRuntime(current).pendingFreeOperationGrants ?? [];
    assert.deepEqual(
      pendingAfterVc.map((grant) => grant.seat),
      ['nva', 'nva', 'nva'],
      'All VC grants should be consumed before NVA grants unlock',
    );

    const nvaUnlockedState = withGrantReadyState(current, 2, 'nva');
    const nvaMove = firstGrantedLimitedOperationMove(def, nvaUnlockedState);
    assert.notEqual(nvaMove, undefined, 'NVA should gain a free Limited Operation only after the VC chain resolves');

    assert.throws(
      () => applyMoveWithResolvedDecisionIds(def, nvaLockedState, nvaLockedMove!),
      (error: unknown) => {
        if (!(error instanceof Error) || !('reason' in error)) {
          return false;
        }
        const details = error as Error & { reason?: string; context?: { freeOperationDenial?: { cause?: string } } };
        return details.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED
          && details.context?.freeOperationDenial?.cause === 'sequenceLocked';
      },
      'Skipping directly to NVA before the VC chain is spent should be illegal',
    );
  });
});
