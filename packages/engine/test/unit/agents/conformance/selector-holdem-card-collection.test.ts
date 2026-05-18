// @test-class: architectural-invariant
// Conformance: selector primitive evaluates card collections through observer-visible state.
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSelector, type SelectedSelectorView } from '../../../../src/agents/policy-selector-eval.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';
import { advanceToDecisionPoint } from '../../../../src/kernel/phase-advance.js';
import {
  initialState,
  type AgentPolicyExpr,
  type CompiledObserverProfile,
  type CompiledPolicySelector,
  type ComponentId,
  type GameDef,
  type GameState,
  type SelectorId,
} from '../../../../src/kernel/index.js';
import { getTexasProductionFixture } from '../../../helpers/production-spec-helpers.js';

const TEXAS_PLAYER_COUNT = 2;
const MAX_ITEMS = 7;

const emptyDependencies: CompiledPolicySelector['dependencies'] = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

interface TexasSelectorContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly observerProfile: CompiledObserverProfile;
}

const literal = <T extends number | boolean>(value: T): AgentPolicyExpr => ({
  kind: 'literal',
  value,
} as AgentPolicyExpr);

const holdemCardSelector = (): CompiledPolicySelector => ({
  id: 'holdemCardRank' as SelectorId,
  scopes: ['move'],
  source: { kind: 'collection', collection: { kind: 'cards' } },
  quality: {
    components: [
      { id: 'visibleCardContribution' as ComponentId, value: literal(1), weight: 5 },
    ],
    order: 'qualityDesc',
  },
  result: { maxItems: MAX_ITEMS, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
});

const createTexasSelectorContext = (): TexasSelectorContext => {
  const def = getTexasProductionFixture().gameDef;
  const state = advanceToDecisionPoint(def, initialState(def, 181010, TEXAS_PLAYER_COUNT).state);
  const observerProfile = def.observers?.observers.currentPlayer;
  assert.ok(observerProfile, 'expected Texas production GameDef to define currentPlayer observer');
  return { def, state, observerProfile };
};

const evaluateLiteralOnlySelector = (
  selector: CompiledPolicySelector,
  context: TexasSelectorContext,
  state: GameState = context.state,
): SelectedSelectorView => evaluateSelector(selector, {
  def: context.def,
  state,
  candidates: [],
  observerPlayerId: state.activePlayer,
  observerProfile: context.observerProfile,
  evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as number | boolean : undefined,
});

const visibleCardIdsForActivePlayer = (context: TexasSelectorContext, state = context.state): Set<string> => {
  const observation = derivePlayerObservation(context.def, state, state.activePlayer, context.observerProfile);
  return new Set(Object.values(observation.visibleTokenIdsByZone).flat());
};

const withHiddenCardsChanged = (state: GameState): GameState => {
  const opponentPlayer = Number(state.activePlayer) === 0 ? 1 : 0;
  const opponentZoneId = `hand:${opponentPlayer}`;
  const opponentCards = state.zones[opponentZoneId] ?? [];
  const deckCards = state.zones['deck:none'] ?? [];
  assert.ok(opponentCards.length >= 2, 'expected opponent to hold hidden cards');
  assert.ok(deckCards.length >= 2, 'expected hidden deck to contain replacement cards');
  return {
    ...state,
    zones: {
      ...state.zones,
      [opponentZoneId]: deckCards.slice(0, opponentCards.length),
      'deck:none': [...opponentCards, ...deckCards.slice(opponentCards.length)],
    },
  };
};

const assertQualityDescWithStableKeyTies = (view: SelectedSelectorView): void => {
  for (let index = 1; index < view.selected.length; index += 1) {
    const previous = view.selected[index - 1]!;
    const current = view.selected[index]!;
    assert.ok(previous.quality >= current.quality, 'expected selected cards to be quality-desc sorted');
    if (previous.quality === current.quality) {
      assert.ok(
        previous.key.localeCompare(current.key) <= 0,
        'expected stableKeyAsc to break equal-quality ties',
      );
    }
  }
};

const normalizeSelectorView = (view: SelectedSelectorView): unknown => ({
  selectorId: view.selectorId,
  impactSatisfied: view.impactSatisfied,
  emptyReason: view.emptyReason,
  selected: view.selected.map((item) => ({
    key: item.key,
    quality: item.quality,
    rank: item.rank,
    components: Object.fromEntries([...item.components.entries()].sort(([left], [right]) => left.localeCompare(right))),
  })),
});

describe('selector conformance - Texas Holdem card collection', () => {
  it('ranks only observer-visible cards from the production Texas state', () => {
    const context = createTexasSelectorContext();
    const visibleCardIds = visibleCardIdsForActivePlayer(context);
    const view = evaluateLiteralOnlySelector(holdemCardSelector(), context);

    assert.ok(visibleCardIds.size > 0, 'expected active Texas player to observe at least one card');
    assert.equal(view.impactSatisfied, true);
    assert.ok(view.selected.length > 0, 'expected selector to select visible cards');
    assert.ok(view.selected.length <= MAX_ITEMS, 'expected selector results to honor maxItems');
    assertQualityDescWithStableKeyTies(view);
    for (const item of view.selected) {
      assert.ok(visibleCardIds.has(item.key), 'expected selected cards to be visible to the active player');
      assert.ok(Number.isFinite(item.quality), 'expected finite quality');
      assert.ok(Number.isInteger(item.quality), 'expected integer quality');
      assert.ok(Number.isInteger(item.components.get('visibleCardContribution')), 'expected finite integer component');
    }
  });

  it('does not leak hidden Holdem cards through selector output', () => {
    const context = createTexasSelectorContext();
    const selector = holdemCardSelector();
    const hiddenChanged = withHiddenCardsChanged(context.state);

    const first = evaluateLiteralOnlySelector(selector, context);
    const second = evaluateLiteralOnlySelector(selector, context);
    const hiddenChangedView = evaluateLiteralOnlySelector(selector, context, hiddenChanged);

    assert.deepEqual(normalizeSelectorView(first), normalizeSelectorView(second));
    assert.deepEqual(normalizeSelectorView(first), normalizeSelectorView(hiddenChangedView));
  });
});
