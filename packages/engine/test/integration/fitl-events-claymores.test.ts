// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const makeToken = (id: string, type: string, faction: string, extra?: Readonly<Record<string, unknown>>): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extra ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findClaymoresMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-17'),
  );

describe('FITL card-17 Claymores', () => {
  it('routes removed US base to casualties on shaded execution while still removing an underground insurgent', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 17001, 4).state);

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-17', 'card', 'none')],
        'saigon:none': [
          makeToken('clay-us-base', 'base', 'US'),
          makeToken('clay-arvn-base', 'base', 'ARVN'),
          makeToken('clay-vc-underground', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    };

    const move = findClaymoresMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-17 shaded move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!, {
      overrides: [{ when: (req) => req.name === '$targetSpace', value: 'saigon:none' }],
    }).state;

    assert.equal(
      (result.zones['casualties-US:none'] ?? []).some((token) => token.id === asTokenId('clay-us-base')),
      true,
      'Claymores shaded should move removed US base to casualties-US:none',
    );
    assert.equal(
      (result.zones['available-VC:none'] ?? []).some((token) => token.id === asTokenId('clay-vc-underground')),
      true,
      'Claymores shaded should move removed underground insurgent to its Available box',
    );
    assert.equal(
      (result.zones['saigon:none'] ?? []).some((token) => token.id === asTokenId('clay-arvn-base')),
      true,
      'Only one COIN base should be removed',
    );
  });

  it('routes removed ARVN base to available on shaded execution', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 17002, 4).state);

    const state: GameState = {
      ...base,
      activePlayer: asPlayerId(3),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-17', 'card', 'none')],
        'hue:none': [
          makeToken('clay-arvn-base-only', 'base', 'ARVN'),
          makeToken('clay-nva-underground', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
      },
    };

    const move = findClaymoresMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-17 shaded move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!, {
      overrides: [{ when: (req) => req.name === '$targetSpace', value: 'hue:none' }],
    }).state;

    assert.equal(
      (result.zones['available-ARVN:none'] ?? []).some((token) => token.id === asTokenId('clay-arvn-base-only')),
      true,
      'Claymores shaded should move removed ARVN base to available-ARVN:none',
    );
    assert.equal(
      (result.zones['casualties-US:none'] ?? []).some((token) => token.id === asTokenId('clay-arvn-base-only')),
      false,
      'ARVN base must not be routed to US casualties',
    );
    assert.equal(
      (result.zones['available-NVA:none'] ?? []).some((token) => token.id === asTokenId('clay-nva-underground')),
      true,
      'Claymores shaded should remove one underground insurgent from the selected space',
    );
  });

  it('queues stay-eligible override immediately on unshaded execution and consumes it at next card boundary', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 17003, 4).state);
    assert.equal(base.turnOrderState.type, 'cardDriven');

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
        'played:none': [makeToken('card-17', 'card', 'none')],
        'lookahead:none': [makeToken('card-101', 'card', 'none')],
        'deck:none': [makeToken('card-55', 'card', 'none')],
      },
    };

    const eventMove = findClaymoresMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected card-17 unshaded move');

    const first = applyMove(def, setup, eventMove!);
    const activeSeatAtExecution = requireCardDrivenRuntime(setup).seatOrder[Number(setup.activePlayer)];
    assert.equal(typeof activeSeatAtExecution, 'string');
    const pendingImmediately = requireCardDrivenRuntime(first.state).pendingEligibilityOverrides ?? [];
    assert.deepEqual(
      pendingImmediately,
      [{ seat: activeSeatAtExecution, eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
      'Claymores unshaded should queue a one-shot nextTurn stay-eligible override for the executing faction',
    );

    let state = first.state;
    for (let i = 0; i < 8; i += 1) {
      const passMove = legalMoves(def, state).find((move) => String(move.actionId) === 'pass');
      assert.notEqual(passMove, undefined, 'Expected pass move while progressing to next card boundary');
      state = applyMove(def, state, passMove!).state;
      if ((requireCardDrivenRuntime(state).pendingEligibilityOverrides ?? []).length === 0) {
        break;
      }
    }

    assert.equal(
      (requireCardDrivenRuntime(state).pendingEligibilityOverrides ?? []).length,
      0,
      'Claymores stay-eligible override should be consumed after exactly one card boundary',
    );
    assert.equal(requireCardDrivenRuntime(state).eligibility[activeSeatAtExecution!], true);
  });
});
