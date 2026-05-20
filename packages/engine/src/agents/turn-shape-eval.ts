import type {
  CompiledPolicyExpr,
  GameState,
  TurnShapeEvaluatorDef,
} from '../kernel/types.js';
import type { PolicyPreviewTraceOutcome } from './policy-preview.js';
import type { PreviewOptionProjectedState } from './policy-runtime.js';
import type { PolicyValue } from './policy-surface.js';

export type TurnShapePreviewStatus = 'ready' | 'partial' | 'unavailable';

export interface TurnShapeObjectiveResult {
  readonly id: string;
  readonly value?: number;
  readonly delta?: number;
}

export interface TurnShapeEvaluatorResult {
  readonly evaluatorId: string;
  readonly objectives: readonly TurnShapeObjectiveResult[];
  readonly minimumImpactSatisfied: boolean;
  readonly previewStatus: TurnShapePreviewStatus;
  readonly demotePenalty?: number;
}

export interface TurnShapeProjection {
  readonly state?: GameState;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly driveDepth: number;
}

export interface EvaluateTurnShapeEvaluatorInput {
  readonly evaluatorId: string;
  readonly evaluator: TurnShapeEvaluatorDef;
  readonly projectedState?: TurnShapeProjection;
  readonly evaluateObjectiveExpr: (expr: CompiledPolicyExpr, state: GameState) => PolicyValue;
  readonly currentState: GameState;
}

export function turnShapePreviewStatus(
  projectedState: Pick<PreviewOptionProjectedState, 'outcome'> | TurnShapeProjection | undefined,
): TurnShapePreviewStatus {
  if (projectedState === undefined) {
    return 'unavailable';
  }
  switch (projectedState.outcome) {
    case 'ready':
    case 'stochastic':
      return 'ready';
    case 'depthCap':
    case 'postGrantCap':
    case 'freeOperationCap':
    case 'grantFlowPartial':
      return 'partial';
    default:
      return 'unavailable';
  }
}

export function evaluateTurnShapeObjectives(
  input: EvaluateTurnShapeEvaluatorInput,
): {
  readonly objectives: readonly TurnShapeObjectiveResult[];
  readonly previewStatus: TurnShapePreviewStatus;
} {
  const previewStatus = turnShapePreviewStatus(input.projectedState);
  const projectedState = input.projectedState;
  const projectedTerminalState = input.projectedState?.state;
  const exceedsSyntheticDecisionBound = projectedState !== undefined
    && projectedState.driveDepth > input.evaluator.bounds.maxSyntheticDecisions;
  if (
    previewStatus !== 'ready'
    || projectedTerminalState === undefined
    || exceedsSyntheticDecisionBound
  ) {
    return {
      objectives: [],
      previewStatus: exceedsSyntheticDecisionBound ? 'partial' : previewStatus,
    };
  }

  const objectives = input.evaluator.objectives.map((objective): TurnShapeObjectiveResult => {
    if (objective.value !== undefined) {
      const value = input.evaluateObjectiveExpr(objective.value, projectedTerminalState);
      return { id: objective.id, ...(typeof value === 'number' ? { value } : {}) };
    }
    if (objective.delta !== undefined) {
      const start = input.evaluateObjectiveExpr(objective.delta, input.currentState);
      const end = input.evaluateObjectiveExpr(objective.delta, projectedTerminalState);
      return {
        id: objective.id,
        ...(typeof start === 'number' && typeof end === 'number' ? { delta: end - start } : {}),
      };
    }
    return { id: objective.id };
  });

  return { objectives, previewStatus };
}
