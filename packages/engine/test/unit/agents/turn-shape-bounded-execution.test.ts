// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateTurnShapeObjectives } from '../../../src/agents/turn-shape-eval.js';
import type { CompiledPolicyExpr, GameState, TurnShapeEvaluatorDef } from '../../../src/kernel/index.js';

const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

function evaluator(): TurnShapeEvaluatorDef {
  return {
    id: 'impact' as TurnShapeEvaluatorDef['id'],
    traceLabel: 'current turn impact',
    source: 'currentPreviewDrive',
    bounds: { depthCapRef: 'profile.preview.inner.depthCap', maxSyntheticDecisions: 2 },
    objectives: [{ id: 'standing' as never, value: literal(5) }],
    minimumImpact: literal(true),
    fallback: { onPreviewUnavailable: 'traceOnly' },
    costClass: 'preview',
    dependencies: {
      parameters: [],
      stateFeatures: [],
      candidateFeatures: [],
      aggregates: [],
      selectors: [],
      strategyModules: [],
      guardrails: [],
      turnShapeEvaluators: [],
      strategicConditions: [],
    },
  };
}

describe('turn-shape bounded execution', () => {
  it('does not evaluate objectives after maxSyntheticDecisions is exceeded', () => {
    let evaluations = 0;
    const result = evaluateTurnShapeObjectives({
      evaluatorId: 'impact',
      evaluator: evaluator(),
      currentState: {} as GameState,
      projectedState: { state: {} as GameState, outcome: 'ready', driveDepth: 3 },
      evaluateObjectiveExpr: () => {
        evaluations += 1;
        return 5;
      },
    });

    assert.equal(result.previewStatus, 'partial');
    assert.deepEqual(result.objectives, []);
    assert.equal(evaluations, 0);
  });
});
