// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import {
  __compile_internal_for_tests,
  type PolicyBytecode,
} from '../../../src/cnl/policy-bytecode/index.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildEncodedStateLayout,
  createGameDefRuntime,
  forkGameDefRuntimeForRun,
  initialState,
  type AgentPolicyCatalog,
  type CompiledPolicyExpr,
  type EncodedStateLayout,
  type GameDef,
  type GameDefRuntime,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const expr: CompiledPolicyExpr = { kind: 'literal', value: 7 };

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'policy-bytecode-cache',
    surfaceVisibility: {
      globalVars: {},
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
      pruningRules: {},
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
        use: { pruningRules: [], considerations: [], tieBreakers: [] },
        plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });
}

function createDef(id: string): GameDef {
  return {
    metadata: { id, players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
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

function createContext(
  def: GameDef,
  runtime: GameDefRuntime,
  input: { readonly encodedStateLayout?: EncodedStateLayout } = {},
): PolicyEvaluationContext {
  const { state } = initialState(def, 172004, 2);
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents as AgentPolicyCatalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      runtime,
      ...(input.encodedStateLayout === undefined ? {} : { encodedStateLayout: input.encodedStateLayout }),
    },
    [],
  );
}

function evaluate(context: PolicyEvaluationContext): void {
  assert.equal(context.evaluateCompiledExpr(expr, undefined), 7);
}

function cachedBytecode(runtime: GameDefRuntime): PolicyBytecode | undefined {
  return runtime.policyBytecodeCache.get(expr);
}

describe('PolicyEvaluationContext policy bytecode runtime cache', () => {
  it('reuses compiled bytecode across contexts sharing a GameDefRuntime', () => {
    const def = createDef('policy-bytecode-cache-reuse');
    const runtime = createGameDefRuntime(def);
    __compile_internal_for_tests.resetBuildExpressionFeatureTableCount();

    evaluate(createContext(def, runtime));
    const firstBytecode = cachedBytecode(runtime);
    const firstCount = __compile_internal_for_tests.getBuildExpressionFeatureTableCount();

    evaluate(createContext(def, runtime));

    assert.ok(firstBytecode !== undefined);
    assert.equal(__compile_internal_for_tests.getBuildExpressionFeatureTableCount(), firstCount);
    assert.equal(cachedBytecode(runtime), firstBytecode);
    assert.ok(firstCount <= 1);
  });

  it('carries the shared structural bytecode cache through runtime forks', () => {
    const def = createDef('policy-bytecode-cache-fork');
    const runtime = createGameDefRuntime(def);
    const forked = forkGameDefRuntimeForRun(runtime);

    assert.equal(forked.policyBytecodeCache, runtime.policyBytecodeCache);
  });

  it('does not reuse runtime bytecode for explicit non-canonical layouts', () => {
    const def = createDef('policy-bytecode-cache-explicit-layout');
    const runtime = createGameDefRuntime(def);
    const explicitLayout = buildEncodedStateLayout(def);
    __compile_internal_for_tests.resetBuildExpressionFeatureTableCount();

    evaluate(createContext(def, runtime));
    const runtimeBytecode = cachedBytecode(runtime);
    const firstCount = __compile_internal_for_tests.getBuildExpressionFeatureTableCount();

    evaluate(createContext(def, runtime, { encodedStateLayout: explicitLayout }));

    assert.ok(runtimeBytecode !== undefined);
    assert.notEqual(explicitLayout, buildEncodedStateLayout(def));
    assert.equal(cachedBytecode(runtime), runtimeBytecode);
    assert.equal(__compile_internal_for_tests.getBuildExpressionFeatureTableCount(), firstCount);
  });
});
