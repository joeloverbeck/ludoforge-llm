// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildTurnShapeTrace } from '../../../src/agents/policy-turn-shape-trace.js';
import type { AgentPolicyCatalog } from '../../../src/kernel/types.js';

const catalog = {
  compiled: {
    turnShapeEvaluators: {},
  },
} as unknown as AgentPolicyCatalog;

const result = (index: number) => ({
  evaluatorId: `impact${index}`,
  objectives: [{ id: 'standing', value: index }],
  minimumImpactSatisfied: index % 2 === 0,
  previewStatus: 'ready' as const,
});

const entries = () => [1, 2, 3, 4, 5, 6].map(result);

describe('turn-shape trace caps', () => {
  it('caps summary mode at two evaluator entries', () => {
    const trace = buildTurnShapeTrace({
      catalog,
      traceLevel: 'summary',
      results: entries(),
    });

    assert.equal(trace?.evaluators.length, 2);
  });

  it('lifts verbose mode to the established top-K budget and emits full debug trace', () => {
    const verbose = buildTurnShapeTrace({
      catalog,
      traceLevel: 'verbose',
      results: entries(),
    });
    const debug = buildTurnShapeTrace({
      catalog,
      traceLevel: 'debug',
      results: entries(),
    });

    assert.equal(verbose?.evaluators.length, 5);
    assert.equal(debug?.evaluators.length, 6);
  });

  it('omits the trace block when no evaluators ran', () => {
    const trace = buildTurnShapeTrace({
      catalog,
      traceLevel: 'summary',
      results: [],
    });

    assert.equal(trace, undefined);
  });
});
