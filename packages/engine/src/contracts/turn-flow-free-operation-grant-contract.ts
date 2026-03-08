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
