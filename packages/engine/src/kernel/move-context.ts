import type { Move } from './types.js';
import type { MoveContext } from './types-core.js';

export const extractMoveContext = (move: Move): MoveContext | undefined => {
  const actionId = String(move.actionId);
  const eventSide = actionId.includes('unshaded')
    ? 'unshaded'
    : actionId.includes('shaded')
      ? 'shaded'
      : undefined;
  const currentCardId = typeof move.params['$cardId'] === 'string'
    ? move.params['$cardId']
    : typeof move.params.cardId === 'string'
      ? move.params.cardId
      : undefined;
  const turnFlowWindow = typeof move.params.__windowId === 'string'
    ? move.params.__windowId
    : undefined;

  if (eventSide === undefined && currentCardId === undefined && turnFlowWindow === undefined) {
    return undefined;
  }

  return {
    ...(currentCardId !== undefined ? { currentCardId } : {}),
    ...(eventSide !== undefined ? { eventSide } : {}),
    ...(turnFlowWindow !== undefined ? { turnFlowWindow } : {}),
  };
};
