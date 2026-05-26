// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { proposeAdvisoryTurnPlan } from '../../../src/agents/plan-proposal.js';
import {
  asActionId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
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

const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const seatSelf = (): AgentPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'seatIntrinsic', intrinsic: 'self' },
});
const equals = (left: AgentPolicyExpr, right: AgentPolicyExpr): AgentPolicyExpr => ({
  kind: 'op',
  op: 'eq',
  args: [left, right],
});

const template = (): CompiledPlanTemplate => ({
  traceLabel: 'train',
  root: { actionTags: ['train'], actionIds: [] },
  roles: {},
  steps: [],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
});

const module = (
  id: string,
  priority: number,
  when: AgentPolicyExpr = literal(true),
): StrategyModuleDef => ({
  id: id as never,
  traceLabel: id,
  when,
  applies: { scopes: ['move'], actionTags: ['train'] },
  priority: { tier: priority },
  selectors: [],
  scoreGroups: [],
  guardrailIds: [],
  fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
  enablesPlanTemplates: [],
  suppressesPlanTemplates: [],
});

const profile = (strategyModules: readonly string[]): CompiledAgentProfile => ({
  fingerprint: `profile-${strategyModules.join('-')}`,
  params: {},
  use: { considerations: [], strategyModules, tieBreakers: [] },
  preview: { mode: 'disabled' },
  selection: { mode: 'argmax' },
  plan: {
    stateFeatures: [],
    candidateFeatures: [],
    candidateAggregates: [],
    selectors: [],
    strategyModules,
    planTemplates: ['train'],
    considerations: [],
  },
});

const createCatalog = (
  activeProfile: CompiledAgentProfile,
  modules: readonly StrategyModuleDef[],
): AgentPolicyCatalog => ({
  schemaVersion: 3,
  catalogFingerprint: 'strategy-module-isolation',
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
    strategyModules: Object.fromEntries(modules.map((entry) => [
      String(entry.id),
      {
        traceLabel: entry.traceLabel,
        applies: entry.applies,
        selectors: entry.selectors,
        scoreGroups: [],
        guardrailIds: [],
        fallback: entry.fallback,
        costClass: entry.costClass,
        dependencies: entry.dependencies,
        enablesPlanTemplates: entry.enablesPlanTemplates,
        suppressesPlanTemplates: entry.suppressesPlanTemplates,
      },
    ])),
    planTemplates: { train: template() },
    considerations: {},
    tieBreakers: {},
    strategicConditions: {},
  },
  compiled: {
    stateFeatures: {},
    candidateFeatures: {},
    candidateAggregates: {},
    selectors: {},
    strategyModules: Object.fromEntries(modules.map((entry) => [String(entry.id), entry])),
    considerations: {},
    tieBreakers: {},
    strategicConditions: {},
  },
  profiles: { active: activeProfile },
  bindingsBySeat: { alpha: 'active' },
});

const createDef = (catalog: AgentPolicyCatalog): GameDef => ({
  ...createSyntheticDecisionDef(),
  seats: [{ id: 'alpha' }, { id: 'beta' }],
  actionTagIndex: {
    byAction: { branch: ['train'] },
    byTag: { train: ['branch'] },
  },
  agents: catalog,
});

const actionDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('branch'),
  move: { actionId: asActionId('branch'), params: {} },
});

describe('plan proposal strategy module isolation', () => {
  it('ignores library strategy modules that are not listed by the active profile plan', () => {
    const own = module('doctrine.own', 10);
    const foreign = module('doctrine.foreign', 100);
    const catalog = createCatalog(profile(['doctrine.own']), [own, foreign]);
    const def = createDef(catalog);
    const state = initialState(def, 188, 2).state;

    const result = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile: catalog.profiles.active!,
      catalog,
      actionDecisions: [actionDecision()],
    });

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.activeDoctrines, ['doctrine.own']);
    assert.equal(result.selected?.priorityTier, 10);
  });

  it('evaluates authored seat.self gates for strategy modules during plan proposal', () => {
    const alpha = module('doctrine.alpha', 10, equals(seatSelf(), literal('alpha')));
    const beta = module('doctrine.beta', 30, equals(seatSelf(), literal('beta')));
    const catalog = createCatalog(profile(['doctrine.alpha', 'doctrine.beta']), [alpha, beta]);
    const def = createDef(catalog);
    const state = initialState(def, 188, 2).state;

    const alphaResult = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'alpha',
      playerId: asPlayerId(0),
      profile: catalog.profiles.active!,
      catalog,
      actionDecisions: [actionDecision()],
    });
    const betaResult = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'beta',
      playerId: asPlayerId(1),
      profile: catalog.profiles.active!,
      catalog,
      actionDecisions: [actionDecision()],
    });

    assert.deepEqual(alphaResult.activeDoctrines, ['doctrine.alpha']);
    assert.equal(alphaResult.selected?.priorityTier, 10);
    assert.deepEqual(betaResult.activeDoctrines, ['doctrine.beta']);
    assert.equal(betaResult.selected?.priorityTier, 30);
  });
});
