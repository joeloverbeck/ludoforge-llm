import { extractResolvedBindFromDecisionId } from './decision-id.js';
import type { EffectAST, Move, MoveParamValue } from './types.js';

export const RUNTIME_RESERVED_MOVE_BINDING_NAMES = ['__freeOperation', '__actionClass'] as const;
export const DEFAULT_MOVE_ACTION_CLASS = 'operation';

export const deriveDecisionBindingsFromMoveParams = (
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  const bindings: Record<string, MoveParamValue> = {};
  for (const [paramName, paramValue] of Object.entries(moveParams)) {
    const resolvedBind = extractResolvedBindFromDecisionId(paramName);
    if (resolvedBind !== null) {
      bindings[resolvedBind] = paramValue as MoveParamValue;
    }
  }
  return bindings;
};

export const collectDecisionBindingsFromEffects = (
  effects: readonly EffectAST[],
  bindings: Map<string, string>,
): void => {
  for (const effect of effects) {
    if ('chooseOne' in effect) {
      bindings.set(effect.chooseOne.internalDecisionId, effect.chooseOne.bind);
      continue;
    }
    if ('chooseN' in effect) {
      bindings.set(effect.chooseN.internalDecisionId, effect.chooseN.bind);
      continue;
    }
    if ('if' in effect) {
      collectDecisionBindingsFromEffects(effect.if.then, bindings);
      if (effect.if.else !== undefined) {
        collectDecisionBindingsFromEffects(effect.if.else, bindings);
      }
      continue;
    }
    if ('forEach' in effect) {
      collectDecisionBindingsFromEffects(effect.forEach.effects, bindings);
      if (effect.forEach.in !== undefined) {
        collectDecisionBindingsFromEffects(effect.forEach.in, bindings);
      }
      continue;
    }
    if ('removeByPriority' in effect) {
      if (effect.removeByPriority.in !== undefined) {
        collectDecisionBindingsFromEffects(effect.removeByPriority.in, bindings);
      }
      continue;
    }
    if ('let' in effect) {
      collectDecisionBindingsFromEffects(effect.let.in, bindings);
      continue;
    }
    if ('rollRandom' in effect) {
      collectDecisionBindingsFromEffects(effect.rollRandom.in, bindings);
    }
  }
};

export const buildMoveRuntimeBindings = (
  move: Move,
  decisionBindings?: Readonly<Record<string, MoveParamValue>>,
): Readonly<Record<string, MoveParamValue | boolean | string>> => ({
  ...move.params,
  ...(decisionBindings ?? deriveDecisionBindingsFromMoveParams(move.params)),
  __freeOperation: move.freeOperation ?? false,
  __actionClass: move.actionClass ?? DEFAULT_MOVE_ACTION_CLASS,
});
