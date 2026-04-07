import { evalCondition } from './eval-condition.js';
import type { ReadContext } from './eval-context.js';
import { MISSING_BINDING_POLICY_CONTEXTS, classifyMissingBindingProbeError } from './missing-binding-policy.js';
import { resolveProbeResult, type ProbeResult } from './probe-result.js';
import { pipelinePredicateEvaluationError } from './runtime-error.js';
import type { ActionDef, ConditionAST } from './types.js';

type PipelinePredicateName = 'legality' | 'costValidation';
export type DiscoveryPredicateState = 'passed' | 'failed' | 'deferred';

const probeDiscoveryPredicateEvaluation = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST,
  ctx: ReadContext,
): ProbeResult<boolean> => {
  try {
    return {
      outcome: 'legal',
      value: evalCondition(condition, ctx),
    };
  } catch (error) {
    const classified = classifyMissingBindingProbeError(
      error,
      MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_DISCOVERY_PREDICATE,
    );
    if (classified !== null) {
      return classified;
    }
    throw pipelinePredicateEvaluationError(action, profileId, predicate, error);
  }
};

export const evalActionPipelinePredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST,
  ctx: ReadContext,
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
  ctx: ReadContext,
): DiscoveryPredicateState => {
  const result = probeDiscoveryPredicateEvaluation(action, profileId, predicate, condition, ctx);
  return resolveProbeResult(result, {
    onLegal: (value) => value ? 'passed' : 'failed',
    onIllegal: () => 'failed',
    onInconclusive: () => 'deferred',
  });
};
