// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import { evaluateTurnShapeObjectives } from '../../../src/agents/turn-shape-eval.js';
import {
  asPlayerId,
  type CompiledPolicyExpr,
  type GameDef,
  type GameState,
  type TurnShapeEvaluatorDef,
} from '../../../src/kernel/index.js';
import { createStrategyModuleGameDef } from './strategy-module-test-fixtures.js';

const emptyDependencies = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  selectors: [],
  strategyModules: [],
  guardrails: [],
  turnShapeEvaluators: [],
  strategicConditions: [],
};

const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

const turnShapeRef = (
  field: Extract<CompiledPolicyExpr, { readonly kind: 'ref' }>['ref'],
): CompiledPolicyExpr => ({ kind: 'ref', ref: field });

function evaluator(overrides: Partial<TurnShapeEvaluatorDef> = {}): TurnShapeEvaluatorDef {
  return {
    id: 'impact' as TurnShapeEvaluatorDef['id'],
    traceLabel: 'current turn impact',
    source: 'currentPreviewDrive',
    bounds: { depthCapRef: 'profile.preview.inner.depthCap', maxSyntheticDecisions: 4 },
    objectives: [{ id: 'standing' as never, value: literal(5) }],
    minimumImpact: {
      kind: 'op',
      op: 'gt',
      args: [
        turnShapeRef({
          kind: 'turnShape',
          evaluatorId: 'impact',
          field: { kind: 'objective.value', objectiveId: 'standing' },
        }),
        literal(3),
      ],
    },
    fallback: { onPreviewUnavailable: 'traceOnly' },
    costClass: 'preview',
    dependencies: emptyDependencies,
    ...overrides,
  };
}

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
    cacheBinding: { kind: 'isolated' },
    previewOption: {
      resolvedRefs: new Map(),
      projectedState: {
        state,
        outcome: 'ready',
        driveDepth: 1,
        completionPolicy: 'greedy',
        capClass: 'standard256',
      },
    },
  }, []);
}

describe('turn-shape evaluator runtime', () => {
  it('computes objective values and exposes minimumImpactSatisfied refs', () => {
    const evaluation = contextFor(evaluator());
    try {
      assert.equal(evaluation.evaluateCompiledExpr(turnShapeRef({
        kind: 'turnShape',
        evaluatorId: 'impact',
        field: { kind: 'objective.value', objectiveId: 'standing' },
      }), undefined), 5);
      assert.equal(evaluation.evaluateCompiledExpr(turnShapeRef({
        kind: 'turnShape',
        evaluatorId: 'impact',
        field: 'minimumImpactSatisfied',
      }), undefined), true);
      assert.equal(evaluation.evaluateCompiledExpr(turnShapeRef({
        kind: 'turnShape',
        evaluatorId: 'impact',
        field: 'previewStatus',
      }), undefined), 'ready');
    } finally {
      evaluation.dispose();
    }
  });

  it('computes deltas against the chain terminal state', () => {
    const currentState = { globalVars: { standing: 2 } } as unknown as GameState;
    const projectedState = { globalVars: { standing: 7 } } as unknown as GameState;
    const result = evaluateTurnShapeObjectives({
      evaluatorId: 'impact',
      evaluator: evaluator({
        objectives: [{ id: 'standing' as never, delta: literal(0) }],
      }),
      currentState,
      projectedState: { state: projectedState, outcome: 'ready', driveDepth: 1 },
      evaluateObjectiveExpr: (_expr, state) => (state as unknown as { globalVars: { standing: number } }).globalVars.standing,
    });

    assert.equal(result.previewStatus, 'ready');
    assert.deepEqual(result.objectives, [{ id: 'standing', delta: 5 }]);
  });
});
