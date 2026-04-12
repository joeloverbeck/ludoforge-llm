import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';
import {
  asPlayerId,
  asActionId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';

const CARD_ID = 'card-56';
const SPACE_A = 'tay-ninh:none';
const SPACE_B = 'quang-tri-thua-thien:none';
const SPACE_C = 'quang-nam:none';
const ORIGIN_A = 'saigon:none';
const ORIGIN_B = 'hue:none';

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

const countTokens = (state: GameState, zoneId: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc',
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly monsoon?: boolean;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');
  const lookaheadZone =
    def.turnOrder?.type === 'cardDriven'
      ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
      : null;

  return {
    ...base,
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
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options?.monsoon !== true || lookaheadZone === null
        ? {}
        : { [lookaheadZone]: [makeToken('vo-nguyen-giap-monsoon', 'card', 'none', { isCoup: true })] }),
      ...zones,
    },
  };
};

const findCardMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const withGrantReadyNva = (state: GameState): GameState => {
  const runtime = requireCardDrivenRuntime(state);
  return {
    ...state,
    activePlayer: asPlayerId(2),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'nva',
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

describe('FITL card-56 Vo Nguyen Giap', () => {
  it('unshaded replaces 2 chosen guerrillas in each selected space with 1 NVA Troop', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 56001, 2, 'nva', 'vc', {
      [SPACE_A]: [
        makeToken('giap-a-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('giap-a-vc-2', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('giap-a-nva-1', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [SPACE_B]: [
        makeToken('giap-b-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('giap-b-vc-2', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [SPACE_C]: [
        makeToken('giap-c-nva-1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('giap-c-nva-2', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('giap-c-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      'available-NVA:none': [
        makeToken('giap-avail-t-1', 'troops', 'NVA'),
        makeToken('giap-avail-t-2', 'troops', 'NVA'),
        makeToken('giap-avail-t-3', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Vo Nguyen Giap unshaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (req) => req.name === '$voNguyenGiapUnshadedSpace', value: [SPACE_A, SPACE_B, SPACE_C] },
      {
        when: (req) => req.name === `$voNguyenGiapGuerrillas@${SPACE_A}`,
        value: [asTokenId('giap-a-vc-1'), asTokenId('giap-a-nva-1')],
      },
      {
        when: (req) => req.name === `$voNguyenGiapGuerrillas@${SPACE_B}`,
        value: [asTokenId('giap-b-vc-1'), asTokenId('giap-b-vc-2')],
      },
      {
        when: (req) => req.name === `$voNguyenGiapGuerrillas@${SPACE_C}`,
        value: [asTokenId('giap-c-nva-1'), asTokenId('giap-c-vc-1')],
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countTokens(final, SPACE_A, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, SPACE_B, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, SPACE_C, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(
      countTokens(final, SPACE_A, (token) => token.id === asTokenId('giap-a-vc-2')),
      1,
      'Unchosen guerrillas should remain in place',
    );
    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      4,
      'Chosen VC guerrillas should move to Available',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'guerrilla'),
      2,
      'Chosen NVA guerrillas should move to Available',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'Exactly 3 NVA Troops should enter from Available',
    );
  });

  it('unshaded removes the chosen guerrillas even when no NVA Troops are available to complete the replacement', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 56002, 2, 'nva', 'vc', {
      [SPACE_A]: [
        makeToken('giap-no-troop-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('giap-no-troop-nva-1', 'guerrilla', 'NVA', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Vo Nguyen Giap unshaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        { when: (req) => req.name === '$voNguyenGiapUnshadedSpace', value: [SPACE_A] },
        {
          when: (req) => req.name === `$voNguyenGiapGuerrillas@${SPACE_A}`,
          value: [asTokenId('giap-no-troop-vc-1'), asTokenId('giap-no-troop-nva-1')],
        },
      ],
    }).state;

    assert.equal(countTokens(final, SPACE_A, (token) => token.type === 'guerrilla'), 0);
    assert.equal(countTokens(final, SPACE_A, (token) => token.type === 'troops'), 0);
    assert.equal(countTokens(final, 'available-VC:none', (token) => token.type === 'guerrilla'), 1);
    assert.equal(countTokens(final, 'available-NVA:none', (token) => token.type === 'guerrilla'), 1);
  });

  it('shaded allows Monsoon March into selected spaces and grants one exact-space free follow-up per marched space', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(
      def,
      56003,
      2,
      'nva',
      'vc',
      {
        [ORIGIN_A]: [
          makeToken('giap-march-a', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
        [ORIGIN_B]: [
          makeToken('giap-march-b', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
        'available-NVA:none': [
          makeToken('giap-rally-avail-1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('giap-rally-avail-2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('giap-rally-avail-3', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
      },
      { monsoon: true },
    );

    const eventMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected Vo Nguyen Giap shaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!, {
      overrides: [{ when: (req) => req.name === '$voNguyenGiapShadedSpace', value: [SPACE_A, SPACE_B] }],
    }).state;

    const grantReadyState = withGrantReadyNva(afterEvent);

    const freeBeforeMarch = legalMoves(def, grantReadyState).filter((move) => move.freeOperation === true);
    assert.ok(
      freeBeforeMarch.some((move) => String(move.actionId) === 'march'),
      'The card should grant a free March even during Monsoon',
    );
    assert.equal(
      freeBeforeMarch.some((move) => String(move.actionId) === 'rally'),
      false,
      'Follow-up grants must remain sequence-locked until March resolves',
    );

    const afterMarch = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [SPACE_A, SPACE_B],
        [`$movingGuerrillas@${SPACE_A}`]: [asTokenId('giap-march-a')],
        [`$movingGuerrillas@${SPACE_B}`]: [asTokenId('giap-march-b')],
        [`$movingTroops@${SPACE_A}`]: [],
        [`$movingTroops@${SPACE_B}`]: [],
      },
    }).state;

    const readyAfterMarch = withGrantReadyNva(afterMarch);
    const freeAfterMarch = legalMoves(def, readyAfterMarch).filter(
      (move) => move.freeOperation === true && String(move.actionId) === 'rally',
    );
    assert.ok(freeAfterMarch.length > 0, 'Expected at least one free follow-up action after the March resolves');
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, readyAfterMarch, {
          actionId: asActionId('rally'),
          freeOperation: true,
          params: { $targetSpaces: [SPACE_C], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Follow-up grants must reject non-marched spaces',
    );

    const afterFirstFollowUp = applyMoveWithResolvedDecisionIds(def, readyAfterMarch, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { $targetSpaces: [SPACE_A], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;

    const readyAfterFirst = withGrantReadyNva(afterFirstFollowUp);
    const freeAfterFirst = legalMoves(def, readyAfterFirst).filter(
      (move) => move.freeOperation === true && String(move.actionId) === 'rally',
    );
    assert.ok(
      freeAfterFirst.length > 0,
      'The remaining marched space should retain its free follow-up',
    );
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, readyAfterFirst, {
          actionId: asActionId('rally'),
          freeOperation: true,
          params: { $targetSpaces: [SPACE_A], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
        }),
      /(?:Illegal move|FREE_OPERATION_NOT_GRANTED|choiceRuntimeValidationFailed|outside options domain)/,
      'A marched space should not receive a second free follow-up',
    );

    const final = applyMoveWithResolvedDecisionIds(def, readyAfterFirst, {
      actionId: asActionId('rally'),
      freeOperation: true,
      params: { $targetSpaces: [SPACE_B], $noBaseChoice: 'place-guerrilla', $improveTrail: 'no' },
    }).state;

    assert.deepEqual(
      requireCardDrivenRuntime(final).pendingFreeOperationGrants ?? [],
      [],
      'All exact-space follow-up grants should clear after each marched space uses or skips its one free action',
    );
  });

  it('shaded allows a non-Rally exact-space free Attack follow-up after the free March', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(
      def,
      56004,
      2,
      'nva',
      'vc',
      {
        [ORIGIN_A]: [
          makeToken('giap-attack-a-t1', 'troops', 'NVA'),
          makeToken('giap-attack-a-t2', 'troops', 'NVA'),
        ],
        [SPACE_A]: [
          makeToken('giap-attack-us-t1', 'troops', 'US'),
        ],
      },
    );

    const eventMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected Vo Nguyen Giap shaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!, {
      overrides: [{ when: (req) => req.name === '$voNguyenGiapShadedSpace', value: [SPACE_A] }],
    }).state;

    const grantReadyState = withGrantReadyNva(afterEvent);
    const afterMarch = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [SPACE_A],
        [`$movingGuerrillas@${SPACE_A}`]: [],
        [`$movingTroops@${SPACE_A}`]: [asTokenId('giap-attack-a-t1'), asTokenId('giap-attack-a-t2')],
      },
    }).state;

    const readyAfterMarch = withGrantReadyNva(afterMarch);
    const freeAttackMoves = legalMoves(def, readyAfterMarch).filter(
      (move) => move.freeOperation === true && String(move.actionId) === 'attack',
    );
    assert.ok(freeAttackMoves.length > 0, 'Expected a free Attack follow-up after the March resolves');

    const afterAttack = applyMoveWithResolvedDecisionIds(def, readyAfterMarch, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        $targetSpaces: [SPACE_A],
        $attackMode: 'troops-attack',
      },
    }).state;

    assert.equal(
      countTokens(afterAttack, SPACE_A, (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'The free follow-up Attack should resolve in the marched space and remove the US troop',
    );
    assert.equal(
      countTokens(afterAttack, SPACE_A, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      1,
      'Troops-mode Attack should apply normal attrition after the free follow-up resolves',
    );
    assert.deepEqual(
      requireCardDrivenRuntime(afterAttack).pendingFreeOperationGrants ?? [],
      [],
      'The single marched-space follow-up grant should clear after the Attack resolves',
    );
  });
});
