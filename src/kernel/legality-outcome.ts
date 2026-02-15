import type { ChoiceIllegalReason, KernelLegalityOutcome } from './legality-reasons.js';

export type ApplyMoveIllegalMetadataCode =
  | 'ACTION_PHASE_MISMATCH'
  | 'ACTION_ACTOR_NOT_APPLICABLE'
  | 'ACTION_EXECUTOR_NOT_APPLICABLE'
  | 'ACTION_LIMIT_EXCEEDED'
  | 'ACTION_PIPELINE_NOT_APPLICABLE'
  | 'OPERATION_LEGALITY_FAILED';

export interface LegalityOutcomeProjection {
  readonly choiceReason: ChoiceIllegalReason;
  readonly applyMoveCode: ApplyMoveIllegalMetadataCode;
  readonly enumerateLegalMove: boolean;
}

export const LEGALITY_OUTCOME_PROJECTIONS: Readonly<Record<KernelLegalityOutcome, LegalityOutcomeProjection>> = {
  phaseMismatch: {
    choiceReason: 'phaseMismatch',
    applyMoveCode: 'ACTION_PHASE_MISMATCH',
    enumerateLegalMove: false,
  },
  actorNotApplicable: {
    choiceReason: 'actorNotApplicable',
    applyMoveCode: 'ACTION_ACTOR_NOT_APPLICABLE',
    enumerateLegalMove: false,
  },
  executorNotApplicable: {
    choiceReason: 'executorNotApplicable',
    applyMoveCode: 'ACTION_EXECUTOR_NOT_APPLICABLE',
    enumerateLegalMove: false,
  },
  actionLimitExceeded: {
    choiceReason: 'actionLimitExceeded',
    applyMoveCode: 'ACTION_LIMIT_EXCEEDED',
    enumerateLegalMove: false,
  },
  pipelineNotApplicable: {
    choiceReason: 'pipelineNotApplicable',
    applyMoveCode: 'ACTION_PIPELINE_NOT_APPLICABLE',
    enumerateLegalMove: false,
  },
  pipelineLegalityFailed: {
    choiceReason: 'pipelineLegalityFailed',
    applyMoveCode: 'OPERATION_LEGALITY_FAILED',
    enumerateLegalMove: false,
  },
};

export const toChoiceIllegalReason = (outcome: KernelLegalityOutcome): ChoiceIllegalReason =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].choiceReason;

export const toApplyMoveIllegalMetadataCode = (outcome: KernelLegalityOutcome): ApplyMoveIllegalMetadataCode =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveCode;

export const shouldEnumerateLegalMoveForOutcome = (outcome: KernelLegalityOutcome): boolean =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].enumerateLegalMove;
