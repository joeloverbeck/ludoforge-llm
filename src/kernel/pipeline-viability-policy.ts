import {
  evalActionPipelinePredicate,
  evalActionPipelinePredicateForDiscovery,
  type DiscoveryPredicateState,
} from './action-pipeline-predicates.js';
import { toApplyMoveIllegalMetadataCode, type ApplyMoveIllegalMetadataCode } from './legality-outcome.js';
import type { EvalContext } from './eval-context.js';
import type { ActionDef, ActionPipelineDef } from './types.js';

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

export type ApplyMovePipelineDecision =
  | {
      readonly kind: 'allowExecution';
      readonly costValidationPassed: boolean;
    }
  | {
      readonly kind: 'illegalMove';
      readonly costValidationPassed: boolean;
      readonly outcome: PipelineViabilityOutcome;
      readonly metadataCode: ApplyMoveIllegalMetadataCode | 'OPERATION_COST_BLOCKED';
    };

export type LegalChoicesPipelineDecision =
  | { readonly kind: 'allowChoiceResolution' }
  | { readonly kind: 'illegalChoice'; readonly outcome: 'pipelineLegalityFailed' };

export type LegalMovesPipelineDecision =
  | { readonly kind: 'includeTemplate' }
  | { readonly kind: 'excludeTemplate'; readonly outcome: PipelineViabilityOutcome };

export const evaluatePipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): PipelinePredicateStatus => {
  const legalityPassed = pipeline.legality === null
    ? true
    : evalActionPipelinePredicate(action, pipeline.id, 'legality', pipeline.legality, evalCtx);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidationPassed = !includeCostValidation || pipeline.costValidation === null
    ? true
    : evalActionPipelinePredicate(action, pipeline.id, 'costValidation', pipeline.costValidation, evalCtx);
  return {
    legalityPassed,
    costValidationPassed,
    atomicity: pipeline.atomicity,
  };
};

const evalDiscoveryPredicate = (
  action: ActionDef,
  profileId: string,
  predicate: 'legality' | 'costValidation',
  condition: ActionPipelineDef['legality'],
  evalCtx: EvalContext,
): DiscoveryPredicateState => {
  if (condition === null) {
    return 'passed';
  }
  return evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx);
};

export const evaluateDiscoveryPipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: EvalContext,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus => {
  const legality = evalDiscoveryPredicate(action, pipeline.id, 'legality', pipeline.legality, evalCtx);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidation = !includeCostValidation
    ? 'passed'
    : evalDiscoveryPredicate(action, pipeline.id, 'costValidation', pipeline.costValidation, evalCtx);
  return {
    legality,
    costValidation,
    atomicity: pipeline.atomicity,
  };
};

export const decideLegalMovesPipelineViability = (status: PipelinePredicateStatus): LegalMovesPipelineDecision => {
  if (!status.legalityPassed) {
    return { kind: 'excludeTemplate', outcome: 'pipelineLegalityFailed' };
  }
  if (status.atomicity === 'atomic' && !status.costValidationPassed) {
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
    return { kind: 'illegalChoice', outcome: 'pipelineLegalityFailed' };
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
      metadataCode: 'OPERATION_COST_BLOCKED',
    };
  }
  return {
    kind: 'allowExecution',
    costValidationPassed: options?.isFreeOperation === true ? true : status.costValidationPassed,
  };
};
