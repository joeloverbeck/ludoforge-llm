import { parseDecisionKey } from './decision-scope.js';
import type { ActionPipelineDef, EffectAST, Move, MoveParamValue } from './types.js';

export const RUNTIME_RESERVED_MOVE_BINDING_NAMES = ['__freeOperation', '__actionClass'] as const;
export const DEFAULT_MOVE_ACTION_CLASS = 'operation';

export const deriveDecisionBindingsFromMoveParams = (
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  const bindings: Record<string, MoveParamValue> = {};
  for (const [paramName, paramValue] of Object.entries(moveParams)) {
    if (!paramName.startsWith('$') && !paramName.startsWith('decision:')) {
      continue;
    }
    const parsed = parseDecisionKey(paramName as Parameters<typeof parseDecisionKey>[0]);
    if (parsed !== null) {
      bindings[parsed.resolvedBind] = paramValue as MoveParamValue;
    }
  }
  return bindings;
};

const collectChoiceBindingSpecs = (effects: readonly EffectAST[]): readonly { readonly internalDecisionId: string; readonly bind: string }[] => {
  const specs: { internalDecisionId: string; bind: string }[] = [];

  const visitEffects = (nestedEffects: readonly EffectAST[]): void => {
    for (const effect of nestedEffects) {
      if ('chooseOne' in effect) {
        specs.push({
          internalDecisionId: effect.chooseOne.internalDecisionId,
          bind: effect.chooseOne.bind,
        });
        continue;
      }
      if ('chooseN' in effect) {
        specs.push({
          internalDecisionId: effect.chooseN.internalDecisionId,
          bind: effect.chooseN.bind,
        });
        continue;
      }
      if ('if' in effect) {
        visitEffects(effect.if.then);
        if (effect.if.else !== undefined) {
          visitEffects(effect.if.else);
        }
        continue;
      }
      if ('let' in effect) {
        visitEffects(effect.let.in);
        continue;
      }
      if ('forEach' in effect) {
        visitEffects(effect.forEach.effects);
        if (effect.forEach.in !== undefined) {
          visitEffects(effect.forEach.in);
        }
        continue;
      }
      if ('reduce' in effect) {
        visitEffects(effect.reduce.in);
        continue;
      }
      if ('removeByPriority' in effect) {
        if (effect.removeByPriority.in !== undefined) {
          visitEffects(effect.removeByPriority.in);
        }
        continue;
      }
      if ('evaluateSubset' in effect) {
        visitEffects(effect.evaluateSubset.compute);
        visitEffects(effect.evaluateSubset.in);
        continue;
      }
      if ('rollRandom' in effect) {
        visitEffects(effect.rollRandom.in);
      }
    }
  };

  visitEffects(effects);
  return specs;
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

export const resolvePipelineDecisionBindingsForMove = (
  pipeline: ActionPipelineDef | undefined,
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  if (pipeline === undefined) {
    return deriveDecisionBindingsFromMoveParams(moveParams);
  }

  const choiceSpecs = collectChoiceBindingSpecs([
    ...pipeline.costEffects,
    ...pipeline.stages.flatMap((stage) => stage.effects),
  ]);
  const bindByInternalDecisionId = new Map(choiceSpecs.map((spec) => [spec.internalDecisionId, spec.bind]));
  const bindings: Record<string, MoveParamValue> = {};

  for (const [paramName, paramValue] of Object.entries(moveParams)) {
    if (!paramName.startsWith('$') && !paramName.startsWith('decision:')) {
      continue;
    }
    const parsed = parseDecisionKey(paramName as Parameters<typeof parseDecisionKey>[0]);
    if (parsed !== null) {
      const bindName = bindByInternalDecisionId.get(parsed.baseId) ?? parsed.resolvedBind;
      bindings[bindName] = paramValue as MoveParamValue;
    }
  }

  return bindings;
};
