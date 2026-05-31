// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { match, policyTrace, testProbe } from './assertion-test-helpers.js';
import { evaluatePlanRootSelectionExplained } from './plan-root-selection-explained.js';

describe('planRootSelectionExplained assertion', () => {
  const assertion = {
    kind: 'planRootSelectionExplained',
    windowMinDecisions: 2,
    minPlanSelectedRate: 1,
    minAlternativeTemplateCount: 2,
    requiredReadyRoles: ['patrolSpace'],
  } as const;

  it('passes when plan-root domination has explicit alternatives and ready role bindings', () => {
    const outcome = evaluatePlanRootSelectionExplained({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithPlan(['arvn.patrolGovern', 'arvn.trainGovern']) }),
        match({ trace: traceWithPlan(['arvn.patrolGovern', 'arvn.assaultRaid']) }),
      ],
    });

    assert.equal(outcome.kind, 'pass');
  });

  it('fails when selected plan traces do not expose enough alternatives', () => {
    const outcome = evaluatePlanRootSelectionExplained({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithPlan(['arvn.patrolGovern']) }),
        match({ trace: traceWithPlan(['arvn.patrolGovern']) }),
      ],
    });

    assert.equal(outcome.kind, 'fail');
  });

  it('fails when required role bindings are not ready', () => {
    const outcome = evaluatePlanRootSelectionExplained({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithPlan(['arvn.patrolGovern', 'arvn.trainGovern'], []) }),
        match({ trace: traceWithPlan(['arvn.patrolGovern', 'arvn.assaultRaid'], []) }),
      ],
    });

    assert.equal(outcome.kind, 'fail');
  });
});

const traceWithPlan = (
  templates: readonly string[],
  readyRoles: readonly string[] = ['patrolSpace'],
) => policyTrace({
  plan: {
    status: 'selected',
    selectedTemplate: 'arvn.patrolGovern',
    selectedIntent: 'arvn.patrolGovern',
    selectedRootStableMoveKey: 'action:patrol',
    activeDoctrines: [],
    rejectedDoctrines: [],
    filteredOutTemplates: [],
    roleBindingStatuses: readyRoles.map((role) => ({
      role,
      status: {
        kind: 'ready',
        binding: {
          role,
          selectedId: 'space:a',
          quality: 1,
          rank: 1,
          components: {},
        },
      },
    })),
    alternatives: templates.map((templateId) => ({
      templateId,
      rootStableMoveKey: `action:${templateId}`,
      score: 1,
      priorityTier: 1,
      stableKey: templateId,
    })),
    posture: {
      status: 'ready',
      mustViolations: [],
      preferContributions: [],
    },
  },
});
