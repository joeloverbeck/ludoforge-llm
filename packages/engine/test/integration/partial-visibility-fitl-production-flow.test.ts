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

// Real FITL card tokens carry their card identity in `props.cardId`; `token.id`
// is a distinct token-instance id (`tok___eventCard_<ordinal>`). The fixture
// helper mirrors that shape so `matchesCardSelector` is exercised against the
// production token shape, not an `id === cardId` shortcut (Foundation #16).
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
      state.zones['played:none']?.map((token) => token.props.cardId),
      [ids.nonCoup[1]!, ids.nonCoup[0]!],
    );
    assert.deepEqual(state.zones['lookahead:none']?.map((token) => token.props.cardId), [ids.coup[0]!]);
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
      state.zones['played:none']?.map((token) => token.props.cardId),
      [ids.nonCoup[1]!, ids.nonCoup[0]!],
    );
    assert.deepEqual(state.zones['lookahead:none']?.map((token) => token.props.cardId), [ids.nonCoup[2]!]);
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

// Regression guard for the `matchesCardSelector` token-id/card-id mismatch:
// real FITL deck tokens carry their card identity in `props.cardId`, while
// `token.id` is a distinct token-instance id. The resolver must match against
// the card identity, not the token-instance id. This case is built from the
// genuine `initialState` deck — not a synthetic `cardToken` — so the production
// token shape is exercised end to end (Foundation #16).
function stateWithRealVisibleTokens(
  def: GameDef,
  base: GameState,
  options: { readonly played: Token; readonly lookahead: Token },
): GameState {
  const next: GameState = {
    ...base,
    zones: {
      ...base.zones,
      'played:none': [options.played],
      'lookahead:none': [options.lookahead],
      'leader:none': [],
    },
  };
  const hash = computeFullHash(createZobristTable(def), next);
  return { ...next, stateHash: hash, _runningHash: hash };
}

describe('FITL visible-sequence projection against the real deck token shape', () => {
  it('resolves ready: 1 for a real coup token in lookahead:none (identity is props.cardId, not token.id)', () => {
    const { gameDef } = getFitlProductionFixture();
    const base = initialState(gameDef, 171004, 4).state;
    const deck = base.zones['deck:none'] ?? [];
    const realCoup = deck.find((token) => token.props.isCoup === true);
    const realNonCoup = deck.find((token) => token.props.isCoup !== true);
    assert.ok(realCoup, 'expected a real coup token in the FITL deck');
    assert.ok(realNonCoup, 'expected a real non-coup token in the FITL deck');
    // The bug this guards against: token.id is NOT the card-definition id.
    assert.notEqual(String(realCoup.id), realCoup.props.cardId);
    assert.equal(typeof realCoup.props.cardId, 'string');

    const state = stateWithRealVisibleTokens(gameDef, base, { played: realNonCoup, lookahead: realCoup });

    assert.deepEqual(resolve(gameDef, state), {
      kind: 'ready',
      value: 1,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'played:none', availablePublic: 1, taken: 1 },
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
      ],
    });
  });

  it('keeps partial.lowerBound: 2 for real non-coup tokens in both visible slots', () => {
    const { gameDef } = getFitlProductionFixture();
    const base = initialState(gameDef, 171004, 4).state;
    const deck = base.zones['deck:none'] ?? [];
    const realNonCoup = deck.filter((token) => token.props.isCoup !== true);
    assert.ok(realNonCoup.length >= 2, 'expected at least two real non-coup tokens');

    const state = stateWithRealVisibleTokens(gameDef, base, {
      played: realNonCoup[0]!,
      lookahead: realNonCoup[1]!,
    });

    assert.deepEqual(resolve(gameDef, state), {
      kind: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 2,
      observerPolicy: { kind: 'topNVisible' },
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'played:none', availablePublic: 1, taken: 1 },
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
      ],
    });
  });
});
