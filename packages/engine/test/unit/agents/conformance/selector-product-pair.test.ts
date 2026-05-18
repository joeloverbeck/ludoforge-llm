// @test-class: architectural-invariant
// Conformance: selector primitive evaluates bounded origin/destination products deterministically.
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSelector, type SelectedSelectorView } from '../../../../src/agents/policy-selector-eval.js';
import {
  asPhaseId,
  asPlayerId,
  asZoneId,
  type AgentPolicyExpr,
  type CompiledPolicySelector,
  type ComponentId,
  type GameDef,
  type GameState,
  type SelectorId,
} from '../../../../src/kernel/index.js';

const RESULT_MAX_ITEMS = 8;

const emptyDependencies: CompiledPolicySelector['dependencies'] = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

const literal = <T extends number | boolean>(value: T): AgentPolicyExpr => ({
  kind: 'literal',
  value,
} as AgentPolicyExpr);

const productSelector = (maxPairs: number): CompiledPolicySelector => ({
  id: 'originDestinationPairQuality' as SelectorId,
  scopes: ['move'],
  source: {
    kind: 'product',
    left: { kind: 'zones' },
    right: { kind: 'zones' },
    maxPairs,
  },
  quality: {
    components: [
      { id: 'pairContribution' as ComponentId, value: literal(1), weight: 4 },
    ],
    order: 'qualityDesc',
  },
  result: { maxItems: RESULT_MAX_ITEMS, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
});

const createPerfectInfoFixtureDef = (): GameDef => ({
  metadata: { id: 'selector-product-perfect-info-fixture', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('alpha:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    { id: asZoneId('beta:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    { id: asZoneId('gamma:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    { id: asZoneId('delta:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
  ],
  derivedMetrics: [],
  seats: [{ id: 'left' }, { id: 'right' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: {
    conditions: [],
    margins: [{ seat: 'left', value: 0 }, { seat: 'right', value: 0 }],
    ranking: { order: 'desc', tieBreakOrder: ['left', 'right'] },
  },
});

const createPerfectInfoFixtureState = (): GameState => ({
  zones: { 'gamma:none': [], 'alpha:none': [], 'delta:none': [], 'beta:none': [] },
  playerCount: 2,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
} as unknown as GameState);

const evaluateLiteralOnlySelector = (
  selector: CompiledPolicySelector,
  onProductTruncated?: (selectorId: string) => void,
): SelectedSelectorView => evaluateSelector(selector, {
  def: createPerfectInfoFixtureDef(),
  state: createPerfectInfoFixtureState(),
  candidates: [],
  evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as number | boolean : undefined,
  ...(onProductTruncated === undefined ? {} : { onProductTruncated }),
});

const assertQualityDescWithStableKeyTies = (view: SelectedSelectorView): void => {
  for (let index = 1; index < view.selected.length; index += 1) {
    const previous = view.selected[index - 1]!;
    const current = view.selected[index]!;
    assert.ok(previous.quality >= current.quality, 'expected selected pairs to be quality-desc sorted');
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

describe('selector conformance - declared product pair', () => {
  it('produces deterministic top-K pair keys from a bounded perfect-information product', () => {
    const first = evaluateLiteralOnlySelector(productSelector(16));
    const second = evaluateLiteralOnlySelector(productSelector(16));

    assert.equal(first.impactSatisfied, true);
    assert.equal(first.selected.length, RESULT_MAX_ITEMS);
    assert.deepEqual(normalizeSelectorView(first), normalizeSelectorView(second));
    assertQualityDescWithStableKeyTies(first);
    for (const item of first.selected) {
      assert.match(item.key, /^[a-z]+:none\|[a-z]+:none$/);
      assert.ok(Number.isFinite(item.quality), 'expected finite quality');
      assert.ok(Number.isInteger(item.components.get('pairContribution')), 'expected finite integer component');
    }
  });

  it('truncates product materialization at maxPairs deterministically and emits one advisory', () => {
    const firstAdvisories: string[] = [];
    const secondAdvisories: string[] = [];
    const first = evaluateLiteralOnlySelector(
      productSelector(8),
      (selectorId) => firstAdvisories.push(selectorId),
    );
    const second = evaluateLiteralOnlySelector(
      productSelector(8),
      (selectorId) => secondAdvisories.push(selectorId),
    );

    assert.deepEqual(normalizeSelectorView(first), normalizeSelectorView(second));
    assert.equal(first.selected.length, 8);
    assert.deepEqual(firstAdvisories, ['originDestinationPairQuality']);
    assert.deepEqual(secondAdvisories, ['originDestinationPairQuality']);
  });

  it('does not emit a truncation advisory when maxPairs covers the full product', () => {
    const advisories: string[] = [];
    const view = evaluateLiteralOnlySelector(
      productSelector(16),
      (selectorId) => advisories.push(selectorId),
    );

    assert.equal(view.selected.length, RESULT_MAX_ITEMS);
    assert.deepEqual(advisories, []);
  });
});
