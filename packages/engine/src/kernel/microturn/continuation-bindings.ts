import type { Move } from '../types-core.js';
import type { MoveParamScalar } from '../types-ast.js';

type ContinuationBindings = Record<string, MoveParamScalar | readonly MoveParamScalar[]>;

const isContinuationBindingKey = (key: string): boolean =>
  key.startsWith('$') || key.startsWith('decision:');

const hasOwnParam = (params: Move['params'], key: string): boolean =>
  Object.prototype.hasOwnProperty.call(params, key);

export const continuationBindingsFromMove = (move: Move): ContinuationBindings => {
  const bindings: ContinuationBindings = {};
  for (const key in move.params) {
    if (hasOwnParam(move.params, key) && isContinuationBindingKey(key)) {
      bindings[key] = move.params[key]!;
    }
  }
  return bindings;
};

export const mergeContinuationBindingsFromMove = (
  existing: ContinuationBindings | undefined,
  move: Move,
): ContinuationBindings => {
  const bindings: ContinuationBindings = { ...(existing ?? {}) };
  for (const key in move.params) {
    if (hasOwnParam(move.params, key) && isContinuationBindingKey(key)) {
      bindings[key] = move.params[key]!;
    }
  }
  return bindings;
};
