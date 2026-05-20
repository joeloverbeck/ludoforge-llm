// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import {
  DEFAULT_SELECTOR_EMPTY_DEMOTE_PENALTY,
  evaluateSelector,
} from '../../../src/agents/policy-selector-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentPolicyRef,
  type CompiledPolicyExpr,
  type CompiledPolicySelector,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

function selector(overrides: Partial<CompiledPolicySelector> = {}): CompiledPolicySelector {
  return {
    id: 'zoneRank' as CompiledPolicySelector['id'],
    scopes: ['move'],
    source: { kind: 'collection', collection: { kind: 'zones' } },
    quality: {
      components: [{ id: 'constant' as any, value: { kind: 'literal', value: 2 }, weight: 3 }],
      order: 'qualityDesc',
    },
    result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    costClass: 'state',
    dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
    ...overrides,
  };
}

function state(): GameState {
  return {
    zones: { beta: [], alpha: [], gamma: [] },
    playerCount: 2,
  } as unknown as GameState;
}

function createSelectorCatalog(compiledSelector: CompiledPolicySelector): AgentPolicyCatalog {
  const base = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'selector-runtime-test',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {},
    bindingsBySeat: {},
  });
  return {
    ...base,
    compiled: {
      ...base.compiled,
      selectors: { [compiledSelector.id]: compiledSelector },
    },
  };
}

function createSelectorDef(catalog: AgentPolicyCatalog): GameDef {
  const phaseId = asPhaseId('main');
  return {
    metadata: { id: 'selector-runtime-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('alpha:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
      { id: asZoneId('beta:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
      { id: asZoneId('gamma:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'alpha', value: 0 }, { seat: 'beta', value: 0 }],
      ranking: { order: 'desc', tieBreakOrder: ['alpha', 'beta'] },
    },
  };
}

function selectorRefExpr(field: Extract<CompiledAgentPolicyRef, { readonly kind: 'selector' }>['field']): CompiledPolicyExpr {
  return {
    kind: 'ref',
    ref: { kind: 'selector', selectorId: 'zoneRank', field },
  } as CompiledPolicyExpr;
}

describe('policy selector evaluator', () => {
  it('ranks finite collection items deterministically and exposes component scores', () => {
    const view = evaluateSelector(selector(), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as number : undefined,
    });

    assert.equal(view.impactSatisfied, true);
    assert.deepEqual(view.selected.map((item) => [item.key, item.quality, item.rank]), [
      ['alpha', 6, 1],
      ['beta', 6, 2],
    ]);
    assert.equal(view.selected[0]?.components.get('constant'), 2);
  });

  it('truncates product selectors at maxPairs in stable source order', () => {
    let truncated = 0;
    const view = evaluateSelector(selector({
      source: {
        kind: 'product',
        left: { kind: 'zones' },
        right: { kind: 'zones' },
        maxPairs: 4,
      },
      result: { maxItems: 4, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
    }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: () => 0,
      onProductTruncated: () => { truncated += 1; },
    });

    assert.equal(truncated, 1);
    assert.deepEqual(view.selected.map((item) => item.key), [
      'alpha|alpha',
      'alpha|beta',
      'alpha|gamma',
      'beta|alpha',
    ]);
  });

  it('records empty reasons for where and minImpact exclusions', () => {
    const whereExcluded = evaluateSelector(selector({ where: { kind: 'literal', value: false } }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as boolean | number : undefined,
    });
    assert.equal(whereExcluded.emptyReason, 'whereExcludedAll');

    const minImpactFailed = evaluateSelector(selector({ minImpact: { kind: 'literal', value: false } }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as boolean | number : undefined,
    });
    assert.equal(minImpactFailed.emptyReason, 'minImpactFailed');
  });

  it('applies all onEmpty modes without changing deterministic empty reasons', () => {
    const noContribution = evaluateSelector(selector({ where: { kind: 'literal', value: false } }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as boolean | number : undefined,
    });
    assert.equal(noContribution.emptyMode, 'noContribution');
    assert.equal(noContribution.emptyPenalty, undefined);

    const advisories: string[] = [];
    const traceAndNoContribution = evaluateSelector(selector({
      where: { kind: 'literal', value: false },
      result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'traceAndNoContribution' },
    }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as boolean | number : undefined,
      onSelectorEmpty: (selectorId, reason) => advisories.push(`${selectorId}:${reason}`),
    });
    assert.equal(traceAndNoContribution.emptyMode, 'traceAndNoContribution');
    assert.deepEqual(advisories, ['zoneRank:whereExcludedAll']);

    const demote = evaluateSelector(selector({
      where: { kind: 'literal', value: false },
      result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'demote' },
    }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as boolean | number : undefined,
    });
    assert.equal(demote.emptyMode, 'demote');
    assert.equal(demote.emptyPenalty, DEFAULT_SELECTOR_EMPTY_DEMOTE_PENALTY);
  });

  it('materializes players, tokens, candidate params, and microturn option sources deterministically', () => {
    const tokenState = {
      ...state(),
      zones: {
        beta: [{ id: 'z2', type: 'marker' }, { id: 'z1', type: 'coin' }],
        alpha: [{ id: 'a2', type: 'coin' }],
      },
    } as unknown as GameState;

    const players = evaluateSelector(selector({
      source: { kind: 'collection', collection: { kind: 'players' } },
      result: { maxItems: 3, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
    }), {
      def: {} as GameDef,
      state: tokenState,
      candidates: [],
      evaluateExpr: () => 0,
    });
    assert.deepEqual(players.selected.map((item) => item.key), ['1', '2']);

    const tokens = evaluateSelector(selector({
      source: { kind: 'collection', collection: { kind: 'tokens', tokenType: 'coin' } },
      result: { maxItems: 3, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
    }), {
      def: {} as GameDef,
      state: tokenState,
      candidates: [],
      evaluateExpr: () => 0,
    });
    assert.deepEqual(tokens.selected.map((item) => item.key), ['a2', 'z1']);

    const candidate = {
      actionId: 'choose',
      stableMoveKey: 'choose:alpha,beta',
      move: { action: 'choose', player: 1, params: { target: ['beta', 'alpha'] } } as unknown as Move,
    };
    const params = evaluateSelector(selector({
      source: { kind: 'candidateParams', param: 'target' as any },
      result: { maxItems: 3, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
    }), {
      def: {} as GameDef,
      state: tokenState,
      candidates: [candidate],
      candidate,
      evaluateExpr: () => 0,
    });
    assert.deepEqual(params.selected.map((item) => item.key), ['alpha', 'beta']);

    const microturn = evaluateSelector(selector({
      source: { kind: 'microturnOptions' },
      result: { maxItems: 3, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
    }), {
      def: {} as GameDef,
      state: tokenState,
      candidates: [],
      microturnOptions: [{ key: 'second', value: 2, index: 1 }, { key: 'first', value: 1, index: 0 }],
      evaluateExpr: () => 0,
    });
    assert.deepEqual(microturn.selected.map((item) => item.key), ['first', 'second']);
  });

  it('applies preview noContribution fallback without silently coercing missing values otherwise', () => {
    const withoutFallback = evaluateSelector(selector({
      quality: {
        components: [{ id: 'preview' as any, value: { kind: 'ref', ref: { kind: 'previewOptionRef', refKind: 'driveDepth' } }, weight: 5 }],
        order: 'qualityDesc',
      },
    }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: () => undefined,
    });
    assert.equal(withoutFallback.selected[0]?.components.has('preview'), false);
    assert.equal(withoutFallback.selected[0]?.quality, 0);

    const withFallback = evaluateSelector(selector({
      quality: {
        components: [{
          id: 'preview' as any,
          value: { kind: 'ref', ref: { kind: 'previewOptionRef', refKind: 'driveDepth' } },
          weight: 5,
          previewFallback: { onUnavailable: 'noContribution' },
        }],
        order: 'qualityDesc',
      },
    }), {
      def: {} as GameDef,
      state: state(),
      candidates: [],
      evaluateExpr: () => undefined,
    });
    assert.equal(withFallback.selected[0]?.components.get('preview'), 0);
    assert.equal(withFallback.selected[0]?.quality, 0);
  });

  it('resolves selector refs through the policy evaluation context', () => {
    const compiledSelector = selector();
    const catalog = createSelectorCatalog(compiledSelector);
    const def = createSelectorDef(catalog);
    const { state: initial } = initialState(def, 42, 2);
    const context = new PolicyEvaluationContext({
      def,
      state: {
        ...initial,
        zones: { 'beta:none': [], 'alpha:none': [], 'gamma:none': [] },
      },
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
    }, []);
    try {
      assert.equal(context.getEvaluatedSelectorCacheSize(), 0);
      assert.equal(context.evaluateCompiledExpr(selectorRefExpr('selected.matches'), undefined), true);
      assert.equal(context.getEvaluatedSelectorCacheSize(), 1);
      assert.equal(context.evaluateCompiledExpr(selectorRefExpr('selected.key'), undefined), 'alpha:none');
      assert.equal(context.evaluateCompiledExpr(selectorRefExpr('selected.quality'), undefined), 6);
      assert.equal(context.getEvaluatedSelectorCacheSize(), 1);
      assert.equal(context.evaluateCompiledExpr(selectorRefExpr('size'), undefined), 2);
      assert.equal(context.evaluateCompiledExpr(
        selectorRefExpr({ kind: 'selected.component', componentId: 'constant' as any }),
        undefined,
      ), 2);
      assert.equal(context.evaluateCompiledExpr(
        selectorRefExpr({ kind: 'candidate.quality', key: 'beta:none' }),
        undefined,
      ), 6);
    } finally {
      context.dispose();
    }
  });

  it('returns the default demote penalty for empty selector quality refs', () => {
    const compiledSelector = selector({
      where: { kind: 'literal', value: false },
      result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'demote' },
    });
    const catalog = createSelectorCatalog(compiledSelector);
    const def = createSelectorDef(catalog);
    const { state: initial } = initialState(def, 42, 2);
    const context = new PolicyEvaluationContext({
      def,
      state: initial,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
    }, []);
    try {
      assert.equal(
        context.evaluateCompiledExpr(selectorRefExpr('selected.quality'), undefined),
        DEFAULT_SELECTOR_EMPTY_DEMOTE_PENALTY,
      );
      assert.equal(context.evaluateCompiledExpr(selectorRefExpr('selected.matches'), undefined), false);
    } finally {
      context.dispose();
    }
  });
});
