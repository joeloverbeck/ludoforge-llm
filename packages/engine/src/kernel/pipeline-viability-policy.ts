import {
  evalActionPipelinePredicate,
  evalActionPipelinePredicateForDiscovery,
  type DiscoveryPredicateState,
} from './action-pipeline-predicates.js';
import { toApplyMoveIllegalMetadataCode, type ApplyMoveIllegalMetadataCode } from './legality-outcome.js';
import type { EvalContext } from './eval-context.js';
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

const evaluateCheckpointPredicateStatus = (
  action: ActionDef,
  profileId: string,
  checkpoint: PredicateCheckpoint,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus => {
  const legalityPassed = checkpoint.legality == null
    ? true
    : evalActionPipelinePredicate(action, profileId, 'legality', checkpoint.legality, evalCtx);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidationPassed = !includeCostValidation || checkpoint.costValidation == null
    ? true
    : evalActionPipelinePredicate(action, profileId, 'costValidation', checkpoint.costValidation, evalCtx);
  return {
    legalityPassed,
    costValidationPassed,
    atomicity,
  };
};

const evalDiscoveryPredicate = (
  action: ActionDef,
  profileId: string,
  predicate: 'legality' | 'costValidation',
  condition: ConditionAST | null | undefined,
  evalCtx: EvalContext,
): DiscoveryPredicateState => {
  if (condition == null) {
    return 'passed';
  }
  return evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx);
};

const evaluateDiscoveryCheckpointPredicateStatus = (
  action: ActionDef,
  profileId: string,
  checkpoint: PredicateCheckpoint,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus => {
  const legality = evalDiscoveryPredicate(action, profileId, 'legality', checkpoint.legality, evalCtx);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidation = !includeCostValidation
    ? 'passed'
    : evalDiscoveryPredicate(action, profileId, 'costValidation', checkpoint.costValidation, evalCtx);
  return {
    legality,
    costValidation,
    atomicity,
  };
};

export const evaluatePipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus =>
  evaluateCheckpointPredicateStatus(action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options);

export const evaluateStagePredicateStatus = (
  action: ActionDef,
  profileId: string,
  stage: ActionResolutionStageDef,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus =>
  evaluateCheckpointPredicateStatus(action, profileId, stage, atomicity, evalCtx, options);

export const evaluateDiscoveryPipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus =>
  evaluateDiscoveryCheckpointPredicateStatus(action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options);

export const evaluateDiscoveryStagePredicateStatus = (
  action: ActionDef,
  profileId: string,
  stage: ActionResolutionStageDef,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: EvalContext,
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
