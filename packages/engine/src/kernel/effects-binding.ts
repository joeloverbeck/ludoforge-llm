import { evalValue } from './eval-value.js';
import { mergeToEvalContext } from './effect-context.js';
import type { EffectCursor, EffectEnv, PartialEffectResult } from './effect-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';
import type { EffectAST } from './types.js';

export const applyBindValue = (
  effect: Extract<EffectAST, { readonly bindValue: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const evalCtx = mergeToEvalContext(env, cursor);
  const value = evalValue(effect.bindValue.value, evalCtx);
  return {
    state: cursor.state,
    rng: cursor.rng,
    emittedEvents: [],
    bindings: {
      ...cursor.bindings,
      [effect.bindValue.bind]: value,
    },
  };
};
