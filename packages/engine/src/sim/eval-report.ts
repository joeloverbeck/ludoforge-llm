import type { GameTrace, EvalReport } from '../kernel/types.js';

import type { EvalConfig } from './eval-config.js';
import { aggregateEvals } from './aggregate-evals.js';
import { evaluateTrace } from './trace-eval.js';

export const generateEvalReport = (
  gameDefId: string,
  traces: readonly GameTrace[],
  config: EvalConfig = {},
): EvalReport => {
  const evals = traces.map((trace) => evaluateTrace(trace, config));
  return aggregateEvals(gameDefId, evals);
};
