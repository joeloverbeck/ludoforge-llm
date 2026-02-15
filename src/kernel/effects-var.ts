import { resolvePlayerSel } from './resolve-selectors.js';
import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { effectRuntimeError } from './effect-error.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { PlayerId } from './branded.js';
import type { EffectAST } from './types.js';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const expectInteger = (value: unknown, effectType: 'setVar' | 'addVar', field: 'value' | 'delta'): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw effectRuntimeError('variableRuntimeValidationFailed', `${effectType}.${field} must evaluate to a finite safe integer`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const expectBoolean = (value: unknown, effectType: 'setVar', field: 'value'): boolean => {
  if (typeof value !== 'boolean') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `${effectType}.${field} must evaluate to boolean`, {
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
    throw effectRuntimeError('variableRuntimeValidationFailed', `Unknown global variable: ${varName}`, {
      effectType,
      scope: 'global',
      var: varName,
      availableGlobalVars: ctx.def.globalVars.map((variable) => variable.name).sort(),
    });
  }

  return variableDef;
};

const resolvePerPlayerVarDef = (ctx: EffectContext, varName: string, effectType: 'setVar' | 'addVar') => {
  const variableDef = ctx.def.perPlayerVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Unknown per-player variable: ${varName}`, {
      effectType,
      scope: 'pvar',
      var: varName,
      availablePerPlayerVars: ctx.def.perPlayerVars.map((variable) => variable.name).sort(),
    });
  }

  return variableDef;
};

const globalVarChangedEvent = (varName: string, oldValue: number | boolean, newValue: number | boolean) => ({
  type: 'varChanged' as const,
  scope: 'global' as const,
  var: varName,
  oldValue,
  newValue,
});

const perPlayerVarChangedEvent = (
  playerId: PlayerId,
  varName: string,
  oldValue: number | boolean,
  newValue: number | boolean,
) => ({
  type: 'varChanged' as const,
  scope: 'perPlayer' as const,
  player: playerId,
  var: varName,
  oldValue,
  newValue,
});

export const applySetVar = (effect: Extract<EffectAST, { readonly setVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, value } = effect.setVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = evalValue(value, evalCtx);

  if (scope === 'global') {
    const variableDef = resolveGlobalVarDef(ctx, variableName, 'setVar');
    const currentValue = ctx.state.globalVars[variableName];
    if (typeof currentValue !== 'number' && typeof currentValue !== 'boolean') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `Global variable state is missing: ${variableName}`, {
        effectType: 'setVar',
        scope: 'global',
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }

    const nextValue =
      variableDef.type === 'int'
        ? clamp(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef.min, variableDef.max)
        : expectBoolean(evaluatedValue, 'setVar', 'value');
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
      emittedEvents: [globalVarChangedEvent(variableName, currentValue, nextValue)],
    };
  }

  if (player === undefined) {
    throw effectRuntimeError('variableRuntimeValidationFailed', 'setVar scope "pvar" requires player selector', {
      effectType: 'setVar',
      scope: 'pvar',
      var: variableName,
    });
  }

  const resolvedPlayers = resolvePlayerSel(player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw effectRuntimeError('variableRuntimeValidationFailed', 'Per-player variable operations require exactly one resolved player', {
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
    throw effectRuntimeError('variableRuntimeValidationFailed', `Per-player vars missing for player ${playerId}`, {
      effectType: 'setVar',
      scope: 'pvar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const currentValue = playerVars[variableName];
  if (typeof currentValue !== 'number' && typeof currentValue !== 'boolean') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'setVar',
      scope: 'pvar',
      playerId,
      var: variableName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  const nextValue =
    variableDef.type === 'int'
      ? clamp(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef.min, variableDef.max)
      : expectBoolean(evaluatedValue, 'setVar', 'value');
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
    emittedEvents: [perPlayerVarChangedEvent(playerId, variableName, currentValue, nextValue)],
  };
};

export const applyAddVar = (effect: Extract<EffectAST, { readonly addVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, delta } = effect.addVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');

  if (scope === 'global') {
    const variableDef = resolveGlobalVarDef(ctx, variableName, 'addVar');
    if (variableDef.type !== 'int') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `addVar cannot target non-int variable: ${variableName}`, {
        effectType: 'addVar',
        scope: 'global',
        var: variableName,
        actualType: variableDef.type,
      });
    }
    const currentValue = ctx.state.globalVars[variableName];
    if (typeof currentValue !== 'number') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `Global variable state is missing: ${variableName}`, {
        effectType: 'addVar',
        scope: 'global',
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }

    const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
    emitTrace(ctx.collector, {
      kind: 'varChange',
      scope: 'global',
      varName: variableName,
      oldValue: currentValue,
      newValue: nextValue,
    });
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
      emittedEvents: [globalVarChangedEvent(variableName, currentValue, nextValue)],
    };
  }

  if (player === undefined) {
    throw effectRuntimeError('variableRuntimeValidationFailed', 'addVar scope "pvar" requires player selector', {
      effectType: 'addVar',
      scope: 'pvar',
      var: variableName,
    });
  }

  const resolvedPlayers = resolvePlayerSel(player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw effectRuntimeError('variableRuntimeValidationFailed', 'Per-player variable operations require exactly one resolved player', {
      effectType: 'addVar',
      scope: 'pvar',
      selector: player,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }

  const playerId = resolvedPlayers[0]!;
  const variableDef = resolvePerPlayerVarDef(ctx, variableName, 'addVar');
  if (variableDef.type !== 'int') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `addVar cannot target non-int variable: ${variableName}`, {
      effectType: 'addVar',
      scope: 'pvar',
      var: variableName,
      actualType: variableDef.type,
    });
  }
  const playerKey = String(playerId);
  const playerVars = ctx.state.perPlayerVars[playerKey];
  if (playerVars === undefined) {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Per-player vars missing for player ${playerId}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const currentValue = playerVars[variableName];
  if (typeof currentValue !== 'number') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId,
      var: variableName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
  emitTrace(ctx.collector, {
    kind: 'varChange',
    scope: 'perPlayer',
    varName: variableName,
    oldValue: currentValue,
    newValue: nextValue,
  });
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
    emittedEvents: [perPlayerVarChangedEvent(playerId, variableName, currentValue, nextValue)],
  };
};
