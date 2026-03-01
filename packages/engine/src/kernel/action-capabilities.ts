import type { ActionDef, GameDef, Move } from './types.js';
import { ACTION_CAPABILITY_CARD_EVENT } from '../contracts/index.js';

const normalizeCapability = (capability: string): string => capability.normalize('NFC');

export const hasActionCapability = (action: ActionDef, capability: string): boolean => {
  const actionCapabilities = action.capabilities;
  if (actionCapabilities === undefined || actionCapabilities.length === 0) {
    return false;
  }
  const normalizedCapability = normalizeCapability(capability);
  return actionCapabilities.some((entry) => normalizeCapability(entry) === normalizedCapability);
};

export const isCardEventAction = (action: ActionDef): boolean =>
  hasActionCapability(action, ACTION_CAPABILITY_CARD_EVENT);

export const findActionById = (def: GameDef, actionId: Move['actionId']): ActionDef | undefined =>
  def.actions.find((action) => action.id === actionId);

export const isCardEventActionId = (def: GameDef, actionId: Move['actionId']): boolean => {
  const action = findActionById(def, actionId);
  return action !== undefined && isCardEventAction(action);
};

export const isCardEventMove = (def: GameDef, move: Move): boolean =>
  isCardEventActionId(def, move.actionId);

export const cardEventActionIds = (def: GameDef): readonly string[] =>
  def.actions.filter((action) => isCardEventAction(action)).map((action) => String(action.id));
