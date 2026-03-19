import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('event')),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {
        preferPass: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'isPass' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        preferEvent: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [] },
        },
      },
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
    },
    profiles: {
      passive: {
        fingerprint: 'passive-fingerprint',
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: ['preferPass'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
      aggressive: {
        fingerprint: 'aggressive-fingerprint',
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: ['preferEvent'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['isEvent'],
          candidateAggregates: [],
        },
      },
    },
    bindingsBySeat: {
      us: 'passive',
    },
  };
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-agent', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
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
      {
        id: asActionId('event'),
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

function createInput(def: GameDef): Parameters<PolicyAgent['chooseMove']>[0] {
  const state = initialState(def, 7, 2).state;
  const legalMoves: readonly Move[] = [
    { actionId: asActionId('pass'), params: {} },
    { actionId: asActionId('event'), params: {} },
  ];
  return {
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves,
    rng: createRng(7n),
  };
}

describe('PolicyAgent', () => {
  it('resolves the bound seat profile and returns a legal move', () => {
    const def = createDef();
    const agent = new PolicyAgent();

    const result = agent.chooseMove(createInput(def));

    assert.deepEqual(result.move, { actionId: asActionId('pass'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.seatId, 'us');
    assert.equal(result.agentDecision.resolvedProfileId, 'passive');
    assert.equal(result.agentDecision.profileFingerprint, 'passive-fingerprint');
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('supports an explicit profile override without changing authored bindings', () => {
    const def = createDef();
    const agent = new PolicyAgent({ profileId: 'aggressive' });

    const result = agent.chooseMove(createInput(def));

    assert.deepEqual(result.move, { actionId: asActionId('event'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.requestedProfileId, 'aggressive');
    assert.equal(result.agentDecision.resolvedProfileId, 'aggressive');
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('emits emergency fallback metadata when the requested profile is missing', () => {
    const def = createDef();
    const agent = new PolicyAgent({ profileId: 'missing-profile' });

    const result = agent.chooseMove(createInput(def));

    assert.equal(
      result.move.actionId === asActionId('pass') || result.move.actionId === asActionId('event'),
      true,
    );
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.emergencyFallback, true);
    assert.equal(result.agentDecision.failure?.code, 'PROFILE_MISSING');
    assert.equal(result.agentDecision.selectedStableMoveKey !== null, true);
  });
});
