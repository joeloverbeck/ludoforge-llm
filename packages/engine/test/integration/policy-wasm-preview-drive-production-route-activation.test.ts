// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../src/agents/policy-eval.js';
import {
  __internal_for_tests as policyWasmRuntimeInternals,
  getProductionPolicyWasmPreviewDriveRouteCount,
  getProductionPolicyWasmPreviewDriveUnsupportedCount,
} from '../../src/agents/policy-wasm-runtime.js';
import { initializePolicyWasmRuntimeSync } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentDependencyRefs,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { createTrustedExecutableMove } from '../../src/kernel/trusted-move.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';
import { capturePreview } from '../architecture/preview-deepening/continued-deepening-fixture.js';

const phaseId = asPhaseId('main');
const actionId = asActionId('choose');

const emptyDeps: CompiledAgentDependencyRefs = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: Extract<AgentPolicyExpr, { readonly kind: 'ref' }>['ref']): AgentPolicyExpr => ({ kind: 'ref', ref });

const createBroadRouteDef = (): GameDef => {
  const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'preview-drive-production-route-activation',
    surfaceVisibility: {
      globalVars: {
        projected: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: { rank: { type: 'number' } },
    library: {
      stateFeatures: {
        projected: {
          type: 'number',
          costClass: 'state',
          expr: refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'projected' }),
          dependencies: emptyDeps,
        },
      },
      candidateFeatures: {
        projectedFromStateFeature: {
          type: 'number',
          costClass: 'preview',
          expr: refExpr({ kind: 'library', refKind: 'previewStateFeature', id: 'projected' } as never),
          dependencies: {
            parameters: [],
            stateFeatures: ['projected'],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      considerations: {
        moveRank: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: refExpr({ kind: 'candidateParam', id: 'rank', onMissing: 'unavailable' }),
          dependencies: emptyDeps,
        },
        projectedScore: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(1),
          value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedFromStateFeature' }),
          dependencies: {
            parameters: [],
            stateFeatures: ['projected'],
            candidateFeatures: ['projectedFromStateFeature'],
            aggregates: [],
            strategicConditions: [],
          },
        },
      },
      tieBreakers: { stable: { kind: 'stableMoveKey', costClass: 'state', dependencies: emptyDeps } },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'preview-drive-production-route-activation',
        params: {},
        preview: { mode: 'exactWorld', budget: { strategy: 'balancedCoverage', fullCandidateCap: 3, minPerGroup: 1 } },
        selection: { mode: 'argmax' },
        use: { pruningRules: [], considerations: ['moveRank', 'projectedScore'], tieBreakers: ['stable'] },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['projectedFromStateFeature'],
          candidateAggregates: [],
          considerations: ['moveRank', 'projectedScore'],
        },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });

  return {
    metadata: { id: 'preview-drive-production-route-activation', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'projected', type: 'int', init: 0, min: 0, max: 1000 }],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [{
      id: actionId,
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  };
};

const runBroadRoute = (): void => {
  const def = createBroadRouteDef();
  const { state } = initialState(def, 42, 2);
  const moves: readonly Move[] = [{ actionId, params: { rank: 1 } }];
  const trustedMoveIndex = new Map(moves.map((move) => [
    toMoveIdentityKey(def, move),
    createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
  ]));

  const result = evaluatePolicyMoveCore({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: moves,
    trustedMoveIndex,
    rng: { state: state.rng },
  });

  assert.equal(result.kind, 'success');
};

describe('policy WASM preview-drive production route activation', () => {
  it('counts supported broad preview-drive batches selected by production score routing', () => {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(initializePolicyWasmRuntimeSync());
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    try {
      runBroadRoute();

      assert.equal(getProductionPolicyWasmPreviewDriveRouteCount(), 1);
      assert.equal(getProductionPolicyWasmPreviewDriveUnsupportedCount(), 0);
    } finally {
      policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
      policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    }
  });

  it('counts deep continued-deepening as unsupported until WASM returns materialized projected state', () => {
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();

    capturePreview('continuedDeepening');

    assert.equal(getProductionPolicyWasmPreviewDriveRouteCount(), 0);
    assert.ok(
      getProductionPolicyWasmPreviewDriveUnsupportedCount() > 0,
      'deep continued-deepening should record an explicit unsupported route classification',
    );

    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  });
});
