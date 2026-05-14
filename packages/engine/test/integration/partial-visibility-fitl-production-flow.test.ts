// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import {
  applyTurnFlowCardBoundary,
  applyTurnFlowInitialReveal,
} from '../../src/kernel/turn-flow-lifecycle.js';
import {
  asBoundaryId,
  asPlayerId,
  asTokenId,
  computeFullHash,
  createGameDefRuntime,
  createZobristTable,
  initialState,
  type CompiledAgentPolicyRef,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const REF: Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }> = {
  kind: 'scheduleDistance',
  target: { kind: 'boundary', boundaryId: asBoundaryId('coupEntry') },
  unit: 'cards',
};

const cardToken = (cardId: string): Token => ({
  id: asTokenId(cardId),
  type: 'card',
  props: {},
});

function cardIds(def: GameDef): { readonly coup: readonly string[]; readonly nonCoup: readonly string[] } {
  const eventDeck = def.eventDecks?.find((deck) => deck.id === 'fitl-events-initial-card-pack');
  assert.ok(eventDeck, 'expected FITL event deck');
  return {
    coup: eventDeck.cards.filter((card) => card.tags?.includes('coup') === true).map((card) => card.id),
    nonCoup: eventDeck.cards.filter((card) => card.tags?.includes('coup') !== true).map((card) => card.id),
  };
}

function stateWithSelectedDeck(def: GameDef, deckCardIds: readonly string[]): GameState {
  const base = initialState(def, 171003, 4).state;
  const next: GameState = {
    ...base,
    zones: {
      ...base.zones,
      'deck:none': deckCardIds.map(cardToken),
      'played:none': [],
      'lookahead:none': [],
      'leader:none': [],
    },
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

function driveOneProductionBoundary(def: GameDef, deckCardIds: readonly string[]): GameState {
  const revealed = applyTurnFlowInitialReveal(def, stateWithSelectedDeck(def, deckCardIds)).state;
  const advanced = applyTurnFlowCardBoundary(def, revealed).state;
  assert.equal(advanced.zones['played:none']?.length, 2);
  return advanced;
}

function resolve(def: GameDef, state: GameState) {
  const providers = createPolicyRuntimeProviders({
    def,
    state,
    playerId: asPlayerId(1),
    seatId: 'arvn',
    trustedMoveIndex: new Map(),
    catalog: def.agents!,
    runtime: createGameDefRuntime(def),
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
  return providers.phaseSchedule.resolveScheduleDistance(REF);
}

describe('FITL visible-sequence projection through the production card lifecycle', () => {
  it('resolves ready: 1 when a Coup reaches lookahead after played accumulates', () => {
    const { parsed, gameDef } = getFitlProductionFixture();
    assertNoErrors(parsed);
    const ids = cardIds(gameDef);
    assert.ok(ids.coup.length >= 1, 'expected coup cards in FITL event deck');
    assert.ok(ids.nonCoup.length >= 2, 'expected non-coup cards in FITL event deck');

    const state = driveOneProductionBoundary(gameDef, [ids.nonCoup[0]!, ids.nonCoup[1]!, ids.coup[0]!]);

    assert.deepEqual(
      state.zones['played:none']?.map((token) => String(token.id)),
      [ids.nonCoup[1]!, ids.nonCoup[0]!],
    );
    assert.deepEqual(state.zones['lookahead:none']?.map((token) => String(token.id)), [ids.coup[0]!]);
    assert.deepEqual(resolve(gameDef, state), {
      kind: 'ready',
      value: 1,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'played:none', availablePublic: 2, taken: 1 },
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
      ],
    });
  });

  it('keeps partial.lowerBound: 2 when neither visible lifecycle source holds a Coup', () => {
    const { gameDef } = getFitlProductionFixture();
    const ids = cardIds(gameDef);
    assert.ok(ids.nonCoup.length >= 3, 'expected at least three non-coup cards in FITL event deck');

    const state = driveOneProductionBoundary(gameDef, [ids.nonCoup[0]!, ids.nonCoup[1]!, ids.nonCoup[2]!]);

    assert.deepEqual(
      state.zones['played:none']?.map((token) => String(token.id)),
      [ids.nonCoup[1]!, ids.nonCoup[0]!],
    );
    assert.deepEqual(state.zones['lookahead:none']?.map((token) => String(token.id)), [ids.nonCoup[2]!]);
    assert.deepEqual(resolve(gameDef, state), {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 2,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'played:none', availablePublic: 2, taken: 1 },
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
      ],
    });
  });
});
