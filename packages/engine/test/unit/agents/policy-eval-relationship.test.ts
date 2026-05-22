// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import { stablePayloadCode } from '../../../src/cnl/policy-bytecode/feature-table.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledPolicyExpr,
  type GameDef,
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
const encodedId = (value: string): number => stablePayloadCode({ literal: value });

function createBaseDef(): GameDef {
  return {
    metadata: { id: 'relationship-runtime-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'allyReady', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: withCompiledPolicyCatalog({
      schemaVersion: 3,
      catalogFingerprint: 'relationship-test',
      surfaceVisibility: {
        globalVars: {
          allyReady: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        },
        globalMarkers: {},
        perPlayerVars: {},
        derivedMetrics: {},
        victory: {
          currentMargin: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          currentRank: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
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
        tieBreakers: {
          rng: { kind: 'rng', costClass: 'state', dependencies: emptyDeps },
        },
        relationships: {
          dormantAlly: {
            role: 'nominalAlly',
            seat: 'alpha',
            condition: 'allyReady',
            priority: 0,
            hasGainValue: true,
            gainValue: literal(99),
          },
          activeAlly: {
            role: 'nominalAlly',
            seat: 'beta',
            priority: 1,
            hasGainValue: true,
            gainValue: literal(7),
          },
          leader: {
            role: 'leader',
            standingRole: 'currentLeader',
            priority: 0,
            hasGainValue: false,
          },
        },
        strategicConditions: {
          allyReady: {
            target: opExpr('eq', refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'allyReady' }), literal(1)),
          },
        },
      },
      profiles: {
        baseline: {
          fingerprint: 'baseline',
          params: {},
          preview: { mode: 'exactWorld' },
          selection: { mode: 'argmax' },
          use: { guardrails: [], considerations: [], tieBreakers: ['rng'] },
          plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
        },
      },
      bindingsBySeat: { alpha: 'baseline' },
    }),
    actions: [{
      id: asActionId('pass'),
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
    terminal: {
      conditions: [],
      margins: [{ seat: 'alpha', value: 1 }, { seat: 'beta', value: 2 }],
      ranking: { order: 'desc', tieBreakOrder: ['alpha', 'beta'] },
    },
  };
}

function createContext(allyReady: number): PolicyEvaluationContext {
  const def = createBaseDef();
  const catalog = def.agents as AgentPolicyCatalog;
  const { state } = initialState(def, 42, 2);
  return new PolicyEvaluationContext(
    {
      def,
      state: { ...state, globalVars: { ...state.globalVars, allyReady } },
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      cacheBinding: { kind: 'isolated' },
    },
    [],
  );
}

function relationshipRef(role: 'nominalAlly' | 'leader', field: 'seat' | 'gainValue'): CompiledPolicyExpr {
  return { kind: 'ref', ref: { kind: 'relationship', role, field } };
}

describe('relationship policy refs', () => {
  it('resolves the first condition-satisfied same-role binding by priority', () => {
    const inactive = createContext(0);
    assert.equal(inactive.evaluateCompiledExpr(relationshipRef('nominalAlly', 'seat'), undefined), encodedId('beta'));
    assert.equal(inactive.evaluateCompiledExpr(relationshipRef('nominalAlly', 'gainValue'), undefined), 7);

    const active = createContext(1);
    assert.equal(active.evaluateCompiledExpr(relationshipRef('nominalAlly', 'seat'), undefined), encodedId('alpha'));
    assert.equal(active.evaluateCompiledExpr(relationshipRef('nominalAlly', 'gainValue'), undefined), 99);
  });

  it('resolves standing-role relationship seats without hardcoded faction ids', () => {
    const context = createContext(0);
    assert.equal(context.evaluateCompiledExpr(relationshipRef('leader', 'seat'), undefined), encodedId('beta'));
    assert.equal(context.evaluateCompiledExpr(relationshipRef('leader', 'gainValue'), undefined), undefined);
  });
});
