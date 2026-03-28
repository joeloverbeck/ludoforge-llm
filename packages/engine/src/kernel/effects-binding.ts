import { evalValue } from './eval-value.js';
import type { EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';
import type { EffectAST } from './types.js';

export const applyBindValue = (
  effect: Extract<EffectAST, { readonly bindValue: unknown }>,
  _env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const value = evalValue(effect.bindValue.value, scope);
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
