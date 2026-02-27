export const ACTION_APPLICABILITY_NOT_APPLICABLE_REASONS = [
  'phaseMismatch',
  'actorNotApplicable',
  'executorNotApplicable',
  'actionLimitExceeded',
  'pipelineNotApplicable',
] as const;

export type ActionApplicabilityNotApplicableReason = (typeof ACTION_APPLICABILITY_NOT_APPLICABLE_REASONS)[number];

export const KERNEL_LEGALITY_OUTCOMES = [
  ...ACTION_APPLICABILITY_NOT_APPLICABLE_REASONS,
  'pipelineLegalityFailed',
  'pipelineAtomicCostValidationFailed',
] as const;

export type KernelLegalityOutcome = (typeof KERNEL_LEGALITY_OUTCOMES)[number];

export const FREE_OPERATION_CHOICE_ILLEGAL_REASONS = [
  'freeOperationNoActiveSeatGrant',
  'freeOperationSequenceLocked',
  'freeOperationActionClassMismatch',
  'freeOperationActionIdMismatch',
  'freeOperationZoneFilterMismatch',
] as const;

export type FreeOperationChoiceIllegalReason = (typeof FREE_OPERATION_CHOICE_ILLEGAL_REASONS)[number];
export type ChoiceIllegalReason = KernelLegalityOutcome | FreeOperationChoiceIllegalReason;
