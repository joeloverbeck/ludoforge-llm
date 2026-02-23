import { resolveTurnFlowActionClass } from './turn-flow-eligibility.js';
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
    parts.push(resolveTurnFlowActionClass(def, move) ?? unresolvedActionClassSentinel);
  }
  return parts.join('|');
};
