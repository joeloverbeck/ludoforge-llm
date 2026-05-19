// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { match, policyTrace, testProbe } from './assertion-test-helpers.js';
import { evaluateTurnShapeMinimumImpactObserved } from './turn-shape-minimum-impact-observed.js';

describe('turnShapeMinimumImpactObservedBoth assertion', () => {
  const assertion = {
    kind: 'turnShapeMinimumImpactObservedBoth',
    evaluatorId: 'impact',
    windowMinDecisions: 2,
  } as const;

  it('passes when ready evaluator traces include true and false minimum-impact outcomes', () => {
    const outcome = evaluateTurnShapeMinimumImpactObserved({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithImpact(true) }),
        match({ trace: traceWithImpact(false) }),
      ],
    });

    assert.equal(outcome.kind, 'pass');
  });

  it('fails when the evaluator is constant across the window', () => {
    const outcome = evaluateTurnShapeMinimumImpactObserved({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [
        match({ trace: traceWithImpact(true) }),
        match({ trace: traceWithImpact(true) }),
      ],
    });

    assert.equal(outcome.kind, 'fail');
  });

  it('errors when the aggregate window is too small', () => {
    const outcome = evaluateTurnShapeMinimumImpactObserved({
      assertion,
      probe: testProbe(assertion, 'every'),
      matches: [match({ trace: traceWithImpact(true) })],
    });

    assert.equal(outcome.kind, 'error');
  });
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
