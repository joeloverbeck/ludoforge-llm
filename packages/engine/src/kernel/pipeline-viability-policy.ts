import {
  evalActionPipelinePredicate,
  evalActionPipelinePredicateForDiscovery,
  type DiscoveryPredicateState,
} from './action-pipeline-predicates.js';
import { getCompiledPipelinePredicates } from './compiled-condition-cache.js';
import { toApplyMoveIllegalMetadataCode, type ApplyMoveIllegalMetadataCode } from './legality-outcome.js';
import type { ReadContext } from './eval-context.js';
import { MISSING_BINDING_POLICY_CONTEXTS, shouldDeferMissingBinding } from './missing-binding-policy.js';
import { pipelinePredicateEvaluationError } from './runtime-error.js';
import type { ActionDef, ActionPipelineDef, ActionResolutionStageDef, ConditionAST } from './types.js';

export type PipelineViabilityOutcome =
  | 'pipelineLegalityFailed'
  | 'pipelineAtomicCostValidationFailed';

export interface PipelinePredicateStatus {
  readonly legalityPassed: boolean;
  readonly costValidationPassed: boolean;
  readonly atomicity: ActionPipelineDef['atomicity'];
}

export interface DiscoveryPipelinePredicateStatus {
  readonly legality: DiscoveryPredicateState;
  readonly costValidation: DiscoveryPredicateState;
  readonly atomicity: ActionPipelineDef['atomicity'];
}

interface PredicateCheckpoint {
  readonly legality?: ConditionAST | null;
  readonly costValidation?: ConditionAST | null;
}

type PipelinePredicateName = 'legality' | 'costValidation';

export type ApplyMovePipelineDecision =
  | {
      readonly kind: 'allowExecution';
      readonly costValidationPassed: boolean;
    }
  | {
      readonly kind: 'illegalMove';
      readonly costValidationPassed: boolean;
      readonly outcome: PipelineViabilityOutcome;
      readonly metadataCode: ApplyMoveIllegalMetadataCode;
    };

export type LegalChoicesPipelineDecision =
  | { readonly kind: 'allowChoiceResolution' }
  | { readonly kind: 'illegalChoice'; readonly outcome: PipelineViabilityOutcome };

export type LegalMovesPipelineDecision =
  | { readonly kind: 'includeTemplate' }
  | { readonly kind: 'excludeTemplate'; readonly outcome: PipelineViabilityOutcome };

const evaluateCompiledPredicate = (
  condition: Exclude<ConditionAST, boolean>,
  evalCtx: ReadContext,
): boolean | undefined => {
  const compiled = getCompiledPipelinePredicates(evalCtx.def).get(condition);
  if (compiled === undefined) {
    return undefined;
  }
  return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings);
};

const evaluatePredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST | null | undefined,
  evalCtx: ReadContext,
): boolean => {
  if (condition == null) {
    return true;
  }
  if (typeof condition === 'boolean') {
    return condition;
  }

  try {
    const compiledResult = evaluateCompiledPredicate(condition, evalCtx);
    if (compiledResult !== undefined) {
      return compiledResult;
    }
  } catch (error) {
    throw pipelinePredicateEvaluationError(action, profileId, predicate, error);
  }

  return evalActionPipelinePredicate(action, profileId, predicate, condition, evalCtx);
};

const evaluateDiscoveryPredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST | null | undefined,
  evalCtx: ReadContext,
): DiscoveryPredicateState => {
  if (condition == null) {
    return 'passed';
  }
  if (typeof condition === 'boolean') {
    return condition ? 'passed' : 'failed';
  }

  try {
    const compiledResult = evaluateCompiledPredicate(condition, evalCtx);
    if (compiledResult !== undefined) {
      return compiledResult ? 'passed' : 'failed';
    }
  } catch (error) {
    if (shouldDeferMissingBinding(error, MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_DISCOVERY_PREDICATE)) {
      return 'deferred';
    }
    throw pipelinePredicateEvaluationError(action, profileId, predicate, error);
  }

  return evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx);
};

const evaluateCheckpointPredicateStatus = (
  action: ActionDef,
  profileId: string,
  checkpoint: PredicateCheckpoint,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus => {
  const legalityPassed = evaluatePredicate(action, profileId, 'legality', checkpoint.legality, evalCtx);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidationPassed = !includeCostValidation || checkpoint.costValidation == null
    ? true
    : evaluatePredicate(action, profileId, 'costValidation', checkpoint.costValidation, evalCtx);
  return {
    legalityPassed,
    costValidationPassed,
    atomicity,
  };
};

const evaluateDiscoveryCheckpointPredicateStatus = (
  action: ActionDef,
  profileId: string,
  checkpoint: PredicateCheckpoint,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus => {
  const legality = evaluateDiscoveryPredicate(action, profileId, 'legality', checkpoint.legality, evalCtx);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidation = !includeCostValidation
    ? 'passed'
    : evaluateDiscoveryPredicate(action, profileId, 'costValidation', checkpoint.costValidation, evalCtx);
  return {
    legality,
    costValidation,
    atomicity,
  };
};

export const evaluatePipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: ReadContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus =>
  evaluateCheckpointPredicateStatus(action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options);

export const evaluateStagePredicateStatus = (
  action: ActionDef,
  profileId: string,
  stage: ActionResolutionStageDef,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus =>
  evaluateCheckpointPredicateStatus(action, profileId, stage, atomicity, evalCtx, options);

export const evaluateDiscoveryPipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: ReadContext,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus =>
  evaluateDiscoveryCheckpointPredicateStatus(action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options);

export const evaluateDiscoveryStagePredicateStatus = (
  action: ActionDef,
  profileId: string,
  stage: ActionResolutionStageDef,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus =>
  evaluateDiscoveryCheckpointPredicateStatus(action, profileId, stage, atomicity, evalCtx, options);

export const decideLegalMovesPipelineViability = (status: PipelinePredicateStatus): LegalMovesPipelineDecision => {
  if (!status.legalityPassed) {
    return { kind: 'excludeTemplate', outcome: 'pipelineLegalityFailed' };
  }
  if (status.atomicity === 'atomic' && !status.costValidationPassed) {
    return { kind: 'excludeTemplate', outcome: 'pipelineAtomicCostValidationFailed' };
  }
  return { kind: 'includeTemplate' };
};

export const decideDiscoveryLegalMovesPipelineViability = (
  status: DiscoveryPipelinePredicateStatus,
): LegalMovesPipelineDecision => {
  if (status.legality === 'failed') {
    return { kind: 'excludeTemplate', outcome: 'pipelineLegalityFailed' };
  }
  if (status.atomicity === 'atomic' && status.costValidation === 'failed') {
    return { kind: 'excludeTemplate', outcome: 'pipelineAtomicCostValidationFailed' };
  }
  return { kind: 'includeTemplate' };
};

export const decideLegalChoicesPipelineViability = (status: PipelinePredicateStatus): LegalChoicesPipelineDecision => {
  if (!status.legalityPassed) {
    return { kind: 'illegalChoice', outcome: 'pipelineLegalityFailed' };
  }
  return { kind: 'allowChoiceResolution' };
};

export const decideDiscoveryLegalChoicesPipelineViability = (
  status: DiscoveryPipelinePredicateStatus,
): LegalChoicesPipelineDecision => {
  if (status.legality === 'failed') {
    return { kind: 'illegalChoice', outcome: 'pipelineLegalityFailed' };
  }
  if (status.atomicity === 'atomic' && status.costValidation === 'failed') {
    return { kind: 'illegalChoice', outcome: 'pipelineAtomicCostValidationFailed' };
  }
  return { kind: 'allowChoiceResolution' };
};

export const decideApplyMovePipelineViability = (
  status: PipelinePredicateStatus,
  options?: { readonly isFreeOperation?: boolean },
): ApplyMovePipelineDecision => {
  if (!status.legalityPassed) {
    return {
      kind: 'illegalMove',
      costValidationPassed: status.costValidationPassed,
      outcome: 'pipelineLegalityFailed',
      metadataCode: toApplyMoveIllegalMetadataCode('pipelineLegalityFailed'),
    };
  }
  if (status.atomicity === 'atomic' && !status.costValidationPassed && options?.isFreeOperation !== true) {
    return {
      kind: 'illegalMove',
      costValidationPassed: false,
      outcome: 'pipelineAtomicCostValidationFailed',
      metadataCode: toApplyMoveIllegalMetadataCode('pipelineAtomicCostValidationFailed'),
    };
  }
  return {
    kind: 'allowExecution',
    costValidationPassed: options?.isFreeOperation === true ? true : status.costValidationPassed,
  };
};
