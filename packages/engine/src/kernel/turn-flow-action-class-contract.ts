export const TURN_FLOW_ACTION_CLASS_VALUES = [
  'pass',
  'event',
  'operation',
  'limitedOperation',
  'operationPlusSpecialActivity',
] as const;

export type TurnFlowActionClass = (typeof TURN_FLOW_ACTION_CLASS_VALUES)[number];

const TURN_FLOW_ACTION_CLASS_SET = new Set<string>(TURN_FLOW_ACTION_CLASS_VALUES);

export const isTurnFlowActionClass = (value: string): value is TurnFlowActionClass =>
  TURN_FLOW_ACTION_CLASS_SET.has(value);
