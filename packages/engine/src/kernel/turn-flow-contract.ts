import { ACTION_CAPABILITY_CARD_EVENT } from './action-capabilities.js';

export const TURN_FLOW_REQUIRED_KEYS = [
  'cardLifecycle',
  'eligibility',
  'actionClassByActionId',
  'optionMatrix',
  'passRewards',
  'durationWindows',
] as const;

export const TURN_FLOW_OPTIONAL_KEYS = ['freeOperationActionIds', 'monsoon', 'pivotal', 'cardSeatOrderMetadataKey', 'cardSeatOrderMapping'] as const;

export const TURN_FLOW_ACTION_CLASS_VALUES = [
  'pass',
  'event',
  'operation',
  'limitedOperation',
  'operationPlusSpecialActivity',
] as const;

export const TURN_FLOW_DURATION_VALUES = ['turn', 'nextTurn', 'round', 'cycle'] as const;

export const TURN_FLOW_FIRST_ACTION_VALUES = ['event', 'operation', 'operationPlusSpecialActivity'] as const;

export type TurnFlowActionClass = (typeof TURN_FLOW_ACTION_CLASS_VALUES)[number];

export interface TurnFlowSemanticActionDescriptor {
  readonly id: string;
  readonly capabilities?: readonly string[];
}

export interface TurnFlowActionClassRequirement {
  readonly actionId: string;
  readonly requiredClass: TurnFlowActionClass;
  readonly reason: 'passAction' | 'cardEventAction' | 'pivotalAction';
}

export interface CardDrivenTurnFlowSemanticRequirements {
  readonly classRequirements: readonly TurnFlowActionClassRequirement[];
}

export function buildCardDrivenTurnFlowSemanticRequirements(
  actions: readonly TurnFlowSemanticActionDescriptor[],
  options?: {
    readonly pivotalActionIds?: readonly string[];
  },
): CardDrivenTurnFlowSemanticRequirements {
  const classRequirements = new Map<string, TurnFlowActionClassRequirement>();

  const passAction = actions.find((action) => action.id === 'pass');
  if (passAction !== undefined) {
    classRequirements.set(passAction.id, {
      actionId: passAction.id,
      requiredClass: 'pass',
      reason: 'passAction',
    });
  }

  for (const action of actions) {
    if (action.capabilities?.includes(ACTION_CAPABILITY_CARD_EVENT) !== true) {
      continue;
    }
    classRequirements.set(action.id, {
      actionId: action.id,
      requiredClass: 'event',
      reason: 'cardEventAction',
    });
  }

  for (const actionId of options?.pivotalActionIds ?? []) {
    if (actionId.trim() === '') {
      continue;
    }
    classRequirements.set(actionId, {
      actionId,
      requiredClass: 'event',
      reason: 'pivotalAction',
    });
  }

  return {
    classRequirements: [...classRequirements.values()],
  };
}
