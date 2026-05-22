// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../src/agents/policy-evaluation-core.js';
import { __compile_internal_for_tests } from '../../src/cnl/policy-bytecode/index.js';
import { __featureTable_internal_for_tests } from '../../src/cnl/policy-bytecode/feature-table.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createGameDefRuntime,
  initialState,
  type AgentPolicyCatalog,
  type CompiledPolicyExpr,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../src/kernel/index.js';
import { __layout_internal_for_tests } from '../../src/kernel/encoded-state/layout.js';
import { __view_internal_for_tests } from '../../src/kernel/encoded-state/view.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const scoreRefExpr: CompiledPolicyExpr = {
  kind: 'ref',
  ref: { kind: 'currentSurface', family: 'globalVar', id: 'score' },
};

interface BuildCounts {
  readonly encodedStateLayouts: number;
  readonly encodedStates: number;
  readonly featureTables: number;
  readonly expressionFeatureTables: number;
}

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'policy-eval-cache-binding-dedup',
    surfaceVisibility: {
      globalVars: {
        score: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: { guardrails: [], considerations: [], tieBreakers: [] },
        plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-eval-cache-binding-dedup', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 7, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
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
    terminal: { conditions: [] },
  };
}

function createRuntimeContext(def: GameDef, runtime: GameDefRuntime, state: GameState): PolicyEvaluationContext {
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents as AgentPolicyCatalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      cacheBinding: { kind: 'runtime', runtime },
    },
    [],
  );
}

function createIsolatedContext(def: GameDef, state: GameState): PolicyEvaluationContext {
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents as AgentPolicyCatalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      cacheBinding: { kind: 'isolated' },
    },
    [],
  );
}

function evaluate(context: PolicyEvaluationContext): number {
  const result = context.evaluateCompiledExpr(scoreRefExpr, undefined);
  assert.equal(result, 7);
  return result;
}

function resetBuildCounts(): void {
  __layout_internal_for_tests.resetBuildEncodedStateLayoutCount();
  __view_internal_for_tests.resetBuildEncodedStateCount();
  __featureTable_internal_for_tests.resetBuildFeatureTableCount();
  __featureTable_internal_for_tests.resetFeatureTableCache();
  __compile_internal_for_tests.resetBuildExpressionFeatureTableCount();
}

function snapshotBuildCounts(): BuildCounts {
  return {
    encodedStateLayouts: __layout_internal_for_tests.getBuildEncodedStateLayoutCount(),
    encodedStates: __view_internal_for_tests.getBuildEncodedStateCount(),
    featureTables: __featureTable_internal_for_tests.getBuildFeatureTableCount(),
    expressionFeatureTables: __compile_internal_for_tests.getBuildExpressionFeatureTableCount(),
  };
}

describe('PolicyEvaluationContext cache binding dedup invariant', () => {
  it('deduplicates encoded-state builds and bytecode compiles across runtime-bound contexts', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 189002, 2).state;
    resetBuildCounts();

    const first = createRuntimeContext(def, runtime, state);
    assert.equal(evaluate(first), 7);
    const afterFirst = snapshotBuildCounts();

    const second = createRuntimeContext(def, runtime, state);
    assert.equal(evaluate(second), 7);

    assert.equal(afterFirst.encodedStateLayouts, 1);
    assert.equal(afterFirst.encodedStates, 1);
    assert.equal(afterFirst.featureTables, 1);
    assert.equal(afterFirst.expressionFeatureTables, 1);
    assert.deepEqual(
      snapshotBuildCounts(),
      afterFirst,
      'A second runtime-bound context for the same state must reuse shared runtime caches.',
    );
    assert.ok(runtime.policyEncodedStateCache.has(state));
    assert.ok(runtime.policyBytecodeCache.has(scoreRefExpr));
  });

  it('keeps the explicit isolated binding correct while using the uncached path', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 189002, 2).state;
    resetBuildCounts();

    const runtimeResult = evaluate(createRuntimeContext(def, runtime, state));
    const afterRuntime = snapshotBuildCounts();

    const isolatedResult = evaluate(createIsolatedContext(def, state));
    const afterIsolated = snapshotBuildCounts();

    assert.equal(isolatedResult, runtimeResult);
    assert.equal(afterRuntime.encodedStates, 1);
    assert.equal(afterRuntime.expressionFeatureTables, 1);
    assert.equal(afterIsolated.encodedStateLayouts, afterRuntime.encodedStateLayouts);
    assert.equal(afterIsolated.featureTables, afterRuntime.featureTables);
    assert.equal(afterIsolated.encodedStates, afterRuntime.encodedStates + 1);
    assert.equal(afterIsolated.expressionFeatureTables, afterRuntime.expressionFeatureTables + 1);
  });
});
