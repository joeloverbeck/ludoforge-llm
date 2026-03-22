import type { ActionId } from './branded.js';
import type { EffectAST, GameDef } from './types.js';

export function effectTreeMayYieldIncompleteMove(effects: readonly EffectAST[]): boolean {
  for (const effect of effects) {
    if ('chooseOne' in effect || 'chooseN' in effect || 'rollRandom' in effect) {
      return true;
    }
    if ('if' in effect) {
      if (
        effectTreeMayYieldIncompleteMove(effect.if.then)
        || (effect.if.else !== undefined && effectTreeMayYieldIncompleteMove(effect.if.else))
      ) {
        return true;
      }
      continue;
    }
    if ('forEach' in effect) {
      if (
        effectTreeMayYieldIncompleteMove(effect.forEach.effects)
        || (effect.forEach.in !== undefined && effectTreeMayYieldIncompleteMove(effect.forEach.in))
      ) {
        return true;
      }
      continue;
    }
    if ('reduce' in effect && effectTreeMayYieldIncompleteMove(effect.reduce.in)) {
      return true;
    }
    if (
      'removeByPriority' in effect
      && effect.removeByPriority.in !== undefined
      && effectTreeMayYieldIncompleteMove(effect.removeByPriority.in)
    ) {
      return true;
    }
    if ('let' in effect && effectTreeMayYieldIncompleteMove(effect.let.in)) {
      return true;
    }
    if (
      'evaluateSubset' in effect
      && (
        effectTreeMayYieldIncompleteMove(effect.evaluateSubset.compute)
        || effectTreeMayYieldIncompleteMove(effect.evaluateSubset.in)
      )
    ) {
      return true;
    }
  }
  return false;
}

export function computeAlwaysCompleteActionIds(def: GameDef): ReadonlySet<ActionId> {
  const pipelineActionIds = new Set((def.actionPipelines ?? []).map((pipeline) => pipeline.actionId));
  const alwaysCompleteActionIds = new Set<ActionId>();

  for (const action of def.actions) {
    if (action.params.length > 0) {
      continue;
    }
    if (pipelineActionIds.has(action.id)) {
      continue;
    }
    if (effectTreeMayYieldIncompleteMove(action.cost) || effectTreeMayYieldIncompleteMove(action.effects)) {
      continue;
    }
    alwaysCompleteActionIds.add(action.id);
  }

  return alwaysCompleteActionIds;
}
