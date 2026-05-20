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
const expr: CompiledPolicyExpr = { kind: 'literal', value: 7 };
const WARM_CONTEXT_COUNT = 5;

interface StaticBuildCounts {
  readonly buildEncodedStateLayoutCount: number;
  readonly buildFeatureTableCount: number;
  readonly buildExpressionFeatureTableCount: number;
  readonly buildEncodedStateCount: number;
}

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'policy-evaluation-context-constructor-invariant',
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
  state: GameState,
): PolicyEvaluationContext {
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
    },
    [],
  );
}

function evaluate(context: PolicyEvaluationContext): void {
  assert.equal(context.evaluateCompiledExpr(expr, undefined), 7);
}

function resetStaticBuildCounters(): void {
  __layout_internal_for_tests.resetBuildEncodedStateLayoutCount();
  __featureTable_internal_for_tests.resetBuildFeatureTableCount();
  __featureTable_internal_for_tests.resetFeatureTableCache();
  __compile_internal_for_tests.resetBuildExpressionFeatureTableCount();
  __view_internal_for_tests.resetBuildEncodedStateCount();
}

function snapshotStaticBuildCounts(): StaticBuildCounts {
  return {
    buildEncodedStateLayoutCount: __layout_internal_for_tests.getBuildEncodedStateLayoutCount(),
    buildFeatureTableCount: __featureTable_internal_for_tests.getBuildFeatureTableCount(),
    buildExpressionFeatureTableCount: __compile_internal_for_tests.getBuildExpressionFeatureTableCount(),
    buildEncodedStateCount: __view_internal_for_tests.getBuildEncodedStateCount(),
  };
}

describe('PolicyEvaluationContext constructor static-build invariant', () => {
  it('routes layout, feature table, bytecode, and encoded state through first-touch-only runtime caches', () => {
    const def = createDef('policy-evaluation-context-constructor-invariant');
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 172006, 2).state;
    resetStaticBuildCounters();

    evaluate(createContext(def, runtime, state));
    const firstTouchCounts = snapshotStaticBuildCounts();

    for (let index = 0; index < WARM_CONTEXT_COUNT; index += 1) {
      evaluate(createContext(def, runtime, state));
    }

    assert.equal(firstTouchCounts.buildEncodedStateLayoutCount, 1);
    assert.equal(firstTouchCounts.buildFeatureTableCount, 1);
    assert.equal(firstTouchCounts.buildEncodedStateCount, 1);
    assert.ok(
      firstTouchCounts.buildExpressionFeatureTableCount <= 1,
      'Expression feature-table extension should be first-touch-only when an expression needs refs outside the base table.',
    );
    assert.deepEqual(
      snapshotStaticBuildCounts(),
      firstTouchCounts,
      'Warm PolicyEvaluationContext constructions must not invoke direct build* paths past first touch.',
    );
  });
});
