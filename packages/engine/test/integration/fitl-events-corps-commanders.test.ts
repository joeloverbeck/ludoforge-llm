import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ILLEGAL_MOVE_REASONS,
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findCard117Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-117'),
  );

const countArvnTroops = (state: GameState, zone: string): number =>
  (state.zones[zone] ?? []).filter((token) => token.props.faction === 'ARVN' && token.type === 'troops').length;

const countArvnPieces = (state: GameState, zone: string): number =>
  (state.zones[zone] ?? []).filter((token) => token.props.faction === 'ARVN').length;

const setupState = (def: GameDef, seed: number, zones: Readonly<Record<string, readonly Token[]>>): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  assert.equal(base.turnOrderState.type, 'cardDriven');
  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
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
      'played:none': [makeToken('card-117', 'card', 'none')],
      ...zones,
    },
  };
};

describe('FITL card-117 Corps Commanders', () => {
  it('unshaded places up to 3 ARVN Troops from Available/out-of-play into 1-2 adjacent spaces and grants one free Sweep per selected space', () => {
    const def = compileDef();
    const setup = setupState(def, 11701, {
      'available-ARVN:none': [
        makeToken('arvn-avail-1', 'troops', 'ARVN'),
        makeToken('arvn-avail-2', 'troops', 'ARVN'),
      ],
      'out-of-play-ARVN:none': [makeToken('arvn-oop-1', 'troops', 'ARVN')],
      'hue:none': [makeToken('vc-hue-1', 'guerrilla', 'VC')],
      'quang-tri-thua-thien:none': [makeToken('vc-qt-1', 'guerrilla', 'VC')],
      'saigon:none': [
        makeToken('arvn-saigon-1', 'troops', 'ARVN'),
        makeToken('vc-saigon-1', 'guerrilla', 'VC'),
      ],
    });

    const move = findCard117Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-117 unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$anchorSpace', value: 'hue:none' },
      { when: (req) => req.name === '$adjacentSpace', value: ['quang-tri-thua-thien:none'] },
      { when: (req) => req.name === '$selectedTroops', value: ['arvn-avail-1', 'arvn-avail-2', 'arvn-oop-1'] },
      { when: (req) => req.name === '$troopsToAnchor', value: ['arvn-avail-1', 'arvn-avail-2'] },
      { when: (req) => req.name === '$selectedAdjacent', value: 'quang-tri-thua-thien:none' },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countArvnTroops(result, 'hue:none'), 2);
    assert.equal(countArvnTroops(result, 'quang-tri-thua-thien:none'), 1);
    assert.equal(countArvnTroops(result, 'available-ARVN:none'), 0);
    assert.equal(countArvnTroops(result, 'out-of-play-ARVN:none'), 0);

    const pending = requireCardDrivenRuntime(result).pendingFreeOperationGrants ?? [];
    const card117Grants = pending.filter((grant) => grant.seat === 'arvn' && grant.actionIds?.[0] === 'sweep');
    assert.equal(card117Grants.length, 2, 'Expected one free Sweep grant per selected space');
    assert.equal(card117Grants.every((grant) => grant.seat === 'arvn'), true);
    assert.equal(card117Grants.every((grant) => grant.operationClass === 'operation'), true);
    assert.equal(card117Grants.every((grant) => grant.actionIds?.[0] === 'sweep'), true);

    const arvnTurnState = { ...result, activePlayer: asPlayerId(1) };
    assert.throws(
      () =>
        applyMove(def, arvnTurnState, {
          actionId: asActionId('sweep'),
          params: { targetSpaces: ['saigon:none'] },
          freeOperation: true,
        }),
      (error: unknown) =>
        error instanceof Error &&
        'reason' in error &&
        (error as { reason?: string }).reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED,
      'Free Sweep must be restricted to the event-selected spaces',
    );
  });

  it('unshaded supports partial execution when fewer than 3 ARVN Troops are in Available/out-of-play', () => {
    const def = compileDef();
    const setup = setupState(def, 11702, {
      'available-ARVN:none': [makeToken('arvn-avail-only', 'troops', 'ARVN')],
      'hue:none': [makeToken('vc-hue-1', 'guerrilla', 'VC')],
    });

    const move = findCard117Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-117 unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$anchorSpace', value: 'hue:none' },
      { when: (req) => req.name === '$adjacentSpace', value: [] },
      { when: (req) => req.name === '$selectedTroops', value: ['arvn-avail-only'] },
      { when: (req) => req.name === '$troopsToAnchor', value: [] },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countArvnTroops(result, 'hue:none'), 1);
    assert.equal(countArvnTroops(result, 'available-ARVN:none'), 0);
    assert.equal(
      (requireCardDrivenRuntime(result).pendingFreeOperationGrants ?? []).filter(
        (grant) => grant.seat === 'arvn' && grant.actionIds?.[0] === 'sweep',
      ).length,
      1,
      'Selecting one destination space should yield one free Sweep grant',
    );
  });

  it('unshaded enforces placing exactly 3 Troops when 3 are available/out-of-play', () => {
    const def = compileDef();
    const setup = setupState(def, 11712, {
      'available-ARVN:none': [
        makeToken('arvn-avail-1', 'troops', 'ARVN'),
        makeToken('arvn-avail-2', 'troops', 'ARVN'),
      ],
      'out-of-play-ARVN:none': [makeToken('arvn-oop-1', 'troops', 'ARVN')],
      'hue:none': [makeToken('vc-hue-1', 'guerrilla', 'VC')],
    });

    const move = findCard117Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-117 unshaded event move');

    const invalidOverrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$anchorSpace', value: 'hue:none' },
      { when: (req) => req.name === '$adjacentSpace', value: [] },
      { when: (req) => req.name === '$selectedTroops', value: ['arvn-avail-1', 'arvn-avail-2'] },
    ];
    assert.throws(
      () => applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides: invalidOverrides }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('shaded removes a die roll of ARVN pieces from selected adjacent spaces only and queues ARVN next-card ineligibility', () => {
    const def = compileDef();
    const setup = setupState(def, 11703, {
      'quang-tri-thua-thien:none': [
        makeToken('arvn-qt-1', 'troops', 'ARVN'),
        makeToken('arvn-qt-2', 'police', 'ARVN'),
      ],
      'da-nang:none': [makeToken('arvn-da-nang-1', 'troops', 'ARVN')],
    });

    const move = findCard117Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-117 shaded event move');

    const overrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$anchorSpace', value: 'hue:none' },
      { when: (req) => req.name === '$adjacentSpace', value: ['quang-tri-thua-thien:none'] },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides });
    const final = result.state;

    assert.equal(countArvnPieces(final, 'da-nang:none'), 1, 'Removal must not affect non-selected spaces');
    assert.ok(
      countArvnPieces(final, 'quang-tri-thua-thien:none') <= 1,
      'At least one ARVN piece should be removed from selected adjacent spaces',
    );
    assert.deepEqual(
      requireCardDrivenRuntime(final).pendingEligibilityOverrides,
      [{ seat: 'arvn', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' }],
      'Shaded should queue ARVN ineligible through next card',
    );
  });
});
