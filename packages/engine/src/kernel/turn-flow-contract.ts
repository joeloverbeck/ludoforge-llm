export const TURN_FLOW_REQUIRED_KEYS = [
  'cardLifecycle',
  'eligibility',
  'actionClassByActionId',
  'optionMatrix',
  'passRewards',
  'durationWindows',
] as const;

export const TURN_FLOW_OPTIONAL_KEYS = ['freeOperationActionIds', 'monsoon', 'pivotal'] as const;

export const TURN_FLOW_ACTION_CLASS_VALUES = [
  'pass',
  'event',
  'operation',
  'limitedOperation',
  'operationPlusSpecialActivity',
] as const;

export const TURN_FLOW_DURATION_VALUES = ['turn', 'nextTurn', 'round', 'cycle'] as const;

export const TURN_FLOW_FIRST_ACTION_VALUES = ['event', 'operation', 'operationPlusSpecialActivity'] as const;

