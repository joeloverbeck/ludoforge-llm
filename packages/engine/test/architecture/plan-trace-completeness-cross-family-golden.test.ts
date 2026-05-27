// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import { selectPlanControlledDecision } from '../../src/agents/plan-controller.js';
import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '../../src/cnl/index.js';
import {
  asActionId,
  asPlayerId,
  assertValidatedGameDef,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentProfile,
  type CompiledPlanTemplate,
  type Decision,
  type StrategyModuleDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

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

function resolveRepoRoot(): string {
  let cursor = fileURLToPath(new URL('.', import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

interface FamilyFixture {
  readonly name: string;
  readonly playerCount: number;
  readonly def: ValidatedGameDef;
  readonly actionId: string;
}

const compileGenericControl = (): ValidatedGameDef => {
  const entrypoint = join(REPO_ROOT, 'data', 'games', 'generic-control.game-spec.md');
  const staged = runGameSpecStagesFromBundle(loadGameSpecBundleFromEntrypoint(entrypoint));

  assert.equal(staged.validation.blocked, false);
  assert.equal(staged.compilation.blocked, false);
  assert.deepEqual(staged.validation.diagnostics, []);
  assert.ok(staged.compilation.result?.gameDef, 'generic-control must compile to a GameDef');
  assert.deepEqual(staged.compilation.result.diagnostics, []);
  return assertValidatedGameDef(staged.compilation.result.gameDef);
};

const compileFitl = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexas = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const strategyModule: StrategyModuleDef = {
  id: 'doctrine.traceCompleteness' as never,
  traceLabel: 'trace completeness doctrine',
  when: literal(true),
  applies: { scopes: ['move'] },
  priority: { tier: 1 },
  selectors: [],
  scoreGroups: [],
  guardrailIds: [],
  fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
  costClass: 'state',
  dependencies: emptyDependencies,
  enablesPlanTemplates: ['traceCompletenessPlan' as never],
  suppressesPlanTemplates: [],
};

const planTemplate = (actionId: string): CompiledPlanTemplate => ({
  traceLabel: 'trace completeness plan',
  root: { actionTags: [], actionIds: [actionId] },
  roles: {
    destination: {
      selectorId: 'destinationSelector' as never,
      required: true,
      constraints: [],
      selector: {
        selectorId: 'destinationSelector' as never,
        role: 'destination',
        scopes: ['move'],
        source: { kind: 'collection', collection: { kind: 'zones' } },
        result: { maxItems: 32, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
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
    label: 'root-action',
    role: 'destination',
    match: { decisionKind: 'actionSelection', targetKind: 'action', decisionPath: 'actionId' },
  }],
  caps: { capClass: 'standard256', maxSteps: 1 },
  fallback: {},
  dependencies: emptyDependencies,
});

const fallbackTemplate = (missingActionId: string): CompiledPlanTemplate => ({
  ...planTemplate(missingActionId),
  traceLabel: 'trace completeness fallback plan',
  roles: {},
});

function profile(planTemplates: readonly string[]): CompiledAgentProfile {
  return {
    fingerprint: `trace-completeness-${planTemplates.join('-')}`,
    params: {},
    use: { considerations: [], strategyModules: ['doctrine.traceCompleteness'], tieBreakers: [] },
    preview: { mode: 'disabled' },
    selection: { mode: 'argmax' },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      strategyModules: ['doctrine.traceCompleteness'],
      planTemplates,
      considerations: [],
    },
  };
}

function catalogFor(actionId: string): AgentPolicyCatalog {
  const proposalTemplate = planTemplate(actionId);
  return {
    schemaVersion: 3,
    catalogFingerprint: `trace-completeness-${actionId}`,
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
      selectors: { destinationSelector: proposalTemplate.roles.destination!.selector },
      strategyModules: {
        'doctrine.traceCompleteness': {
          traceLabel: strategyModule.traceLabel,
          applies: strategyModule.applies,
          selectors: [],
          scoreGroups: [],
          guardrailIds: [],
          fallback: strategyModule.fallback,
          costClass: strategyModule.costClass,
          dependencies: strategyModule.dependencies,
          enablesPlanTemplates: strategyModule.enablesPlanTemplates,
          suppressesPlanTemplates: strategyModule.suppressesPlanTemplates,
        },
      },
      planTemplates: {
        traceCompletenessPlan: proposalTemplate,
        traceCompletenessFallbackPlan: fallbackTemplate('__missing_action__'),
      },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    compiled: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: { destinationSelector: { id: 'destinationSelector' as never, ...proposalTemplate.roles.destination!.selector } },
      strategyModules: { 'doctrine.traceCompleteness': strategyModule },
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile(['traceCompletenessPlan']),
      fallback: profile(['traceCompletenessFallbackPlan']),
    },
    bindingsBySeat: { alpha: 'baseline' },
  };
}

const actionDecision = (actionId: string): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: { actionId: asActionId(actionId), params: {} },
});

function familyFixture(name: string, playerCount: number, def: ValidatedGameDef): FamilyFixture {
  const actionId = String(def.actions[0]?.id);
  const zoneIds = def.zones.map((zone) => String(zone.id)).sort();
  assert.notEqual(actionId, 'undefined', `${name} must expose at least one action`);
  assert.ok(zoneIds.length > 1, `${name} must expose at least two zones`);
  return { name, playerCount, def, actionId };
}

describe('cross-family plan trace completeness golden', () => {
  const families: readonly FamilyFixture[] = [
    familyFixture('generic-control', 2, compileGenericControl()),
    familyFixture('fire-in-the-lake', 4, compileFitl()),
    familyFixture('texas-holdem', 6, compileTexas()),
  ];

  for (const family of families) {
    it(`${family.name} records the new plan trace fields without family-specific assumptions`, () => {
      const catalog = catalogFor(family.actionId);
      const profile = catalog.profiles.baseline!;
      const state = initialState(family.def, 200_004, family.playerCount).state;
      const trace = buildPlanProposalTrace(proposeAdvisoryTurnPlan({
        def: { ...family.def, agents: catalog },
        state,
        seatId: 'alpha',
        playerId: asPlayerId(0),
        profile,
        catalog,
        actionDecisions: [actionDecision(family.actionId)],
      }));
      const alternative = trace.alternatives[0];

      assert.equal(trace.status, 'selected');
      assert.equal(trace.roleBindingStatuses.length, 1);
      assert.equal(trace.roleBindingStatuses[0]?.role, 'destination');
      assert.equal(trace.roleBindingStatuses[0]?.status.kind, 'ready');
      assert.equal(trace.roleBindingStatuses[0]?.status.kind === 'ready'
        && trace.roleBindingStatuses[0].status.binding.selectedId.length > 0, true);
      assert.ok(alternative);
      assert.deepEqual(alternative.decisionSurfaceMatch, { kind: 'matched' });
    });

    it(`${family.name} records structured microturn fallback reasons`, () => {
      const catalog = catalogFor(family.actionId);
      const store: PlanExecutionStateStore = new Map();
      commitPlanExecutionState(store, {
        selectedTemplate: 'traceCompletenessFallbackPlan',
        intent: 'traceCompletenessFallbackPlan',
        roleBindings: {},
        nextStepIndex: 0,
        fallbackHistory: [],
        deviations: [],
        turnId: '1',
        seatId: 'alpha',
      });

      const decision = actionDecision(family.actionId);
      const controlled = selectPlanControlledDecision({
        def: { ...family.def, agents: catalog },
        catalog,
        store,
        turnId: '1',
        seatId: 'alpha',
        legalActions: [decision],
        decisionContext: {
          kind: 'actionSelection',
          seatId: 'alpha' as never,
          eligibleActions: [asActionId(family.actionId)],
        },
        primitiveDecision: decision,
      });

      assert.ok(controlled);
      assert.deepEqual(controlled.planTrace.microturns?.[0]?.fallbackReason, {
        kind: 'primitiveConsiderationPolicyFallback',
      });
    });
  }
});
