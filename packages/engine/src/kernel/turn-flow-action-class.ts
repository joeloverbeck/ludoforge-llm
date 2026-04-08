import { isTurnFlowActionClass } from '../contracts/index.js';
import { cardDrivenConfig } from './card-driven-accessors.js';
import type { GameDef, Move, TurnFlowActionClass } from './types.js';

export type ResolvedTurnFlowActionClass = TurnFlowActionClass;

const resolveMappedTurnFlowActionClass = (
  def: GameDef,
  move: Move,
): ResolvedTurnFlowActionClass | null => {
  const actionId = String(move.actionId);
  const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId[actionId];
  return typeof mapped === 'string' && isTurnFlowActionClass(mapped) ? mapped : null;
};

export const resolveTurnFlowActionClassMismatch = (
  def: GameDef,
  move: Move,
): { readonly mapped: ResolvedTurnFlowActionClass; readonly submitted: string } | null => {
  const mapped = resolveMappedTurnFlowActionClass(def, move);
  if (mapped === null || move.actionClass === undefined || move.actionClass === mapped) {
    return null;
  }
  if (
    mapped === 'operation' &&
    (move.actionClass === 'limitedOperation' || move.actionClass === 'operationPlusSpecialActivity')
  ) {
    return null;
  }
  if (mapped === 'specialActivity' && move.actionClass === 'operationPlusSpecialActivity') {
    return null;
  }
  return {
    mapped,
    submitted: move.actionClass,
  };
};

export const resolveTurnFlowActionClass = (
  def: GameDef,
  move: Move,
): ResolvedTurnFlowActionClass | null => {
  const mapped = resolveMappedTurnFlowActionClass(def, move);
  if (mapped !== null) {
    return mapped;
  }
  return typeof move.actionClass === 'string' && isTurnFlowActionClass(move.actionClass) ? move.actionClass : null;
};
