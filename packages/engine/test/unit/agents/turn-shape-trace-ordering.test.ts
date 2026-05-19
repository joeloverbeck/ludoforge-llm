// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildTurnShapeTrace } from '../../../src/agents/policy-turn-shape-trace.js';
import type { AgentPolicyCatalog } from '../../../src/kernel/types.js';

const catalog = {
  compiled: {
    turnShapeEvaluators: {
      aSatisfied: { traceLabel: 'a satisfied' },
      mUnsatisfied: { traceLabel: 'm unsatisfied' },
      zSatisfied: { traceLabel: 'z satisfied' },
    },
  },
} as unknown as AgentPolicyCatalog;

const result = (
  evaluatorId: string,
  minimumImpactSatisfied: boolean,
) => ({
  evaluatorId,
  objectives: [{ id: 'standing', delta: minimumImpactSatisfied ? 1 : 0 }],
  minimumImpactSatisfied,
  previewStatus: 'ready' as const,
});

describe('turn-shape trace ordering', () => {
  it('orders satisfied evaluators first and then by id', () => {
    const trace = buildTurnShapeTrace({
      catalog,
      traceLevel: 'debug',
      results: [
        result('mUnsatisfied', false),
        result('zSatisfied', true),
        result('aSatisfied', true),
      ],
    });

    assert.deepEqual(trace?.evaluators.map((entry) => entry.id), [
      'aSatisfied',
      'zSatisfied',
      'mUnsatisfied',
    ]);
    assert.deepEqual(trace?.evaluators[0], {
      id: 'aSatisfied',
      traceLabel: 'a satisfied',
      minimumImpactSatisfied: true,
      previewStatus: 'ready',
      objectives: [{ id: 'standing', delta: 1 }],
    });
  });
});
