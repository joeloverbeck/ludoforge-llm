// @test-class: architectural-invariant
// Conformance: selector primitive evaluates correctly over a real area-control game's zone collection.
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSelector, type SelectedSelectorView } from '../../../../src/agents/policy-selector-eval.js';
import {
  initialState,
  type AgentPolicyExpr,
  type CompiledPolicySelector,
  type ComponentId,
  type GameDef,
  type GameState,
  type SelectorId,
} from '../../../../src/kernel/index.js';
import { compileFitlValidatedGameDef } from '../../../helpers/compiled-condition-production-helpers.js';

const FITL_PLAYER_COUNT = 4;
const MAX_ITEMS = 8;

const emptyDependencies: CompiledPolicySelector['dependencies'] = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

interface FitlSelectorContext {
  readonly def: GameDef;
  readonly state: GameState;
}

const literal = <T extends number | boolean>(value: T): AgentPolicyExpr => ({
  kind: 'literal',
  value,
} as AgentPolicyExpr);

const fitlZoneSelector = (minImpact?: AgentPolicyExpr): CompiledPolicySelector => ({
  id: 'fitlZoneQuality' as SelectorId,
  scopes: ['move'],
  source: { kind: 'collection', collection: { kind: 'zones' } },
  quality: {
    components: [
      { id: 'presence' as ComponentId, value: literal(2), weight: 6 },
      { id: 'leaderDenial' as ComponentId, value: literal(1), weight: 3 },
    ],
    order: 'qualityDesc',
  },
  ...(minImpact === undefined ? {} : { minImpact }),
  result: { maxItems: MAX_ITEMS, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
});

const createFitlSelectorContext = (): FitlSelectorContext => {
  const def = compileFitlValidatedGameDef();
  return {
    def,
    state: initialState(def, 181009, FITL_PLAYER_COUNT).state,
  };
};

const evaluateLiteralOnlySelector = (
  selector: CompiledPolicySelector,
  context: FitlSelectorContext,
): SelectedSelectorView => evaluateSelector(selector, {
  def: context.def,
  state: context.state,
  candidates: [],
  evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as number | boolean : undefined,
});

const assertQualityDescWithStableKeyTies = (view: SelectedSelectorView): void => {
  for (let index = 1; index < view.selected.length; index += 1) {
    const previous = view.selected[index - 1]!;
    const current = view.selected[index]!;
    assert.ok(previous.quality >= current.quality, 'expected selected zones to be quality-desc sorted');
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

describe('selector conformance - FITL zone collection', () => {
  it('ranks the production FITL zone collection with property-form guarantees', () => {
    const context = createFitlSelectorContext();
    const zoneCount = Object.keys(context.state.zones).length;
    const view = evaluateLiteralOnlySelector(fitlZoneSelector(literal(true)), context);

    assert.ok(zoneCount > MAX_ITEMS, 'expected the production FITL initial state to expose a bounded zone collection');
    assert.equal(view.impactSatisfied, true);
    assert.equal(view.emptyReason, undefined);
    assert.ok(view.selected.length > 0, 'expected the selector to select at least one FITL zone');
    assert.ok(view.selected.length <= MAX_ITEMS, 'expected selector results to honor maxItems');
    assertQualityDescWithStableKeyTies(view);
    for (const item of view.selected) {
      assert.ok(Number.isFinite(item.quality), 'expected finite quality');
      assert.ok(Number.isInteger(item.quality), 'expected integer quality');
      assert.ok(Number.isInteger(item.components.get('presence')), 'expected finite integer presence component');
      assert.ok(Number.isInteger(item.components.get('leaderDenial')), 'expected finite integer leaderDenial component');
    }
  });

  it('reflects minImpact and produces bit-identical views for repeated FITL evaluations', () => {
    const context = createFitlSelectorContext();
    const selector = fitlZoneSelector(literal(true));
    const first = evaluateLiteralOnlySelector(selector, context);
    const second = evaluateLiteralOnlySelector(selector, context);
    const failedImpact = evaluateLiteralOnlySelector(fitlZoneSelector(literal(false)), context);

    assert.deepEqual(normalizeSelectorView(first), normalizeSelectorView(second));
    assert.equal(failedImpact.impactSatisfied, false);
    assert.equal(failedImpact.emptyReason, 'minImpactFailed');
    assert.deepEqual(failedImpact.selected, []);
  });
});
