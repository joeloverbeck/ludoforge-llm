import type {
  AgentPolicyCatalog,
  PolicyTurnShapeTrace,
} from '../kernel/types.js';
import type { TurnShapeEvaluatorResult } from './turn-shape-eval.js';

export type TurnShapeTraceLevel = 'summary' | 'verbose' | 'debug';

const TURNSHAPE_TRACE_SUMMARY_CAP = 2;
const TURNSHAPE_TRACE_VERBOSE_CAP = 5;

export function buildTurnShapeTrace(input: {
  readonly results: Iterable<TurnShapeEvaluatorResult>;
  readonly catalog: AgentPolicyCatalog;
  readonly traceLevel?: TurnShapeTraceLevel;
}): PolicyTurnShapeTrace | undefined {
  const traceLevel = input.traceLevel ?? 'summary';
  const cap = traceLevel === 'debug'
    ? Number.POSITIVE_INFINITY
    : traceLevel === 'verbose'
      ? TURNSHAPE_TRACE_VERBOSE_CAP
      : TURNSHAPE_TRACE_SUMMARY_CAP;
  const evaluators = [...input.results]
    .map((result) => {
      const evaluator = input.catalog.compiled.turnShapeEvaluators?.[result.evaluatorId];
      return {
        id: result.evaluatorId,
        traceLabel: evaluator?.traceLabel ?? result.evaluatorId,
        minimumImpactSatisfied: result.minimumImpactSatisfied,
        previewStatus: result.previewStatus,
        objectives: result.objectives.map((objective) => ({
          id: objective.id,
          ...(objective.value === undefined ? {} : { value: objective.value }),
          ...(objective.delta === undefined ? {} : { delta: objective.delta }),
        })),
      };
    })
    .sort(compareTurnShapeEvaluatorEntries)
    .slice(0, cap);

  return evaluators.length === 0 ? undefined : { evaluators };
}

function compareTurnShapeEvaluatorEntries(
  left: PolicyTurnShapeTrace['evaluators'][number],
  right: PolicyTurnShapeTrace['evaluators'][number],
): number {
  if (left.minimumImpactSatisfied !== right.minimumImpactSatisfied) {
    return left.minimumImpactSatisfied ? -1 : 1;
  }
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}
