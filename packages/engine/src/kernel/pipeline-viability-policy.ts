import {
  evalActionPipelinePredicate,
  evalActionPipelinePredicateForDiscovery,
  type DiscoveryPredicateState,
} from './action-pipeline-predicates.js';
import { getCompiledPipelinePredicates } from './compiled-condition-cache.js';
import { toApplyMoveIllegalMetadataCode, type ApplyMoveIllegalMetadataCode } from './legality-outcome.js';
import type { EnumerationStateSnapshot } from './enumeration-snapshot.js';
import type { ReadContext } from './eval-context.js';
import { MISSING_BINDING_POLICY_CONTEXTS, classifyMissingBindingProbeError } from './missing-binding-policy.js';
import { resolveProbeResult, type ProbeResult } from './probe-result.js';
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

interface PipelinePredicateEvaluationOptions {
  readonly includeCostValidation?: boolean;
  readonly snapshot?: EnumerationStateSnapshot | undefined;
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

const evaluateCompiledPredicate = (
  condition: Exclude<ConditionAST, boolean>,
  evalCtx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): boolean | undefined => {
  const compiled = getCompiledPipelinePredicates(evalCtx.def).get(condition);
  if (compiled === undefined) {
    return undefined;
  }
  return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings, snapshot);
};

const evaluatePredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST | null | undefined,
  evalCtx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): boolean => {
  if (condition == null) {
    return true;
  }
  if (typeof condition === 'boolean') {
    return condition;
  }

  try {
    const compiledResult = evaluateCompiledPredicate(condition, evalCtx, snapshot);
    if (compiledResult !== undefined) {
      return compiledResult;
    }
  } catch (error) {
    throw pipelinePredicateEvaluationError(action, profileId, predicate, error);
  }

  return evalActionPipelinePredicate(action, profileId, predicate, condition, evalCtx);
};

const evaluateCompiledDiscoveryPredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: Exclude<ConditionAST, boolean>,
  evalCtx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): ProbeResult<boolean | undefined> => {
  try {
    return {
      outcome: 'legal',
      value: evaluateCompiledPredicate(condition, evalCtx, snapshot),
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

const evaluateDiscoveryPredicate = (
  action: ActionDef,
  profileId: string,
  predicate: PipelinePredicateName,
  condition: ConditionAST | null | undefined,
  evalCtx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): DiscoveryPredicateState => {
  if (condition == null) {
    return 'passed';
  }
  if (typeof condition === 'boolean') {
    return condition ? 'passed' : 'failed';
  }

  const compiledResult = evaluateCompiledDiscoveryPredicate(action, profileId, predicate, condition, evalCtx, snapshot);
  return resolveProbeResult(compiledResult, {
    onLegal: (value) => value !== undefined
      ? (value ? 'passed' : 'failed')
      : evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx),
    onIllegal: () => evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx),
    onInconclusive: () => 'deferred',
  });
};

const evaluateCheckpointPredicateStatus = (
  action: ActionDef,
  profileId: string,
  checkpoint: PredicateCheckpoint,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: PipelinePredicateEvaluationOptions,
): PipelinePredicateStatus => {
  const legalityPassed = evaluatePredicate(action, profileId, 'legality', checkpoint.legality, evalCtx, options?.snapshot);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidationPassed = !includeCostValidation || checkpoint.costValidation == null
    ? true
    : evaluatePredicate(action, profileId, 'costValidation', checkpoint.costValidation, evalCtx, options?.snapshot);
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
  options?: PipelinePredicateEvaluationOptions,
): DiscoveryPipelinePredicateStatus => {
  const legality = evaluateDiscoveryPredicate(action, profileId, 'legality', checkpoint.legality, evalCtx, options?.snapshot);
  const includeCostValidation = options?.includeCostValidation ?? true;
  const costValidation = !includeCostValidation
    ? 'passed'
    : evaluateDiscoveryPredicate(action, profileId, 'costValidation', checkpoint.costValidation, evalCtx, options?.snapshot);
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
  options?: PipelinePredicateEvaluationOptions,
): PipelinePredicateStatus =>
  evaluateCheckpointPredicateStatus(action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options);

export const evaluateStagePredicateStatus = (
  action: ActionDef,
  profileId: string,
  stage: ActionResolutionStageDef,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: PipelinePredicateEvaluationOptions,
): PipelinePredicateStatus =>
  evaluateCheckpointPredicateStatus(action, profileId, stage, atomicity, evalCtx, options);

export const evaluateDiscoveryPipelinePredicateStatus = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: ReadContext,
  options?: PipelinePredicateEvaluationOptions,
): DiscoveryPipelinePredicateStatus =>
  evaluateDiscoveryCheckpointPredicateStatus(action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options);

export const evaluateDiscoveryStagePredicateStatus = (
  action: ActionDef,
  profileId: string,
  stage: ActionResolutionStageDef,
  atomicity: ActionPipelineDef['atomicity'],
  evalCtx: ReadContext,
  options?: PipelinePredicateEvaluationOptions,
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
