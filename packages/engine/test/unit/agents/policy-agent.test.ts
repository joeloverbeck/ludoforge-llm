import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { createTemplateChooseOneAction, createTemplateChooseOneProfile } from '../../helpers/agent-template-fixtures.js';
import {
  type ActionPipelineDef,
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

function createDef(overrides: Partial<GameDef> = {}): GameDef {
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
    ...overrides,
  };
}

function createTemplateDef(): GameDef {
  const actionId = asActionId('op1');
  const templateAction = createTemplateChooseOneAction(actionId, phaseId);
  const templateProfile = createTemplateChooseOneProfile(actionId);

  return createDef({
    metadata: { id: 'policy-agent-template', players: { min: 2, max: 2 } },
    actions: [templateAction],
    actionPipelines: [templateProfile] as readonly ActionPipelineDef[],
    agents: {
      ...createCatalog(),
      library: {
        ...createCatalog().library,
        candidateFeatures: {
          prefersGamma: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr('eq', refExpr({ kind: 'candidateParam', id: '$target' }), literal('gamma')),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferGamma: {
            costClass: 'candidate',
            weight: literal(10),
            value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'prefersGamma' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['prefersGamma'], aggregates: [] },
          },
        },
      },
      profiles: {
        passive: {
          fingerprint: 'passive-fingerprint',
          params: {},
          use: {
            pruningRules: [],
            scoreTerms: ['preferGamma'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: ['prefersGamma'],
            candidateAggregates: [],
          },
        },
      },
      candidateParamDefs: {
        '$target': { type: 'id' },
      },
    },
  });
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
  it('rejects invalid completionsPerTemplate config', () => {
    assert.throws(
      () => new PolicyAgent({ completionsPerTemplate: 0 }),
      /PolicyAgent completionsPerTemplate must be a positive safe integer/,
    );
  });

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

  it('reuses a single canonical seat binding for symmetric games', () => {
    const def = createDef({
      seats: [{ id: 'neutral' }],
      agents: {
        ...createCatalog(),
        bindingsBySeat: {
          neutral: 'passive',
        },
      },
    });
    const agent = new PolicyAgent();
    const state = initialState(def, 7, 2).state;

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(1),
      legalMoves: [
        { actionId: asActionId('pass'), params: {} },
        { actionId: asActionId('event'), params: {} },
      ],
      rng: createRng(7n),
    });

    assert.deepEqual(result.move, { actionId: asActionId('pass'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.seatId, 'neutral');
    assert.equal(result.agentDecision.resolvedProfileId, 'passive');
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

  it('completes template moves before policy evaluation', () => {
    const def = createTemplateDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [{ actionId: asActionId('op1'), params: {} }],
      rng: createRng(42n),
    });

    assert.equal(result.move.actionId, asActionId('op1'));
    const target = result.move.params['$target'];
    assert.ok(
      target === 'alpha' || target === 'beta' || target === 'gamma',
      `selected target "${String(target)}" should be one of the enum options`,
    );
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy decision trace');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
  });
});
