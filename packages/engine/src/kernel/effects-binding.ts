import { evalValue } from './eval-value.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST } from './types.js';

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

export const applyBindValue = (
  effect: Extract<EffectAST, { readonly bindValue: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const value = evalValue(effect.bindValue.value, evalCtx);
  return {
    state: ctx.state,
    rng: ctx.rng,
    emittedEvents: [],
    bindings: {
      ...ctx.bindings,
      [effect.bindValue.bind]: value,
    },
  };
};
