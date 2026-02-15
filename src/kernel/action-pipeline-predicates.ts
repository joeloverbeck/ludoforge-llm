import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { pipelinePredicateEvaluationError } from './runtime-error.js';
import type { ActionDef, ConditionAST } from './types.js';

type PipelinePredicateName = 'legality' | 'costValidation';

export const evalActionPipelinePredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST,
  ctx: EvalContext,
): boolean => {
  try {
    return evalCondition(condition, ctx);
  } catch (error) {
    throw pipelinePredicateEvaluationError(action, profileId, predicate, error);
  }
};
