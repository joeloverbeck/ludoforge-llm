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
] as const;

export type KernelLegalityOutcome = (typeof KERNEL_LEGALITY_OUTCOMES)[number];
export type ChoiceIllegalReason = KernelLegalityOutcome;
