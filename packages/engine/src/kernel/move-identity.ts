import { resolveTurnFlowActionClass, resolveTurnFlowActionClassMismatch } from './turn-flow-action-class.js';
import { isTurnFlowActionClass } from '../contracts/index.js';
import type { GameDef, Move } from './types.js';

export interface MoveIdentityKeyOptions {
  readonly includeFreeOperation?: boolean;
  readonly includeEffectiveActionClass?: boolean;
  readonly unresolvedActionClassSentinel?: string;
}

export const toMoveIdentityKey = (
  def: GameDef,
  move: Move,
  options?: MoveIdentityKeyOptions,
): string => {
  const includeFreeOperation = options?.includeFreeOperation ?? true;
  const includeEffectiveActionClass = options?.includeEffectiveActionClass ?? true;
  const unresolvedActionClassSentinel = options?.unresolvedActionClassSentinel ?? 'unclassified';

  const parts: string[] = [String(move.actionId), JSON.stringify(move.params)];
  if (includeFreeOperation) {
    parts.push(String(move.freeOperation === true));
  }
  if (includeEffectiveActionClass) {
    const resolvedActionClass = resolveTurnFlowActionClass(def, move);
    const identityActionClass =
      resolvedActionClass !== null
      && typeof move.actionClass === 'string'
      && isTurnFlowActionClass(move.actionClass)
      && move.actionClass !== resolvedActionClass
      && resolveTurnFlowActionClassMismatch(def, move) === null
        ? move.actionClass
        : resolvedActionClass;
    parts.push(identityActionClass ?? unresolvedActionClassSentinel);
  }
  return parts.join('|');
};
