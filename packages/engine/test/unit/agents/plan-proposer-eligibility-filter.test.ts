// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlanProposalTrace } from '../../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan } from '../../../src/agents/plan-proposal.js';
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
} from '../../../src/kernel/index.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';

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

const planTemplate = (id: string): CompiledPlanTemplate => ({
  traceLabel: id,
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
});

const strategyModule = (overrides: Partial<StrategyModuleDef> = {}): StrategyModuleDef => ({
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
  ...overrides,
});

function createCatalog(options: {
  readonly modules?: readonly StrategyModuleDef[];
  readonly planTemplates?: readonly string[];
} = {}): AgentPolicyCatalog {
  const modules = options.modules ?? [strategyModule()];
  const planTemplates = options.planTemplates ?? ['alpha', 'beta', 'gamma'];
  const profile: CompiledAgentProfile = {
    fingerprint: 'plan-proposer-eligibility-filter',
    params: {},
    use: { considerations: [], strategyModules: modules.map((module) => String(module.id)), tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      strategyModules: modules.map((module) => String(module.id)),
      planTemplates,
      considerations: [],
    },
  };
  const strategyModules = Object.fromEntries(modules.map((module) => [String(module.id), module]));
  return {
    schemaVersion: 3,
    catalogFingerprint: 'plan-proposer-eligibility-filter',
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
      strategyModules: Object.fromEntries(modules.map((module) => [
        String(module.id),
        {
          traceLabel: module.traceLabel,
          applies: module.applies,
          selectors: module.selectors,
          scoreGroups: module.scoreGroups,
          guardrailIds: module.guardrailIds,
          fallback: module.fallback,
          costClass: module.costClass,
          dependencies: module.dependencies,
          enablesPlanTemplates: module.enablesPlanTemplates,
          suppressesPlanTemplates: module.suppressesPlanTemplates,
        },
      ])),
      planTemplates: Object.fromEntries(planTemplates.map((id) => [id, planTemplate(id)])),
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      strategyModules,
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { baseline: profile },
    bindingsBySeat: { alpha: 'baseline' },
  };
}

function propose(catalog: AgentPolicyCatalog) {
  const def: GameDef = { ...createSyntheticDecisionDef(), agents: catalog };
  const state = initialState(def, 197, 2).state;
  return proposeAdvisoryTurnPlan({
    def,
    state,
    seatId: 'alpha',
    playerId: asPlayerId(0),
    profile: catalog.profiles.baseline!,
    catalog,
    actionDecisions: [actionDecision()],
  });
}

const actionDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: {} },
});

describe('plan proposer doctrine-gated template eligibility', () => {
  it('preserves default-permissive eligibility when no active doctrine declares gating fields', () => {
    const result = propose(createCatalog());

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives.map((alternative) => alternative.templateId), ['alpha', 'beta', 'gamma']);
    assert.deepEqual(result.filteredOutTemplates, []);
    assert.deepEqual(buildPlanProposalTrace(result).filteredOutTemplates, []);
  });

  it('removes suppressed templates and records suppressing doctrine provenance', () => {
    const result = propose(createCatalog({
      modules: [strategyModule({ suppressesPlanTemplates: ['beta' as never] })],
    }));

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives.map((alternative) => alternative.templateId), ['alpha', 'gamma']);
    assert.deepEqual(result.filteredOutTemplates, [{
      templateId: 'beta',
      gatedBy: ['doctrine.branch'],
      reason: 'suppressed',
    }]);
  });

  it('restricts candidates to enabled templates and reports non-enabled templates', () => {
    const result = propose(createCatalog({
      modules: [strategyModule({ enablesPlanTemplates: ['beta' as never] })],
    }));

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives.map((alternative) => alternative.templateId), ['beta']);
    assert.deepEqual(result.filteredOutTemplates, [
      { templateId: 'alpha', gatedBy: ['doctrine.branch'], reason: 'notEnabled' },
      { templateId: 'gamma', gatedBy: ['doctrine.branch'], reason: 'notEnabled' },
    ]);
  });

  it('lets suppression win over a different active module enabling the same template', () => {
    const result = propose(createCatalog({
      modules: [
        strategyModule({ id: 'doctrine.enable' as never, enablesPlanTemplates: ['beta' as never] }),
        strategyModule({ id: 'doctrine.suppress' as never, suppressesPlanTemplates: ['beta' as never] }),
      ],
    }));

    assert.equal(result.status, 'noEligibleTemplate');
    assert.deepEqual(result.alternatives, []);
    assert.deepEqual(result.filteredOutTemplates, [
      { templateId: 'alpha', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
      { templateId: 'beta', gatedBy: ['doctrine.suppress'], reason: 'suppressed' },
      { templateId: 'gamma', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
    ]);
  });

  it('preserves noTemplate status when no plan templates are declared', () => {
    const result = propose(createCatalog({ planTemplates: [] }));

    assert.equal(result.status, 'noTemplate');
    assert.deepEqual(result.filteredOutTemplates, []);
  });
});
