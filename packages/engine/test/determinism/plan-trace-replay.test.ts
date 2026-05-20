// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import {
  asActionId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type GameDef,
  type StrategyModuleDef,
} from '../../src/kernel/index.js';
import { createSyntheticDecisionDef } from '../helpers/synthetic-decision-fixture.js';

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  strategicConditions: [],
};

const literal = (value: string | number | boolean) => ({ kind: 'literal' as const, value });

const template: CompiledPlanTemplate = {
  traceLabel: 'trace-plan',
  root: { actionTags: [], actionIds: ['branch'] },
  roles: {
    actor: {
      selectorId: 'actorSelector' as never,
      required: true,
      constraints: [],
      selector: {
        selectorId: 'actorSelector' as never,
        role: 'actor',
        scopes: ['move'],
        source: { kind: 'collection', collection: { kind: 'players' } },
        result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
        costClass: 'state',
        dependencies: emptyDependencies,
        refs: {
          id: 'role.actor.id',
          quality: 'role.actor.quality',
          rank: 'role.actor.rank',
          components: 'role.actor.components',
        },
      },
    },
  },
  steps: [{
    label: 'branch',
    role: 'actor',
    match: { decisionKind: 'actionSelection', targetKind: 'action', decisionPath: 'actionId' },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
};

const module: StrategyModuleDef = {
  id: 'doctrine.branch' as never,
  traceLabel: 'branch doctrine',
  when: literal(true),
  applies: { scopes: ['move'] },
  priority: { tier: 1 },
  selectors: [],
  scoreGroups: [],
  guardrailIds: [],
  fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
};

function createCatalog(): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'plan-trace-determinism',
    params: {},
    use: { considerations: [], strategyModules: ['doctrine.branch'], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      strategyModules: ['doctrine.branch'],
      planTemplates: ['tracePlan'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'plan-trace-determinism',
    surfaceVisibility: {
      globalVars: {},
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
      selectors: {},
      strategyModules: {
        'doctrine.branch': {
          traceLabel: module.traceLabel,
          applies: module.applies,
          selectors: [],
          scoreGroups: [],
          guardrailIds: [],
          fallback: module.fallback,
          costClass: module.costClass,
          dependencies: module.dependencies,
        },
      },
      planTemplates: { tracePlan: template },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      strategyModules: { 'doctrine.branch': module },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
}

const actionDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: {} },
});

describe('plan trace replay determinism', () => {
  it('emits byte-identical proposal-side plan traces for the same inputs', () => {
    const def: GameDef = { ...createSyntheticDecisionDef(), agents: createCatalog() };
    const state = initialState(def, 186, 2).state;
    const profile = def.agents!.profiles.baseline!;
    const input = {
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: [actionDecision()],
    };

    const first = JSON.stringify(buildPlanProposalTrace(proposeAdvisoryTurnPlan(input)));
    const second = JSON.stringify(buildPlanProposalTrace(proposeAdvisoryTurnPlan(input)));

    assert.equal(second, first);
  });
});
