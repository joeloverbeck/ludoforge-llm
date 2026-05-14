// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import {
  asBoundaryId,
  asPlayerId,
  asTokenId,
  createGameDefRuntime,
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

// Real card tokens carry their identity in `props.cardId`; `token.id` is a
// distinct token-instance id. Mirror that shape so the resolver is exercised
// against the production token layout (Foundation #16).
const cardToken = (cardId: string): Token => ({
  id: asTokenId(`tok-${cardId}`),
  type: 'card',
  props: { cardId },
});

function cardIds(def: GameDef): { readonly coup: readonly string[]; readonly nonCoup: readonly string[] } {
  const eventDeck = def.eventDecks?.find((deck) => deck.id === 'fitl-events-initial-card-pack');
  assert.ok(eventDeck, 'expected FITL event deck');
  return {
    coup: eventDeck.cards.filter((card) => card.tags?.includes('coup') === true).map((card) => card.id),
    nonCoup: eventDeck.cards.filter((card) => card.tags?.includes('coup') !== true).map((card) => card.id),
  };
}

function withVisibleCards(
  state: GameState,
  options: { readonly played: string; readonly lookahead: string },
): GameState {
  return {
    ...state,
    zones: {
      ...state.zones,
      'played:none': [cardToken(options.played)],
      'lookahead:none': [cardToken(options.lookahead)],
    },
  };
}

function withoutCoupEntryObserverPolicy(def: GameDef): GameDef {
  assert.ok(def.phaseBoundaries, 'expected FITL phase boundaries');
  return {
    ...def,
    phaseBoundaries: def.phaseBoundaries.map((boundary) => {
      if (String(boundary.id) !== 'coupEntry' || boundary.schedule?.kind !== 'cardDraw') {
        return boundary;
      }
      const schedule = {
        kind: boundary.schedule.kind,
        deckId: boundary.schedule.deckId,
        cardSelector: boundary.schedule.cardSelector,
        ...(boundary.schedule.unitRates === undefined ? {} : { unitRates: boundary.schedule.unitRates }),
      };
      return { ...boundary, schedule };
    }),
  };
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

describe('FITL topNVisible coupEntry schedule distance', () => {
  it('pins ready and partial.lowerBound rows from the live visible prefix', () => {
    const { parsed, gameDef } = getFitlProductionFixture();
    assertNoErrors(parsed);
    const boundary = gameDef.phaseBoundaries?.find((entry) => String(entry.id) === 'coupEntry');
    assert.deepEqual(boundary?.schedule, {
      kind: 'cardDraw',
      deckId: 'fitl-events-initial-card-pack',
      cardSelector: { tags: ['coup'] },
      observerPolicy: {
        kind: 'topNVisible',
        visiblePrefix: {
          sources: [{ id: 'played:none', take: 1 }, { id: 'lookahead:none', take: 1 }],
        },
      },
    });

    const ids = cardIds(gameDef);
    assert.ok(ids.coup.length >= 1, 'expected coup cards in FITL event deck');
    assert.ok(ids.nonCoup.length >= 2, 'expected non-coup cards in FITL event deck');
    const baseState = initialState(gameDef, 1000, 4).state;

    assert.deepEqual(
      resolve(gameDef, withVisibleCards(baseState, { played: ids.coup[0]!, lookahead: ids.nonCoup[0]! })),
      {
        kind: 'ready',
        value: 0,
        observerPolicy: { kind: 'topNVisible' },
        visiblePrefixLength: 1,
        visibleSequenceSources: [{ zoneId: 'played:none', availablePublic: 1, taken: 1 }],
      },
    );
    assert.deepEqual(
      resolve(gameDef, withVisibleCards(baseState, { played: ids.nonCoup[0]!, lookahead: ids.coup[0]! })),
      {
        kind: 'ready',
        value: 1,
        observerPolicy: { kind: 'topNVisible' },
        visiblePrefixLength: 2,
        visibleSequenceSources: [
          { zoneId: 'played:none', availablePublic: 1, taken: 1 },
          { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        ],
      },
    );
    assert.deepEqual(
      resolve(gameDef, withVisibleCards(baseState, { played: ids.nonCoup[0]!, lookahead: ids.nonCoup[1]! })),
      {
        kind: 'partial',
        partialKind: 'lowerBound',
        lowerBound: 2,
        observerPolicy: { kind: 'topNVisible' },
        visiblePrefixLength: 2,
        visibleSequenceSources: [
          { zoneId: 'played:none', availablePublic: 1, taken: 1 },
          { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        ],
      },
    );
  });

  it('preserves hiddenDeck rows when coupEntry has no observerPolicy', () => {
    const { gameDef } = getFitlProductionFixture();
    const withoutObserverPolicy = withoutCoupEntryObserverPolicy(gameDef);
    const ids = cardIds(gameDef);
    const baseState = initialState(withoutObserverPolicy, 1000, 4).state;

    assert.deepEqual(
      [
        withVisibleCards(baseState, { played: ids.coup[0]!, lookahead: ids.nonCoup[0]! }),
        withVisibleCards(baseState, { played: ids.nonCoup[0]!, lookahead: ids.coup[0]! }),
        withVisibleCards(baseState, { played: ids.nonCoup[0]!, lookahead: ids.nonCoup[1]! }),
      ].map((state) => resolve(withoutObserverPolicy, state)),
      [
        { kind: 'unavailable', reason: 'hiddenDeck' },
        { kind: 'unavailable', reason: 'hiddenDeck' },
        { kind: 'unavailable', reason: 'hiddenDeck' },
      ],
    );
  });

  it('keeps FITL resolver readouts deterministic for the same seed and state', () => {
    const { gameDef } = getFitlProductionFixture();
    const ids = cardIds(gameDef);
    const firstState = withVisibleCards(initialState(gameDef, 1704, 4).state, {
      played: ids.nonCoup[0]!,
      lookahead: ids.nonCoup[1]!,
    });
    const secondState = withVisibleCards(initialState(gameDef, 1704, 4).state, {
      played: ids.nonCoup[0]!,
      lookahead: ids.nonCoup[1]!,
    });

    assert.deepEqual(resolve(gameDef, firstState), resolve(gameDef, secondState));
  });
});
