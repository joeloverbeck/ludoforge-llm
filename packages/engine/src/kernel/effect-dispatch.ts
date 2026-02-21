import { getMaxEffectOps, type EffectContext, type EffectResult } from './effect-context.js';
import {
  EffectBudgetExceededError,
  effectRuntimeError,
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
import { applyForEach, applyIf, applyLet, applyReduce, applyRemoveByPriority, type EffectBudgetState } from './effects-control.js';
import {
  applyAdvancePhase,
  applyGotoPhaseExact,
  applyGrantFreeOperation,
  applyPopInterruptPhase,
  applyPushInterruptPhase,
} from './effects-turn-flow.js';
import { applyAddVar, applySetActivePlayer, applySetVar } from './effects-var.js';
import { applyTransferVar } from './effects-resource.js';
import { applyConceal, applyReveal } from './effects-reveal.js';
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
import { applyEvaluateSubset } from './effects-subset.js';
import { applyBindValue } from './effects-binding.js';
import type { EffectAST, TriggerEvent } from './types.js';

const createBudgetState = (ctx: Pick<EffectContext, 'maxEffectOps'>): EffectBudgetState => {
  const maxEffectOps = getMaxEffectOps(ctx);
  if (!Number.isInteger(maxEffectOps) || maxEffectOps < 0) {
    throw effectRuntimeError('effectBudgetConfigInvalid', 'maxEffectOps must be a non-negative integer', { maxEffectOps });
  }

  return { remaining: maxEffectOps, max: maxEffectOps };
};

const effectTypeOf = (effect: EffectAST): string => {
  if ('setVar' in effect) return 'setVar';
  if ('setActivePlayer' in effect) return 'setActivePlayer';
  if ('addVar' in effect) return 'addVar';
  if ('transferVar' in effect) return 'transferVar';
  if ('moveToken' in effect) return 'moveToken';
  if ('moveAll' in effect) return 'moveAll';
  if ('moveTokenAdjacent' in effect) return 'moveTokenAdjacent';
  if ('draw' in effect) return 'draw';
  if ('reveal' in effect) return 'reveal';
  if ('conceal' in effect) return 'conceal';
  if ('shuffle' in effect) return 'shuffle';
  if ('createToken' in effect) return 'createToken';
  if ('destroyToken' in effect) return 'destroyToken';
  if ('setTokenProp' in effect) return 'setTokenProp';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('reduce' in effect) return 'reduce';
  if ('removeByPriority' in effect) return 'removeByPriority';
  if ('let' in effect) return 'let';
  if ('bindValue' in effect) return 'bindValue';
  if ('evaluateSubset' in effect) return 'evaluateSubset';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';
  if ('rollRandom' in effect) return 'rollRandom';
  if ('setMarker' in effect) return 'setMarker';
  if ('shiftMarker' in effect) return 'shiftMarker';
  if ('setGlobalMarker' in effect) return 'setGlobalMarker';
  if ('flipGlobalMarker' in effect) return 'flipGlobalMarker';
  if ('shiftGlobalMarker' in effect) return 'shiftGlobalMarker';
  if ('grantFreeOperation' in effect) return 'grantFreeOperation';
  if ('gotoPhaseExact' in effect) return 'gotoPhaseExact';
  if ('advancePhase' in effect) return 'advancePhase';
  if ('pushInterruptPhase' in effect) return 'pushInterruptPhase';
  if ('popInterruptPhase' in effect) return 'popInterruptPhase';

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

  if ('setActivePlayer' in effect) {
    return applySetActivePlayer(effect, ctx);
  }

  if ('addVar' in effect) {
    return applyAddVar(effect, ctx);
  }

  if ('transferVar' in effect) {
    return applyTransferVar(effect, ctx);
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

  if ('reveal' in effect) {
    return applyReveal(effect, ctx);
  }

  if ('conceal' in effect) {
    return applyConceal(effect, ctx);
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

  if ('reduce' in effect) {
    return applyReduce(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('removeByPriority' in effect) {
    return applyRemoveByPriority(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('let' in effect) {
    return applyLet(effect, ctx, budget, applyEffectsWithBudget);
  }

  if ('bindValue' in effect) {
    return applyBindValue(effect, ctx);
  }

  if ('evaluateSubset' in effect) {
    return applyEvaluateSubset(effect, ctx, budget, applyEffectsWithBudget);
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
  if ('gotoPhaseExact' in effect) {
    return applyGotoPhaseExact(effect, ctx);
  }
  if ('advancePhase' in effect) {
    return applyAdvancePhase(effect, ctx);
  }
  if ('pushInterruptPhase' in effect) {
    return applyPushInterruptPhase(effect, ctx);
  }
  if ('popInterruptPhase' in effect) {
    return applyPopInterruptPhase(effect, ctx);
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
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
};

const applyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  let currentState = ctx.state;
  let currentRng = ctx.rng;
  let currentBindings = ctx.bindings;
  const emittedEvents: TriggerEvent[] = [];

  for (const [effectIndex, effect] of effects.entries()) {
    const result = applyEffectWithBudget(
      effect,
      {
        ...ctx,
        state: currentState,
        rng: currentRng,
        bindings: currentBindings,
        effectPath: `${ctx.effectPath ?? ''}[${effectIndex}]`,
      },
      budget,
    );
    currentState = result.state;
    currentRng = result.rng;
    currentBindings = result.bindings ?? currentBindings;
    emittedEvents.push(...(result.emittedEvents ?? []));
    if (result.pendingChoice !== undefined) {
      return { state: currentState, rng: currentRng, emittedEvents, bindings: currentBindings, pendingChoice: result.pendingChoice };
    }
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
    ...(result.bindings === undefined ? {} : { bindings: result.bindings }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
}

export function applyEffects(effects: readonly EffectAST[], ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);
  const result = applyEffectsWithBudget(effects, ctx, budget);
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    ...(result.bindings === undefined ? {} : { bindings: result.bindings }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
}
