import { getMaxEffectOps, type EffectContext, type EffectResult } from './effect-context.js';
import {
  EffectBudgetExceededError,
  EffectRuntimeError,
  effectNotImplementedError,
} from './effect-error.js';
import {
  applyChooseN,
  applyChooseOne,
  applyFlipGlobalMarker,
  applyRollRandom,
  applySetGlobalMarker,
  applySetMarker,
  applyShiftGlobalMarker,
  applyShiftMarker,
} from './effects-choice.js';
import { applyForEach, applyIf, applyLet, applyRemoveByPriority, type EffectBudgetState } from './effects-control.js';
import { applyAdvanceToPhase, applyGrantFreeOperation } from './effects-turn-flow.js';
import { applyAddVar, applySetVar } from './effects-var.js';
import {
  applyCreateToken,
  applyDestroyToken,
  applyDraw,
  applyMoveAll,
  applyMoveToken,
  applyMoveTokenAdjacent,
  applySetTokenProp,
  applyShuffle,
} from './effects-token.js';
import type { EffectAST, TriggerEvent } from './types.js';

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
  if ('setTokenProp' in effect) return 'setTokenProp';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('removeByPriority' in effect) return 'removeByPriority';
  if ('let' in effect) return 'let';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';
  if ('rollRandom' in effect) return 'rollRandom';
  if ('setMarker' in effect) return 'setMarker';
  if ('shiftMarker' in effect) return 'shiftMarker';
  if ('setGlobalMarker' in effect) return 'setGlobalMarker';
  if ('flipGlobalMarker' in effect) return 'flipGlobalMarker';
  if ('shiftGlobalMarker' in effect) return 'shiftGlobalMarker';
  if ('grantFreeOperation' in effect) return 'grantFreeOperation';
  if ('advanceToPhase' in effect) return 'advanceToPhase';

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

const dispatchEffect = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  if ('setVar' in effect) {
    return applySetVar(effect, ctx);
  }

  if ('addVar' in effect) {
    return applyAddVar(effect, ctx);
  }

  if ('moveToken' in effect) {
    return applyMoveToken(effect, ctx);
  }

  if ('moveAll' in effect) {
    return applyMoveAll(effect, ctx);
  }

  if ('moveTokenAdjacent' in effect) {
    return applyMoveTokenAdjacent(effect, ctx);
  }

  if ('draw' in effect) {
    return applyDraw(effect, ctx);
  }

  if ('shuffle' in effect) {
    return applyShuffle(effect, ctx);
  }

  if ('createToken' in effect) {
    return applyCreateToken(effect, ctx);
  }

  if ('destroyToken' in effect) {
    return applyDestroyToken(effect, ctx);
  }

  if ('setTokenProp' in effect) {
    return applySetTokenProp(effect, ctx);
  }

  if ('if' in effect) {
    return applyIf(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('forEach' in effect) {
    return applyForEach(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('removeByPriority' in effect) {
    return applyRemoveByPriority(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('let' in effect) {
    return applyLet(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('chooseOne' in effect) {
    return applyChooseOne(effect, ctx);
  }

  if ('chooseN' in effect) {
    return applyChooseN(effect, ctx);
  }

  if ('rollRandom' in effect) {
    return applyRollRandom(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('setMarker' in effect) {
    return applySetMarker(effect, ctx);
  }

  if ('shiftMarker' in effect) {
    return applyShiftMarker(effect, ctx);
  }

  if ('setGlobalMarker' in effect) {
    return applySetGlobalMarker(effect, ctx);
  }

  if ('flipGlobalMarker' in effect) {
    return applyFlipGlobalMarker(effect, ctx);
  }

  if ('shiftGlobalMarker' in effect) {
    return applyShiftGlobalMarker(effect, ctx);
  }

  if ('grantFreeOperation' in effect) {
    return applyGrantFreeOperation(effect, ctx);
  }
  if ('advanceToPhase' in effect) {
    return applyAdvanceToPhase(effect, ctx);
  }

  throw effectNotImplementedError(effectTypeOf(effect), { effect });
};

const applyEffectWithBudget = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  const effectType = effectTypeOf(effect);
  consumeBudget(budget, effectType);
  const result = dispatchEffect(effect, ctx, budget);
  return {
    state: result.state,
    rng: result.rng,
    emittedEvents: result.emittedEvents ?? [],
    bindings: result.bindings ?? ctx.bindings,
  };
};

const applyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  let currentState = ctx.state;
  let currentRng = ctx.rng;
  let currentBindings = ctx.bindings;
  const emittedEvents: TriggerEvent[] = [];

  for (const effect of effects) {
    const result = applyEffectWithBudget(effect, { ...ctx, state: currentState, rng: currentRng, bindings: currentBindings }, budget);
    currentState = result.state;
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    emittedEvents.push(...(result.emittedEvents ?? []));
  }

  return { state: currentState, rng: currentRng, emittedEvents, bindings: currentBindings };
};

export function applyEffect(effect: EffectAST, ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);
  const result = applyEffectWithBudget(effect, ctx, budget);
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
  };
}

export function applyEffects(effects: readonly EffectAST[], ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);
  const result = applyEffectsWithBudget(effects, ctx, budget);
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
  };
}
