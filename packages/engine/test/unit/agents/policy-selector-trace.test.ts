// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
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
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

function selector(
  id: string,
  overrides: Partial<CompiledPolicySelector> = {},
): CompiledPolicySelector {
  return {
    id: id as CompiledPolicySelector['id'],
    scopes: ['move'],
    source: { kind: 'collection', collection: { kind: 'zones' } },
    quality: {
      components: [{ id: 'constant' as any, value: { kind: 'literal', value: 2 }, weight: 3 }],
      order: 'qualityDesc',
    },
    result: { maxItems: 6, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    costClass: 'state',
    dependencies: emptyDeps,
    ...overrides,
  };
}

function createCatalog(selectors: readonly CompiledPolicySelector[]): AgentPolicyCatalog {
  const base = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'selector-trace-test',
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
      selectors: Object.fromEntries(selectors.map((entry) => [entry.id, entry])),
    },
  };
}

function createDef(catalog: AgentPolicyCatalog): GameDef {
  const phaseId = asPhaseId('main');
  return {
    metadata: { id: 'selector-trace-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: ['a', 'b', 'c', 'd', 'e', 'f'].map((zone) => ({
      id: asZoneId(`${zone}:none`),
      owner: 'none' as const,
      visibility: 'public' as const,
      ordering: 'set' as const,
      attributes: {},
    })),
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

function createContext(selectors: readonly CompiledPolicySelector[]): PolicyEvaluationContext {
  const catalog = createCatalog(selectors);
  const def = createDef(catalog);
  const { state } = initialState(def, 42, 2);
  return new PolicyEvaluationContext({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'alpha',
    catalog,
    parameterValues: {},
    trustedMoveIndex: new Map(),
    cacheBinding: { kind: 'isolated' },
  }, []);
}

function selectorRefExpr(
  selectorId: string,
  field: Extract<CompiledAgentPolicyRef, { readonly kind: 'selector' }>['field'],
): CompiledPolicyExpr {
  return {
    kind: 'ref',
    ref: { kind: 'selector', selectorId, field },
  } as CompiledPolicyExpr;
}

describe('policy selector trace', () => {
  it('emits summary selector entries for evaluated selectors only in stable id order', () => {
    const context = createContext([selector('bSelector'), selector('aSelector'), selector('unused')]);
    try {
      context.evaluateCompiledExpr(selectorRefExpr('bSelector', 'selected.quality'), undefined);
      context.evaluateCompiledExpr(selectorRefExpr('aSelector', 'selected.quality'), undefined);

      const traces = context.getEvaluatedSelectorTraces('summary');
      assert.deepEqual(traces.map((entry) => entry.selectorId), ['aSelector', 'bSelector']);
      assert.equal(traces[0]?.selectedKey, 'a:none');
      assert.equal(traces[0]?.selectedQuality, 6);
      assert.equal(traces[0]?.selectedRank, 1);
      assert.equal(traces[0]?.impactSatisfied, true);
      assert.deepEqual(traces[0]?.components, { constant: 2 });
      assert.equal(traces[0]?.topK, undefined);
      assert.equal(traces[0]?.truncated, true);
    } finally {
      context.dispose();
    }
  });

  it('emits verbose topK entries with a hard cap of five and stable bytes across runs', () => {
    const run = (): string => {
      const context = createContext([selector('rankedZones')]);
      try {
        context.evaluateCompiledExpr(selectorRefExpr('rankedZones', 'selected.quality'), undefined);
        return JSON.stringify(context.getEvaluatedSelectorTraces('verbose'));
      } finally {
        context.dispose();
      }
    };

    const first = run();
    const second = run();
    assert.equal(first, second);
    const traces = JSON.parse(first) as Array<{ readonly topK?: readonly unknown[]; readonly truncated?: boolean }>;
    assert.equal(traces[0]?.topK?.length, 5);
    assert.equal(traces[0]?.truncated, true);
  });

  it('emits empty selector entries with emptyReason and no selected key', () => {
    const context = createContext([
      selector('emptySelector', {
        where: { kind: 'literal', value: false },
        result: { maxItems: 6, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'traceAndNoContribution' },
      }),
    ]);
    try {
      context.evaluateCompiledExpr(selectorRefExpr('emptySelector', 'selected.matches'), undefined);
      const traces = context.getEvaluatedSelectorTraces('summary');
      assert.equal(traces.length, 1);
      assert.equal(traces[0]?.selectorId, 'emptySelector');
      assert.equal(traces[0]?.selectedKey, undefined);
      assert.equal(traces[0]?.impactSatisfied, false);
      assert.equal(traces[0]?.emptyReason, 'whereExcludedAll');
    } finally {
      context.dispose();
    }
  });
});
