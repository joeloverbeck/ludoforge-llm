import type { ActionApplicabilityNotApplicableReason } from './action-applicability-preflight.js';
import type { ChoiceIllegalRequest } from './types.js';

export type KernelLegalityOutcome = ActionApplicabilityNotApplicableReason | 'pipelineLegalityFailed';

export type ApplyMoveIllegalMetadataCode =
  | 'ACTION_PHASE_MISMATCH'
  | 'ACTION_ACTOR_NOT_APPLICABLE'
  | 'ACTION_EXECUTOR_NOT_APPLICABLE'
  | 'ACTION_LIMIT_EXCEEDED'
  | 'ACTION_PIPELINE_NOT_APPLICABLE'
  | 'OPERATION_LEGALITY_FAILED';

const CHOICE_REASON_BY_OUTCOME: Readonly<Record<KernelLegalityOutcome, ChoiceIllegalRequest['reason']>> = {
  phaseMismatch: 'phaseMismatch',
  actorNotApplicable: 'actorNotApplicable',
  executorNotApplicable: 'executorNotApplicable',
  actionLimitExceeded: 'actionLimitExceeded',
  pipelineNotApplicable: 'pipelineNotApplicable',
  pipelineLegalityFailed: 'pipelineLegalityFailed',
};

const APPLY_MOVE_CODE_BY_OUTCOME: Readonly<Record<KernelLegalityOutcome, ApplyMoveIllegalMetadataCode>> = {
  phaseMismatch: 'ACTION_PHASE_MISMATCH',
  actorNotApplicable: 'ACTION_ACTOR_NOT_APPLICABLE',
  executorNotApplicable: 'ACTION_EXECUTOR_NOT_APPLICABLE',
  actionLimitExceeded: 'ACTION_LIMIT_EXCEEDED',
  pipelineNotApplicable: 'ACTION_PIPELINE_NOT_APPLICABLE',
  pipelineLegalityFailed: 'OPERATION_LEGALITY_FAILED',
};

export const toChoiceIllegalReason = (outcome: KernelLegalityOutcome): ChoiceIllegalRequest['reason'] =>
  CHOICE_REASON_BY_OUTCOME[outcome];

export const toApplyMoveIllegalMetadataCode = (outcome: KernelLegalityOutcome): ApplyMoveIllegalMetadataCode =>
  APPLY_MOVE_CODE_BY_OUTCOME[outcome];

export const shouldEnumerateLegalMoveForOutcome = (_outcome: KernelLegalityOutcome): boolean => false;
