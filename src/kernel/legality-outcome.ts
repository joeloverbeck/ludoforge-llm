import type { ChoiceIllegalReason, KernelLegalityOutcome } from './legality-reasons.js';
import { ILLEGAL_MOVE_REASONS } from './runtime-reasons.js';
import type { IllegalMoveReason } from './runtime-reasons.js';

export type ApplyMoveIllegalMetadataCode =
  | 'ACTION_PHASE_MISMATCH'
  | 'ACTION_ACTOR_NOT_APPLICABLE'
  | 'ACTION_EXECUTOR_NOT_APPLICABLE'
  | 'ACTION_LIMIT_EXCEEDED'
  | 'ACTION_PIPELINE_NOT_APPLICABLE'
  | 'OPERATION_LEGALITY_FAILED'
  | 'OPERATION_COST_BLOCKED';

export interface LegalityOutcomeProjection {
  readonly choiceReason: ChoiceIllegalReason;
  readonly applyMoveCode: ApplyMoveIllegalMetadataCode;
  readonly applyMoveReason: IllegalMoveReason;
  readonly enumerateLegalMove: boolean;
}

export const LEGALITY_OUTCOME_PROJECTIONS: Readonly<Record<KernelLegalityOutcome, LegalityOutcomeProjection>> = {
  phaseMismatch: {
    choiceReason: 'phaseMismatch',
    applyMoveCode: 'ACTION_PHASE_MISMATCH',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    enumerateLegalMove: false,
  },
  actorNotApplicable: {
    choiceReason: 'actorNotApplicable',
    applyMoveCode: 'ACTION_ACTOR_NOT_APPLICABLE',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE,
    enumerateLegalMove: false,
  },
  executorNotApplicable: {
    choiceReason: 'executorNotApplicable',
    applyMoveCode: 'ACTION_EXECUTOR_NOT_APPLICABLE',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE,
    enumerateLegalMove: false,
  },
  actionLimitExceeded: {
    choiceReason: 'actionLimitExceeded',
    applyMoveCode: 'ACTION_LIMIT_EXCEEDED',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    enumerateLegalMove: false,
  },
  pipelineNotApplicable: {
    choiceReason: 'pipelineNotApplicable',
    applyMoveCode: 'ACTION_PIPELINE_NOT_APPLICABLE',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    enumerateLegalMove: false,
  },
  pipelineLegalityFailed: {
    choiceReason: 'pipelineLegalityFailed',
    applyMoveCode: 'OPERATION_LEGALITY_FAILED',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED,
    enumerateLegalMove: false,
  },
  pipelineAtomicCostValidationFailed: {
    choiceReason: 'pipelineAtomicCostValidationFailed',
    applyMoveCode: 'OPERATION_COST_BLOCKED',
    applyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED,
    enumerateLegalMove: false,
  },
};

export const toChoiceIllegalReason = (outcome: KernelLegalityOutcome): ChoiceIllegalReason =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].choiceReason;

export const toApplyMoveIllegalMetadataCode = (outcome: KernelLegalityOutcome): ApplyMoveIllegalMetadataCode =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveCode;

export const toApplyMoveIllegalReason = (outcome: KernelLegalityOutcome): IllegalMoveReason =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveReason;

export const shouldEnumerateLegalMoveForOutcome = (outcome: KernelLegalityOutcome): boolean =>
  LEGALITY_OUTCOME_PROJECTIONS[outcome].enumerateLegalMove;
