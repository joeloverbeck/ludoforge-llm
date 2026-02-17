import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { shouldDeferMissingBinding } from './missing-binding-policy.js';
import { pipelinePredicateEvaluationError } from './runtime-error.js';
import type { ActionDef, ConditionAST } from './types.js';

type PipelinePredicateName = 'legality' | 'costValidation';
export type DiscoveryPredicateState = 'passed' | 'failed' | 'deferred';

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

export const evalActionPipelinePredicateForDiscovery = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST,
  ctx: EvalContext,
): DiscoveryPredicateState => {
  try {
    return evalCondition(condition, ctx) ? 'passed' : 'failed';
  } catch (error) {
    if (shouldDeferMissingBinding(error, 'pipeline.discoveryPredicate')) {
      return 'deferred';
    }
    throw pipelinePredicateEvaluationError(action, profileId, predicate, error);
  }
};
