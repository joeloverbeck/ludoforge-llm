// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import {
  asActionId,
  asPlayerId,
  asZoneId,
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

const planTemplate = (targetZone: string): CompiledPlanTemplate => ({
  traceLabel: 'bounded-rejection-plan',
  root: { actionTags: [], actionIds: ['branch'] },
  roles: {
    destination: {
      selectorId: 'destinationSelector' as never,
      required: true,
      constraints: [{ kind: 'locatedIn', role: 'destination', container: targetZone }],
      selector: {
        selectorId: 'destinationSelector' as never,
        role: 'destination',
        scopes: ['move'],
        source: { kind: 'collection', collection: { kind: 'zones' } },
        result: { maxItems: 300, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
        costClass: 'state',
        dependencies: emptyDependencies,
        refs: {
          id: 'role.destination.id',
          quality: 'role.destination.quality',
          rank: 'role.destination.rank',
          components: 'role.destination.components',
        },
      },
    },
  },
  steps: [{
    label: 'branch',
    role: 'destination',
    match: { decisionKind: 'actionSelection', targetKind: 'action', decisionPath: 'actionId' },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
});

function createCatalog(template: CompiledPlanTemplate): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'plan-trace-rejected-by-constraint-bounded',
    params: {},
    use: { considerations: [], strategyModules: ['doctrine.branch'], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      strategyModules: ['doctrine.branch'],
      planTemplates: ['boundedRejectionPlan'],
      considerations: [],
    },
  };
  return {
    schemaVersion: 3,
    catalogFingerprint: 'plan-trace-rejected-by-constraint-bounded',
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
        destinationSelector: template.roles.destination!.selector,
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
      planTemplates: { boundedRejectionPlan: template },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {
        destinationSelector: {
          id: 'destinationSelector' as never,
          ...template.roles.destination!.selector,
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

function createDef(zoneCount: number): GameDef {
  const zoneIds = Array.from({ length: zoneCount }, (_, index) => `z${String(index).padStart(3, '0')}:none`);
  const template = planTemplate(zoneIds[zoneIds.length - 1]!);
  return {
    ...createSyntheticDecisionDef(),
    zones: zoneIds.map((id) => ({ id: asZoneId(id), owner: 'none', visibility: 'public', ordering: 'set' })),
    agents: createCatalog(template),
  };
}

const actionDecision = (actionId: string): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: { actionId: asActionId(actionId), params: {} },
});

describe('plan trace rejectedByConstraint boundedness', () => {
  it('caps per-alternative rejection records at the proposal trace capLimit and records truncation', () => {
    const def = createDef(258);
    const state = initialState(def, 200_002, 2).state;
    const profile = def.agents!.profiles.baseline!;
    const trace = buildPlanProposalTrace(proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile,
      catalog: def.agents!,
      actionDecisions: [actionDecision('branch')],
    }));
    const alternative = trace.alternatives[0];

    assert.equal(trace.status, 'selected');
    assert.equal(trace.capLimit, 256);
    assert.ok(alternative);
    assert.equal(alternative.rejectedByConstraint?.length, trace.capLimit);
    assert.equal(alternative.rejectedByConstraintTruncatedCount, 1);
    assert.deepEqual(alternative.rejectedByConstraint?.[0], {
      role: 'destination',
      candidateId: 'z000:none',
      rejection: { kind: 'locatedIn', reason: 'tokenNotInContainer' },
    });
  });
});
