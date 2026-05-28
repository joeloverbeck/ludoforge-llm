// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../../src/agents/policy-evaluation-core.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createTrustedExecutableMove,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledPolicyExpr,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (
  op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'],
  ...args: AgentPolicyExpr[]
): AgentPolicyExpr => ({ kind: 'op', op, args });

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

function conditionRef(conditionId: string): CompiledPolicyExpr {
  return { kind: 'ref', ref: { kind: 'strategicCondition', conditionId, field: 'satisfied' } };
}

function createCandidate(actionId: string): PolicyEvaluationCandidate {
  return {
    move: { actionId: asActionId(actionId), params: {} },
    stableMoveKey: `${actionId}|{}|false|unclassified`,
    actionId,
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    previewSeatMatrix: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

function createDef(): GameDef {
  const catalog = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'strategic-condition-candidate-context',
    surfaceVisibility: {
      globalVars: {
        allyMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      relationships: {
        ally: {
          role: 'nominalAlly',
          seat: 'beta',
          priority: 0,
          hasGainValue: false,
        },
      },
      strategicConditions: {
        allyNearWin: {
          target: opExpr(
            'gte',
            refExpr({ kind: 'previewRelationship', role: 'nominalAlly', field: 'victoryMargin' }),
            literal(3),
          ),
        },
      },
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        preview: { mode: 'exactWorld' },
        selection: { mode: 'argmax' },
        use: { guardrails: [], considerations: [], tieBreakers: [] },
        plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });

  return {
    metadata: { id: 'strategic-condition-candidate-context', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'allyMargin', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: asActionId('lowGain'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('highGain'),
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
    terminal: { conditions: [], margins: [{ seat: 'alpha', value: 0 }, { seat: 'beta', value: { _t: 2, ref: 'gvar', var: 'allyMargin' } }] },
  };
}

function createContext(def: GameDef, state: GameState): PolicyEvaluationContext {
  const catalog = def.agents as AgentPolicyCatalog;
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      previewDependencies: {
        classifyCandidate: (_def, baseState, move) => ({
          kind: 'playable',
          move: createTrustedExecutableMove(move, baseState.stateHash, 'enumerateLegalMoves'),
        }),
        classifyPlayableMoveCandidate: (_def, baseState, move) => ({
          kind: 'playable',
          move: createTrustedExecutableMove(move, baseState.stateHash, 'enumerateLegalMoves'),
        }),
        applyMove: (_def, baseState, move) => ({
          state: {
            ...baseState,
            globalVars: {
              ...baseState.globalVars,
              allyMargin: ((move as { readonly actionId?: string }).actionId ?? move.move.actionId) === 'highGain' ? 5 : 1,
            },
          },
        }),
      },
      cacheBinding: { kind: 'isolated' },
    },
    [],
  );
}

describe('strategic condition candidate context', () => {
  it('evaluates preview-dependent strategic conditions per candidate', () => {
    const def = createDef();
    const { state } = initialState(def, 42, 2);
    const context = createContext(def, state);
    const lowGain = createCandidate('lowGain');
    const highGain = createCandidate('highGain');

    assert.equal(context.evaluateCompiledExpr(conditionRef('allyNearWin'), lowGain), false);
    const highMargin = context.evaluateCompiledExpr(
      refExpr({ kind: 'previewRelationship', role: 'nominalAlly', field: 'victoryMargin' }) as CompiledPolicyExpr,
      highGain,
    );
    assert.equal(
      context.evaluateCompiledExpr(conditionRef('allyNearWin'), highGain),
      true,
      JSON.stringify({
        highMargin,
        previewOutcome: highGain.previewOutcome,
        previewRefIds: [...highGain.previewRefIds],
        unknownPreviewRefs: [...highGain.unknownPreviewRefs],
      }),
    );
    assert.equal(highGain.previewRefIds.has('preview.relationship.nominalAlly.victoryMargin'), true);
  });

  it('keeps preview-dependent strategic conditions unavailable without a candidate', () => {
    const def = createDef();
    const { state } = initialState(def, 42, 2);
    const context = createContext(def, state);

    assert.equal(context.evaluateCompiledExpr(conditionRef('allyNearWin'), undefined), undefined);
  });
});
