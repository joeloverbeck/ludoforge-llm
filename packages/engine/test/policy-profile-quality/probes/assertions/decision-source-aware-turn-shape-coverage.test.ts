// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { match, policyTrace, testProbe } from './assertion-test-helpers.js';
import { evaluateDecisionSourceAwareTurnShapeCoverage } from './decision-source-aware-turn-shape-coverage.js';

describe('decisionSourceAwareTurnShapeCoverage assertion', () => {
  const assertion = {
    kind: 'decisionSourceAwareTurnShapeCoverage',
    evaluatorId: 'impact',
    windowMinDecisions: 2,
  } as const;

  it('passes when decisions are explicitly plan-root selected', () => {
    const outcome = evaluateDecisionSourceAwareTurnShapeCoverage({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithSelectedPlan() }),
        match({ trace: traceWithSelectedPlan() }),
      ],
    });

    assert.equal(outcome.kind, 'pass');
  });

  it('passes when fallback turn-shape traces include true and false ready outcomes', () => {
    const outcome = evaluateDecisionSourceAwareTurnShapeCoverage({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithImpact(true) }),
        match({ trace: traceWithImpact(false) }),
      ],
    });

    assert.equal(outcome.kind, 'pass');
  });

  it('fails when a fallback decision lacks the evaluator trace', () => {
    const outcome = evaluateDecisionSourceAwareTurnShapeCoverage({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithSelectedPlan() }),
        match({ trace: policyTrace({ turnShape: { evaluators: [] } }) }),
      ],
    });

    assert.equal(outcome.kind, 'fail');
  });
});

const traceWithSelectedPlan = () => policyTrace({
  plan: {
    status: 'selected',
    selectedTemplate: 'arvn.patrolGovern',
    selectedIntent: 'arvn.patrolGovern',
    selectedRootStableMoveKey: 'action:patrol',
    activeDoctrines: [],
    rejectedDoctrines: [],
    filteredOutTemplates: [],
    roleBindingStatuses: [],
    alternatives: [],
    posture: {
      status: 'ready',
      mustViolations: [],
      preferContributions: [],
    },
  },
});

const traceWithImpact = (minimumImpactSatisfied: boolean) => policyTrace({
  turnShape: {
    evaluators: [
      {
        id: 'impact',
        traceLabel: 'impact',
        minimumImpactSatisfied,
        previewStatus: 'ready',
        objectives: [{ id: 'self-standing', delta: minimumImpactSatisfied ? 1 : 0 }],
      },
    ],
  },
});
