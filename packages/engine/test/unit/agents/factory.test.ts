import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAgent, normalizeAgentDescriptor, parseAgentDescriptor, parseAgentSpec } from '../../../src/agents/factory.js';
import { GreedyAgent } from '../../../src/agents/greedy-agent.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { RandomAgent } from '../../../src/agents/random-agent.js';
import { completeClassifiedMoves } from '../../helpers/classified-move-fixtures.js';
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

function moveConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalog['library']['considerations'][string], 'scopes'>>,
): AgentPolicyCatalog['library']['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['move'], ...definition }]),
  );
}

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      activeCardIdentity: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardTag: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardMetadata: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardAnnotation: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
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
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      considerations: moveConsiderations({
        preferPass: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'candidateTag', tagName: 'pass' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        preferEvent: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [], strategicConditions: [] },
        },
      }),
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      strategicConditions: {},
    },
    profiles: {
      passive: {
        fingerprint: 'passive-fingerprint',
        params: {},
        preview: { mode: 'exactWorld' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['preferPass'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['preferPass'],
        },
      },
      aggressive: {
        fingerprint: 'aggressive-fingerprint',
        params: {},
        preview: { mode: 'exactWorld' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['preferEvent'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['isEvent'],
          candidateAggregates: [],
          considerations: ['preferEvent'],
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
    actionTagIndex: {
      byAction: { pass: ['pass'], event: ['event'] },
      byTag: { pass: ['pass'], event: ['event'] },
    },
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
    legalMoves: completeClassifiedMoves(legalMoves),
    rng: createRng(7n),
  };
}

describe('normalizeAgentDescriptor', () => {
  it('accepts builtin descriptors', () => {
    assert.deepEqual(normalizeAgentDescriptor({ kind: 'builtin', builtinId: 'random' }), {
      kind: 'builtin',
      builtinId: 'random',
    });
  });

  it('rejects unknown builtin descriptors', () => {
    assert.throws(
      () => normalizeAgentDescriptor({ kind: 'builtin', builtinId: 'smart' as never }),
      /Unknown builtin agent id: smart\. Allowed: random, greedy/,
    );
  });

  it('rejects empty policy profile overrides', () => {
    assert.throws(
      () => normalizeAgentDescriptor({ kind: 'policy', profileId: '   ' }),
      /Policy agent profileId cannot be empty/,
    );
  });
});

describe('parseAgentDescriptor', () => {
  it('parses builtin descriptors from explicit builtin sugar', () => {
    assert.deepEqual(parseAgentDescriptor(' builtin:GREEDY '), { kind: 'builtin', builtinId: 'greedy' });
  });

  it('parses policy descriptors with and without explicit profiles', () => {
    assert.deepEqual(parseAgentDescriptor('policy'), { kind: 'policy' });
    assert.deepEqual(parseAgentDescriptor('policy:aggressive'), { kind: 'policy', profileId: 'aggressive' });
  });

  it('rejects retired naked builtin strings', () => {
    assert.throws(
      () => parseAgentDescriptor('random'),
      /Unknown agent descriptor: random\. Allowed forms: policy, policy:<profileId>, builtin:random, builtin:greedy/,
    );
  });
});

describe('createAgent', () => {
  it('returns RandomAgent for a builtin random descriptor', () => {
    const agent = createAgent({ kind: 'builtin', builtinId: 'random' });
    assert.ok(agent instanceof RandomAgent);
  });

  it('returns GreedyAgent for a builtin greedy descriptor', () => {
    const agent = createAgent({ kind: 'builtin', builtinId: 'greedy' });
    assert.ok(agent instanceof GreedyAgent);
  });

  it('returns PolicyAgent for a policy descriptor', () => {
    const agent = createAgent({ kind: 'policy' });
    assert.ok(agent instanceof PolicyAgent);
  });

  it('uses authored seat bindings by default for policy descriptors', () => {
    const def = createDef();
    const agent = createAgent({ kind: 'policy' });
    const result = agent.chooseMove(createInput(def));

    assert.deepEqual(result.move.move, { actionId: asActionId('pass'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.requestedProfileId, null);
    assert.equal(result.agentDecision.resolvedProfileId, 'passive');
  });

  it('forces an explicit authored profile when the descriptor supplies one', () => {
    const def = createDef();
    const agent = createAgent({ kind: 'policy', profileId: 'aggressive' });
    const result = agent.chooseMove(createInput(def));

    assert.deepEqual(result.move.move, { actionId: asActionId('event'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.requestedProfileId, 'aggressive');
    assert.equal(result.agentDecision.resolvedProfileId, 'aggressive');
  });
});

describe('parseAgentSpec', () => {
  it('parses ordered descriptors from a comma-separated spec', () => {
    const descriptors = parseAgentSpec('builtin:random, policy:aggressive', 2);
    assert.deepEqual(descriptors, [
      { kind: 'builtin', builtinId: 'random' },
      { kind: 'policy', profileId: 'aggressive' },
    ]);
  });

  it('throws when player count does not match', () => {
    assert.throws(
      () => parseAgentSpec('builtin:greedy', 2),
      /Agent spec has 1 agents but game needs 2/,
    );
  });

  it('rejects malformed slots after empty-token filtering', () => {
    assert.throws(
      () => parseAgentSpec('builtin:random,,builtin:smart', 2),
      /Unknown builtin agent id: smart\. Allowed: random, greedy/,
    );
  });
});
