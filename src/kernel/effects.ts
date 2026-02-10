import { getMaxEffectOps, type EffectContext, type EffectResult } from './effect-context.js';
import {
  EffectBudgetExceededError,
  EffectRuntimeError,
  SpatialNotImplementedError,
  effectNotImplementedError,
} from './effect-error.js';
import { evalValue } from './eval-value.js';
import { resolvePlayerSel } from './resolve-selectors.js';
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

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const expectInteger = (value: unknown, effectType: 'setVar' | 'addVar', field: 'value' | 'delta'): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `${effectType}.${field} must evaluate to a finite safe integer`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const resolveGlobalVarDef = (ctx: EffectContext, varName: string, effectType: 'setVar' | 'addVar') => {
  const variableDef = ctx.def.globalVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Unknown global variable: ${varName}`, {
      effectType,
      scope: 'global',
      var: varName,
      availableGlobalVars: ctx.def.globalVars.map((variable) => variable.name).sort(),
    });
  }

  if (variableDef.type !== 'int') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Variable ${varName} must be int`, {
      effectType,
      scope: 'global',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const resolvePerPlayerVarDef = (ctx: EffectContext, varName: string, effectType: 'setVar' | 'addVar') => {
  const variableDef = ctx.def.perPlayerVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Unknown per-player variable: ${varName}`, {
      effectType,
      scope: 'pvar',
      var: varName,
      availablePerPlayerVars: ctx.def.perPlayerVars.map((variable) => variable.name).sort(),
    });
  }

  if (variableDef.type !== 'int') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Variable ${varName} must be int`, {
      effectType,
      scope: 'pvar',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const applySetVar = (effect: Extract<EffectAST, { readonly setVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, value } = effect.setVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = expectInteger(evalValue(value, evalCtx), 'setVar', 'value');

  if (scope === 'global') {
    const variableDef = resolveGlobalVarDef(ctx, variableName, 'setVar');
    const currentValue = ctx.state.globalVars[variableName];
    if (typeof currentValue !== 'number') {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `Global variable state is missing: ${variableName}`, {
        effectType: 'setVar',
        scope: 'global',
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }

    const nextValue = clamp(evaluatedValue, variableDef.min, variableDef.max);
    if (nextValue === currentValue) {
      return { state: ctx.state, rng: ctx.rng };
    }

    return {
      state: {
        ...ctx.state,
        globalVars: {
          ...ctx.state.globalVars,
          [variableName]: nextValue,
        },
      },
      rng: ctx.rng,
    };
  }

  if (player === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'setVar scope "pvar" requires player selector', {
      effectType: 'setVar',
      scope: 'pvar',
      var: variableName,
    });
  }

  const resolvedPlayers = resolvePlayerSel(player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'Per-player variable operations require exactly one resolved player', {
      effectType: 'setVar',
      scope: 'pvar',
      selector: player,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }

  const playerId = resolvedPlayers[0]!;
  const variableDef = resolvePerPlayerVarDef(ctx, variableName, 'setVar');
  const playerKey = String(playerId);
  const playerVars = ctx.state.perPlayerVars[playerKey];
  if (playerVars === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player vars missing for player ${playerId}`, {
      effectType: 'setVar',
      scope: 'pvar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const currentValue = playerVars[variableName];
  if (typeof currentValue !== 'number') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'setVar',
      scope: 'pvar',
      playerId,
      var: variableName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  const nextValue = clamp(evaluatedValue, variableDef.min, variableDef.max);
  if (nextValue === currentValue) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [playerKey]: {
          ...playerVars,
          [variableName]: nextValue,
        },
      },
    },
    rng: ctx.rng,
  };
};

const applyAddVar = (effect: Extract<EffectAST, { readonly addVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, delta } = effect.addVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');

  if (scope === 'global') {
    const variableDef = resolveGlobalVarDef(ctx, variableName, 'addVar');
    const currentValue = ctx.state.globalVars[variableName];
    if (typeof currentValue !== 'number') {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `Global variable state is missing: ${variableName}`, {
        effectType: 'addVar',
        scope: 'global',
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }

    const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
    if (nextValue === currentValue) {
      return { state: ctx.state, rng: ctx.rng };
    }

    return {
      state: {
        ...ctx.state,
        globalVars: {
          ...ctx.state.globalVars,
          [variableName]: nextValue,
        },
      },
      rng: ctx.rng,
    };
  }

  if (player === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'addVar scope "pvar" requires player selector', {
      effectType: 'addVar',
      scope: 'pvar',
      var: variableName,
    });
  }

  const resolvedPlayers = resolvePlayerSel(player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'Per-player variable operations require exactly one resolved player', {
      effectType: 'addVar',
      scope: 'pvar',
      selector: player,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }

  const playerId = resolvedPlayers[0]!;
  const variableDef = resolvePerPlayerVarDef(ctx, variableName, 'addVar');
  const playerKey = String(playerId);
  const playerVars = ctx.state.perPlayerVars[playerKey];
  if (playerVars === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player vars missing for player ${playerId}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const currentValue = playerVars[variableName];
  if (typeof currentValue !== 'number') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId,
      var: variableName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
  if (nextValue === currentValue) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [playerKey]: {
          ...playerVars,
          [variableName]: nextValue,
        },
      },
    },
    rng: ctx.rng,
  };
};

const dispatchEffect = (effect: EffectAST, ctx: EffectContext): EffectResult => {
  if ('setVar' in effect) {
    return applySetVar(effect, ctx);
  }

  if ('addVar' in effect) {
    return applyAddVar(effect, ctx);
  }

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
