import { getMaxEffectOps, type EffectContext, type EffectResult } from './effect-context.js';
import {
  EffectBudgetExceededError,
  EffectRuntimeError,
  SpatialNotImplementedError,
  effectNotImplementedError,
} from './effect-error.js';
import type { EffectAST } from './types.js';

interface EffectBudgetState {
  remaining: number;
  readonly max: number;
}

const createBudgetState = (ctx: Pick<EffectContext, 'maxEffectOps'>): EffectBudgetState => {
  const maxEffectOps = getMaxEffectOps(ctx);
  if (!Number.isInteger(maxEffectOps) || maxEffectOps < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'maxEffectOps must be a non-negative integer', { maxEffectOps });
  }

  return { remaining: maxEffectOps, max: maxEffectOps };
};

const effectTypeOf = (effect: EffectAST): string => {
  if ('setVar' in effect) return 'setVar';
  if ('addVar' in effect) return 'addVar';
  if ('moveToken' in effect) return 'moveToken';
  if ('moveAll' in effect) return 'moveAll';
  if ('moveTokenAdjacent' in effect) return 'moveTokenAdjacent';
  if ('draw' in effect) return 'draw';
  if ('shuffle' in effect) return 'shuffle';
  if ('createToken' in effect) return 'createToken';
  if ('destroyToken' in effect) return 'destroyToken';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('let' in effect) return 'let';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';

  const _exhaustive: never = effect;
  return _exhaustive;
};

const consumeBudget = (budget: EffectBudgetState, effectType: string): void => {
  if (budget.remaining <= 0) {
    throw new EffectBudgetExceededError('Effect operation budget exceeded', {
      effectType,
      maxEffectOps: budget.max,
    });
  }

  budget.remaining -= 1;
};

const dispatchEffect = (effect: EffectAST, _ctx: EffectContext): EffectResult => {
  if ('moveTokenAdjacent' in effect) {
    throw new SpatialNotImplementedError('Spatial effect is not implemented: moveTokenAdjacent', {
      effectType: 'moveTokenAdjacent',
      effect,
    });
  }

  throw effectNotImplementedError(effectTypeOf(effect), { effect });
};

const applyEffectWithBudget = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  const effectType = effectTypeOf(effect);
  consumeBudget(budget, effectType);
  return dispatchEffect(effect, ctx);
};

export function applyEffect(effect: EffectAST, ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);
  return applyEffectWithBudget(effect, ctx, budget);
}

export function applyEffects(effects: readonly EffectAST[], ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);

  let currentState = ctx.state;
  let currentRng = ctx.rng;
  for (const effect of effects) {
    const result = applyEffectWithBudget(effect, { ...ctx, state: currentState, rng: currentRng }, budget);
    currentState = result.state;
    currentRng = result.rng;
  }

  return { state: currentState, rng: currentRng };
}
