// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../src/agents/policy-evaluation-core.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createTrustedExecutableMove,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledPolicyStrategicCondition,
  type CompiledPolicyExpr,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const conditionIds = [
  'selfCanWinNow',
  'currentLeaderNearWin',
  'coupImminent',
  'monsoonNow',
  'resourcesLow',
  'allyNearWin',
] as const;

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const conditionRef = (conditionId: typeof conditionIds[number]): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'strategicCondition', conditionId, field: 'satisfied' },
});

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

function createCandidate(actionId: string): PolicyEvaluationCandidate {
  return {
    move: { actionId: asActionId(actionId), params: {} },
    stableMoveKey: `${actionId}|{}|noCompound|false|unclassified`,
    actionId,
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    previewSeatMatrix: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

function productionSpec201Conditions(): Record<typeof conditionIds[number], CompiledPolicyStrategicCondition> {
  const conditions = getFitlProductionFixture().gameDef.agents?.compiled.strategicConditions;
  if (conditions === undefined) {
    throw new Error('missing production policy catalog');
  }
  const entries = conditionIds.map((id) => {
    const condition = conditions[id];
    assert.notEqual(condition, undefined, `missing production strategic condition ${id}`);
    return [id, condition];
  });
  return Object.fromEntries(entries) as Record<typeof conditionIds[number], CompiledPolicyStrategicCondition>;
}

function createCatalog(conditions: Record<typeof conditionIds[number], CompiledPolicyStrategicCondition>): AgentPolicyCatalog {
  const catalog = withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'spec-201-strategic-conditions-evaluation',
    surfaceVisibility: {
      globalVars: {
        allyMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      stateFeatures: {
        distanceToCoup: { type: 'number', expr: literal(1), costClass: 'state', dependencies: emptyDeps },
        monsoonNow: { type: 'boolean', expr: literal(true), costClass: 'state', dependencies: emptyDeps },
        selfResources: { type: 'number', expr: literal(1), costClass: 'state', dependencies: emptyDeps },
      },
      candidateFeatures: {
        projectedSelfMargin: { type: 'number', expr: literal(0), costClass: 'candidate', dependencies: emptyDeps },
        projectedCurrentLeaderMargin: { type: 'number', expr: literal(-2), costClass: 'candidate', dependencies: emptyDeps },
      },
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
      strategicConditions: {},
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
    ...catalog,
    compiled: {
      ...catalog.compiled,
      strategicConditions: conditions,
    },
  };
}

function createDef(conditions: Record<typeof conditionIds[number], CompiledPolicyStrategicCondition>): GameDef {
  return {
    metadata: { id: 'spec-201-strategic-conditions-evaluation', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'allyMargin', type: 'int', init: 0, min: -10, max: 10 }],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(conditions),
    actions: [
      {
        id: asActionId('exerciseCondition'),
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
      margins: [{ seat: 'alpha', value: 0 }, { seat: 'beta', value: { _t: 2, ref: 'gvar', var: 'allyMargin' } }],
    },
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
        applyMove: (_def, baseState) => ({
          state: {
            ...baseState,
            globalVars: { ...baseState.globalVars, allyMargin: 0 },
          },
        }),
      },
      cacheBinding: { kind: 'isolated' },
    },
    [],
  );
}

describe('Spec 201 strategic conditions', () => {
  it('evaluates every authored shared-doctrine condition against a curated ready scenario', () => {
    const conditions = productionSpec201Conditions();
    const def = createDef(conditions);
    const { state } = initialState(def, 42, 2);
    const context = createContext(def, state);
    const candidate = createCandidate('exerciseCondition');

    for (const conditionId of conditionIds) {
      assert.equal(context.evaluateCompiledExpr(conditionRef(conditionId), candidate), true, conditionId);
    }
    assert.equal(candidate.previewRefIds.has('preview.relationship.nominalAlly.victoryMargin'), true);
  });
});
