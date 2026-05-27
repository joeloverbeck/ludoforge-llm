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
  traceLabel: 'missing-role-plan',
  root: { actionTags: [], actionIds: ['branch'] },
  roles: {
    missingActor: {
      selectorId: 'missingActorSelector' as never,
      required: true,
      constraints: [],
      selector: {
        selectorId: 'missingActorSelector' as never,
        role: 'missingActor',
        scopes: ['move'],
        source: { kind: 'collection', collection: { kind: 'cards' } },
        result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
        costClass: 'state',
        dependencies: emptyDependencies,
        refs: {
          id: 'role.missingActor.id',
          quality: 'role.missingActor.quality',
          rank: 'role.missingActor.rank',
          components: 'role.missingActor.components',
        },
      },
    },
  },
  steps: [{
    label: 'branch',
    role: 'missingActor',
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
  enablesPlanTemplates: [],
  suppressesPlanTemplates: [],
};

function createCatalog(): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'plan-trace-role-binding-status-coverage',
    params: {},
    use: { considerations: [], strategyModules: ['doctrine.branch'], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      strategyModules: ['doctrine.branch'],
      planTemplates: ['missingRolePlan'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'plan-trace-role-binding-status-coverage',
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
      selectors: {
        missingActorSelector: {
          scopes: ['move'],
          source: { kind: 'collection', collection: { kind: 'cards' } },
          result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
          costClass: 'state',
          dependencies: emptyDependencies,
        },
      },
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
          enablesPlanTemplates: module.enablesPlanTemplates,
          suppressesPlanTemplates: module.suppressesPlanTemplates,
        },
      },
      planTemplates: { missingRolePlan: template },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {
        missingActorSelector: {
          id: 'missingActorSelector' as never,
          scopes: ['move'],
          source: { kind: 'collection', collection: { kind: 'cards' } },
          result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
          costClass: 'state',
          dependencies: emptyDependencies,
        },
      },
      strategyModules: { 'doctrine.branch': module },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
}

function createDef(): GameDef {
  const base = createSyntheticDecisionDef();
  return {
    ...base,
    actionTagIndex: {
      byAction: { branch: [] },
      byTag: {},
    },
    agents: createCatalog(),
  };
}

const actionDecision = (actionId: string): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: { actionId: asActionId(actionId), params: {} },
});

describe('plan trace role binding status coverage', () => {
  it('records one roleBindingStatuses entry per template-declared role when proposal fails with noRoleBinding', () => {
    const def = createDef();
    const state = initialState(def, 200, 2).state;
    const profile = def.agents!.profiles.baseline!;
    const result = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: [actionDecision('branch')],
    });
    const trace = buildPlanProposalTrace(result);

    assert.equal(trace.status, 'noRoleBinding');
    assert.deepEqual(trace.roleBindingStatuses, [{
      role: 'missingActor',
      status: { kind: 'unavailable', reason: 'noSelectorMatch' },
    }]);
    assert.deepEqual(
      trace.roleBindingStatuses.map((entry) => entry.role).sort(),
      Object.keys(template.roles).sort(),
    );
  });

  it('records proposal-time decision-surface mismatch without changing selection authority', () => {
    const def = createDef();
    const mismatchTemplate: CompiledPlanTemplate = {
      ...template,
      traceLabel: 'mismatched-surface-plan',
      roles: {},
      steps: [{
        label: 'choose-target',
        role: 'target',
        match: { decisionKind: 'chooseNStep', targetKind: 'zone', decisionPath: 'targetSpaces', actionTag: 'branch' },
      }],
    };
    const profile: CompiledAgentProfile = {
      ...def.agents!.profiles.baseline!,
      plan: {
        ...def.agents!.profiles.baseline!.plan,
        planTemplates: ['mismatchPlan' as never],
      },
    };
    const catalog: AgentPolicyCatalog = {
      ...def.agents!,
      library: {
        ...def.agents!.library,
        planTemplates: { mismatchPlan: mismatchTemplate },
      },
      profiles: { baseline: profile },
    };
    const mismatchDef = { ...def, agents: catalog };
    const state = initialState(mismatchDef, 201, 2).state;

    const result = proposeAdvisoryTurnPlan({
      def: mismatchDef,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog,
      actionDecisions: [actionDecision('branch')],
    });

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives[0]?.decisionSurfaceMatch, {
      kind: 'mismatched',
      expected: 'chooseNStep',
      observed: 'actionSelection',
    });
  });
});
