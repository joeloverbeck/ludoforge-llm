// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import type { PolicyPreviewDependencies } from '../../../src/agents/policy-preview.js';
import { __internal_for_tests as policyWasmRuntimeInternals } from '../../../src/agents/policy-wasm-runtime.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentDependencyRefs,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { createTrustedExecutableMove } from '../../../src/kernel/trusted-move.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

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

const createDef = (topK: number): GameDef => {
  const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `ready-ref-stats-${topK}`,
    surfaceVisibility: {
      globalVars: {
        projected: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        constant: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
    candidateParamDefs: {
      rank: { type: 'number' },
      projected: { type: 'number' },
      constant: { type: 'number' },
    },
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: {
        moveRank: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: refExpr({ kind: 'candidateParam', id: 'rank' }),
          dependencies: emptyDeps,
        },
        projectedScore: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(1),
          value: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'projected' }),
          dependencies: emptyDeps,
        },
        constantProbe: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(0),
          value: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'constant' }),
          dependencies: emptyDeps,
        },
      },
      tieBreakers: {
        stable: { kind: 'stableMoveKey', costClass: 'state', dependencies: emptyDeps },
      },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: `ready-ref-stats-${topK}`,
        params: {},
        preview: { mode: 'exactWorld', topK },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['moveRank', 'projectedScore', 'constantProbe'],
          tieBreakers: ['stable'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['moveRank', 'projectedScore', 'constantProbe'],
        },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });

  return {
    metadata: { id: 'ready-ref-stats-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'projected', type: 'int', init: 0, min: 0, max: 1000 },
      { name: 'constant', type: 'int', init: 0, min: 0, max: 1000 },
    ],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: actionId,
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
};

const createMoves = (values: readonly number[]): readonly Move[] => values.map((projected, index) => ({
  actionId,
  params: {
    rank: index + 1,
    projected,
    constant: 7,
  },
}));

const evaluate = (topK: number, moves: readonly Move[]) => {
  policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
  const def = createDef(topK);
  const { state } = initialState(def, 42, 2);
  const trustedMoveIndex = new Map(
    moves.map((move) => [
      toMoveIdentityKey(def, move),
      createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
    ]),
  );
  const previewDependencies: PolicyPreviewDependencies = {
    applyMove(_def, currentState, trustedMove) {
      return {
        state: {
          ...currentState,
          globalVars: {
            ...currentState.globalVars,
            projected: Number(trustedMove.move.params.projected),
            constant: Number(trustedMove.move.params.constant),
          },
        },
      };
    },
  };

  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: moves,
    trustedMoveIndex,
    rng: { state: state.rng },
    previewDependencies,
  });
};

describe('preview readyRefStats aggregation', () => {
  it('computes stats for a 9-candidate hand-checked fixture', () => {
    const result = evaluate(9, createMoves([10, 10, 12, 14, 14, 18, 18, 18, 20]));

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.metadata.previewUsage.readyRefStats, {
      'globalVar.constant': {
        readyCount: 9,
        distinctValueCount: 1,
        min: 7,
        max: 7,
        range: 0,
        allReadyValuesEqual: true,
      },
      'globalVar.projected': {
        readyCount: 9,
        distinctValueCount: 5,
        min: 10,
        max: 20,
        range: 10,
        allReadyValuesEqual: false,
      },
    });
    assert.equal(result.metadata.previewUsage.utility, 'lowInformation');
  });

  it('reports none when every preview ref is gated and no ready value resolves', () => {
    const result = evaluate(0, createMoves([10, 20, 30]));

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.metadata.previewUsage.readyRefStats, {
      'globalVar.constant': {
        readyCount: 0,
        distinctValueCount: 0,
        min: null,
        max: null,
        range: null,
        allReadyValuesEqual: true,
      },
      'globalVar.projected': {
        readyCount: 0,
        distinctValueCount: 0,
        min: null,
        max: null,
        range: null,
        allReadyValuesEqual: true,
      },
    });
    assert.equal(result.metadata.previewUsage.utility, 'none');
  });

  it('produces byte-identical readyRefStats JSON across identical runs', () => {
    const moves = createMoves([5, 5, 9, 12, 12, 12, 20, 20, 25]);
    const first = evaluate(9, moves);
    const second = evaluate(9, moves);

    assert.equal(first.kind, 'success');
    assert.equal(second.kind, 'success');
    assert.equal(
      JSON.stringify(first.metadata.previewUsage.readyRefStats),
      JSON.stringify(second.metadata.previewUsage.readyRefStats),
    );
  });
});
