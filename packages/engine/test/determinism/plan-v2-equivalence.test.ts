// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asSeatId,
  asTurnId,
  assertValidatedGameDef,
  createRng,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
  type MicroturnState,
} from '../../src/kernel/index.js';
import type { DecisionKey } from '../../src/kernel/decision-scope.js';
import { eff } from '../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

function createProfile(considerations: readonly string[]): CompiledAgentProfile {
  return {
    fingerprint: 'consideration-only',
    params: {},
    preview: { mode: 'exactWorld' },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations,
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations,
    },
  };
}

function createMicroturnGuidedCatalog(): AgentPolicyCatalog {
  const profile = createProfile(['preferRight', 'preferLeft']);
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'plan-v2-equivalence',
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
      considerations: microturnConsiderations({
        preferRight: {
          costClass: 'state',
          when: literal(true),
          weight: literal(10),
          value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }), literal('right'))),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        preferLeft: {
          costClass: 'state',
          when: literal(true),
          weight: literal(2),
          value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }), literal('left'))),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      }),
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile,
    },
    bindingsBySeat: {
      us: 'baseline',
      arvn: 'baseline',
    },
  });
}

const createCompletionGuidedDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'plan-v2-equivalence', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('branch'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'branch-profile',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
  seats: [{ id: 'us' }, { id: 'arvn' }],
  agents: createMicroturnGuidedCatalog(),
});

const inputFor = (): AgentMicroturnDecisionInput => {
  const def = createCompletionGuidedDef();
  const state = initialState(def, 186, 2).state;
  const microturn: MicroturnState = {
    kind: 'chooseOne',
    seatId: asSeatId('us'),
    decisionContext: {
      kind: 'chooseOne',
      seatId: asSeatId('us'),
      decisionKey: '$pick' as DecisionKey,
      options: [
        { value: 'left', legality: 'legal', illegalReason: null },
        { value: 'right', legality: 'legal', illegalReason: null },
      ],
    },
    legalActions: [
      { kind: 'chooseOne', decisionKey: '$pick' as DecisionKey, value: 'left' },
      { kind: 'chooseOne', decisionKey: '$pick' as DecisionKey, value: 'right' },
    ],
    projectedState: { state },
    turnId: asTurnId(1),
    frameId: asDecisionFrameId(1),
    compoundTurnTrace: [],
  };
  return { def, state, microturn, rng: createRng(186n) };
};

describe('plan v2 equivalence', () => {
  it('keeps consideration-only profiles byte-identical when no plan template is active', () => {
    const first = new PolicyAgent({ traceLevel: 'verbose' }).chooseDecision(inputFor());
    const second = new PolicyAgent({ traceLevel: 'verbose' }).chooseDecision(inputFor());

    assert.equal(first.decision.kind, 'chooseOne');
    assert.deepEqual(first.decision, second.decision);
    assert.equal(JSON.stringify(first.decision), JSON.stringify(second.decision));
    assert.equal(first.agentDecision?.plan, undefined);
    assert.equal(second.agentDecision?.plan, undefined);
  });
});
