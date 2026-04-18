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
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

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

const setupCardState = (
  def: GameDef,
  overrides?: {
    readonly aid?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');
  const base = clearAllZones(initialState(def, 16001, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      aid: overrides?.aid ?? 20,
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken('card-16', 'card', 'none')],
      ...(overrides?.zoneTokens ?? {}),
    },
    markers: {
      ...base.markers,
      ...(overrides?.markers ?? {}),
    },
  };
};

const findCard16Event = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.eventCardId === 'card-16' &&
      move.params.side === side,
  );

describe('FITL card-16 Blowtorch Komer event execution', () => {
  it('unshaded adds Aid +10 and enables momentum flag', () => {
    const def = compileDef();
    const state = setupCardState(def, { aid: 12 });
    const move = findCard16Event(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Blowtorch Komer unshaded event move');

    const result = applyMove(def, state, move!);
    assert.equal(result.state.globalVars.aid, 22);
    assert.equal(result.state.globalVars.mom_blowtorchKomer, true);
  });

  it('shaded applies Aid -10 and shifts one eligible Troops+Police space toward Active Opposition', () => {
    const def = compileDef();
    const target = 'quang-nam:none';
    const state = setupCardState(def, {
      aid: 15,
      zoneTokens: {
        [target]: [
          makeToken('bk-us-t', 'troops', 'US'),
          makeToken('bk-arvn-p', 'police', 'ARVN'),
        ],
      },
      markers: {
        [target]: { supportOpposition: 'neutral' },
      },
    });
    const move = findCard16Event(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected Blowtorch Komer shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$targetSpace', baseIdPattern: /chooseOne$/u }),
        value: target,
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(result.state.globalVars.aid, 5);
    assert.equal(result.state.markers[target]?.supportOpposition, 'passiveOpposition');
  });

  it('shaded still applies Aid -10 when no space has both Troops and Police', () => {
    const def = compileDef();
    const state = setupCardState(def, {
      aid: 9,
      zoneTokens: {
        'quang-nam:none': [makeToken('bk-us-t-only', 'troops', 'US')],
      },
      markers: {
        'quang-nam:none': { supportOpposition: 'neutral' },
      },
    });
    const move = findCard16Event(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected Blowtorch Komer shaded event move');

    const result = applyMove(def, state, move!);
    assert.equal(result.state.globalVars.aid, 0);
    assert.equal(result.state.markers['quang-nam:none']?.supportOpposition, 'neutral');
  });
});
