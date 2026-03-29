import type { DegeneracyFlag } from '../kernel/diagnostics.js';
import type { EvalReport, Metrics, TraceEval } from '../kernel/types.js';

const ZERO_METRICS: Metrics = {
  avgGameLength: 0,
  avgBranchingFactor: 0,
  actionDiversity: 0,
  resourceTension: 0,
  interactionProxy: 0,
  dominantActionFreq: 0,
  dramaMeasure: 0,
};

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const aggregateMetrics = (evals: readonly TraceEval[]): Metrics => {
  if (evals.length === 0) {
    return ZERO_METRICS;
  }

  return {
    avgGameLength: mean(evals.map((evaluation) => evaluation.metrics.gameLength)),
    avgBranchingFactor: mean(evals.map((evaluation) => evaluation.metrics.avgBranchingFactor)),
    actionDiversity: mean(evals.map((evaluation) => evaluation.metrics.actionDiversity)),
    resourceTension: mean(evals.map((evaluation) => evaluation.metrics.resourceTension)),
    interactionProxy: mean(evals.map((evaluation) => evaluation.metrics.interactionProxy)),
    dominantActionFreq: mean(evals.map((evaluation) => evaluation.metrics.dominantActionFreq)),
    dramaMeasure: mean(evals.map((evaluation) => evaluation.metrics.dramaMeasure)),
  };
};

const unionDegeneracyFlags = (evals: readonly TraceEval[]): readonly DegeneracyFlag[] => {
  const seen = new Set<DegeneracyFlag>();
  const flags: DegeneracyFlag[] = [];

  for (const evaluation of evals) {
    for (const flag of evaluation.degeneracyFlags) {
      if (seen.has(flag)) {
        continue;
      }
      seen.add(flag);
      flags.push(flag);
    }
  }

  return flags;
};

export const aggregateEvals = (
  gameDefId: string,
  evals: readonly TraceEval[],
): EvalReport => ({
  gameDefId,
  runCount: evals.length,
  metrics: aggregateMetrics(evals),
  degeneracyFlags: unionDegeneracyFlags(evals),
  perSeed: evals,
});
