// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import { evaluateTurnShapeObjectives, turnShapePreviewStatus } from '../../../src/agents/turn-shape-eval.js';
import {
  asPlayerId,
  type CompiledPolicyExpr,
  type GameDef,
  type GameState,
  type TurnShapeEvaluatorDef,
} from '../../../src/kernel/index.js';
import { createStrategyModuleGameDef } from './strategy-module-test-fixtures.js';

const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

function contextFor(turnShape: TurnShapeEvaluatorDef): PolicyEvaluationContext {
  const base = createStrategyModuleGameDef();
  const catalog = base.agents!;
  const agents = {
    ...catalog,
    compiled: {
      ...catalog.compiled,
      turnShapeEvaluators: { impact: turnShape },
    },
  };
  const def: GameDef = { ...base, agents };
  const state = { ...base.terminal, stateHash: 1n } as unknown as GameState;
  return new PolicyEvaluationContext({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'alpha',
    catalog: agents,
    parameterValues: {},
    trustedMoveIndex: new Map(),
    previewOption: {
      resolvedRefs: new Map(),
      projectedState: {
        outcome: 'hidden',
        driveDepth: 1,
        completionPolicy: 'greedy',
        capClass: 'standard256',
      },
    },
  }, []);
}

function evaluator(overrides: Partial<TurnShapeEvaluatorDef> = {}): TurnShapeEvaluatorDef {
  return {
    id: 'impact' as TurnShapeEvaluatorDef['id'],
    traceLabel: 'current turn impact',
    source: 'currentPreviewDrive',
    bounds: { depthCapRef: 'profile.preview.inner.depthCap', maxSyntheticDecisions: 4 },
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
    ...overrides,
  };
}

describe('turn-shape preview fallback', () => {
  it('classifies missing or failed preview as unavailable without evaluating objectives', () => {
    let evaluations = 0;
    const result = evaluateTurnShapeObjectives({
      evaluatorId: 'impact',
      evaluator: evaluator(),
      currentState: {} as GameState,
      projectedState: { outcome: 'failed', driveDepth: 1 },
      evaluateObjectiveExpr: () => {
        evaluations += 1;
        return 5;
      },
    });

    assert.equal(result.previewStatus, 'unavailable');
    assert.deepEqual(result.objectives, []);
    assert.equal(evaluations, 0);
    assert.equal(turnShapePreviewStatus(undefined), 'unavailable');
  });

  it('applies demote fallback penalty when preview is unavailable', () => {
    const evaluation = contextFor(evaluator({ fallback: { onPreviewUnavailable: 'demote', demotePenalty: literal(7) } }));
    try {
      const result = evaluation.evaluatePlannedTurnShapeEvaluator('impact');
      assert.equal(result.previewStatus, 'unavailable');
      assert.equal(result.minimumImpactSatisfied, false);
      assert.equal(result.demotePenalty, 7);
    } finally {
      evaluation.dispose();
    }
  });
});
