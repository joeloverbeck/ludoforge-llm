export const TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES = [
  'emitAlways',
  'requireUsableAtIssue',
  'requireUsableForEventPlay',
] as const;

export type TurnFlowFreeOperationGrantViabilityPolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
);

export const isTurnFlowFreeOperationGrantViabilityPolicy = (
  value: string,
): value is TurnFlowFreeOperationGrantViabilityPolicy =>
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_SET.has(value);

export const TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES = [
  'required',
] as const;

export type TurnFlowFreeOperationGrantCompletionPolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES,
);

export const isTurnFlowFreeOperationGrantCompletionPolicy = (
  value: string,
): value is TurnFlowFreeOperationGrantCompletionPolicy =>
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_SET.has(value);

export const TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES = [
  'mustChangeGameplayState',
] as const;

export type TurnFlowFreeOperationGrantOutcomePolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES,
);

export const isTurnFlowFreeOperationGrantOutcomePolicy = (
  value: string,
): value is TurnFlowFreeOperationGrantOutcomePolicy =>
  TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_SET.has(value);

export const TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES = [
  'resumeCardFlow',
] as const;

export type TurnFlowFreeOperationGrantPostResolutionTurnFlow =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES,
);

export const isTurnFlowFreeOperationGrantPostResolutionTurnFlow = (
  value: string,
): value is TurnFlowFreeOperationGrantPostResolutionTurnFlow =>
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_SET.has(value);
