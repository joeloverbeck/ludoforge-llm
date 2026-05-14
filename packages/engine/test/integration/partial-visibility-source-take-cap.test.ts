// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
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

function stateWithPublicSources(
  def: GameDef,
  options: {
    readonly played: readonly string[];
    readonly lookahead: readonly string[];
    readonly hiddenDeck?: readonly string[];
  },
): GameState {
  const base = initialState(def, 171003, 4).state;
  const next: GameState = {
    ...base,
    zones: {
      ...base.zones,
      'deck:none': (options.hiddenDeck ?? []).map(cardToken),
      'played:none': options.played.map(cardToken),
      'lookahead:none': options.lookahead.map(cardToken),
    },
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
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

describe('visible-sequence source take cap', () => {
  it('limits each public source contribution before scanning the next source', () => {
    const { gameDef } = getFitlProductionFixture();
    const ids = cardIds(gameDef);
    assert.ok(ids.coup.length >= 1, 'expected coup cards in FITL event deck');
    assert.ok(ids.nonCoup.length >= 3, 'expected at least three non-coup cards in FITL event deck');

    assert.deepEqual(
      resolve(gameDef, stateWithPublicSources(gameDef, {
        played: [ids.nonCoup[0]!, ids.nonCoup[1]!, ids.nonCoup[2]!],
        lookahead: [ids.coup[0]!],
      })),
      {
        kind: 'ready',
        value: 1,
        observerPolicy: { kind: 'topNVisible' },
        visiblePrefixLength: 2,
        visibleSequenceSources: [
          { zoneId: 'played:none', availablePublic: 3, taken: 1 },
          { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        ],
      },
    );
  });

  it('does not return an exact distance for a Coup beyond the composed visible sequence', () => {
    const { gameDef } = getFitlProductionFixture();
    const ids = cardIds(gameDef);
    assert.ok(ids.coup.length >= 1, 'expected coup cards in FITL event deck');
    assert.ok(ids.nonCoup.length >= 4, 'expected at least four non-coup cards in FITL event deck');

    assert.deepEqual(
      resolve(gameDef, stateWithPublicSources(gameDef, {
        played: [ids.nonCoup[0]!, ids.nonCoup[1]!, ids.nonCoup[2]!],
        lookahead: [ids.nonCoup[3]!],
        hiddenDeck: [ids.coup[0]!],
      })),
      {
        kind: 'partial',
        partialKind: 'lowerBound',
        lowerBound: 2,
        observerPolicy: { kind: 'topNVisible' },
        visiblePrefixLength: 2,
        visibleSequenceSources: [
          { zoneId: 'played:none', availablePublic: 3, taken: 1 },
          { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        ],
      },
    );
  });
});
