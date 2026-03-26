import { evalValue } from './eval-value.js';
import { fromEnvAndCursor, resolveEffectBindings } from './effect-context.js';
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
  const resolvedBindings = resolveEffectBindings(env, cursor);
  const evalCursor = resolvedBindings === cursor.bindings ? cursor : { ...cursor, bindings: resolvedBindings };
  const evalCtx = fromEnvAndCursor(env, evalCursor);
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
