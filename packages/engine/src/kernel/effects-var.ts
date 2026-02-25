import { resolvePlayerSel } from './resolve-selectors.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { PlayerId, ZoneId } from './branded.js';
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

const resolveZoneVarDef = (ctx: EffectContext, varName: string, effectType: 'setVar' | 'addVar') => {
  const variableDef = (ctx.def.zoneVars ?? []).find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Unknown zone variable: ${varName}`, {
      effectType,
      scope: 'zoneVar',
      var: varName,
      availableZoneVars: (ctx.def.zoneVars ?? []).map((variable) => variable.name).sort(),
    });
  }

  return variableDef;
};

const zoneVarChangedEvent = (
  zoneId: ZoneId,
  varName: string,
  oldValue: number,
  newValue: number,
) => ({
  type: 'varChanged' as const,
  scope: 'zone' as const,
  zone: zoneId,
  var: varName,
  oldValue,
  newValue,
});

export const applySetVar = (effect: Extract<EffectAST, { readonly setVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, zone, value } = effect.setVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = evalValue(value, evalCtx);

  if (scope === 'zoneVar') {
    if (zone === undefined) {
      throw effectRuntimeError('variableRuntimeValidationFailed', 'setVar scope "zoneVar" requires zone selector', {
        effectType: 'setVar',
        scope: 'zoneVar',
        var: variableName,
      });
    }

    const resolvedZoneId = resolveZoneRef(zone, evalCtx);
    const variableDef = resolveZoneVarDef(ctx, variableName, 'setVar');
    if (variableDef.type !== 'int') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `setVar on zone variable only supports int type: ${variableName}`, {
        effectType: 'setVar',
        scope: 'zoneVar',
        var: variableName,
        actualType: variableDef.type,
      });
    }

    const zoneVarMap = ctx.state.zoneVars[String(resolvedZoneId)];
    if (zoneVarMap === undefined) {
      throw effectRuntimeError('variableRuntimeValidationFailed', `Zone variable state is missing for zone: ${String(resolvedZoneId)}`, {
        effectType: 'setVar',
        scope: 'zoneVar',
        zone: String(resolvedZoneId),
        var: variableName,
        availableZones: Object.keys(ctx.state.zoneVars).sort(),
      });
    }

    const currentValue = zoneVarMap[variableName];
    if (typeof currentValue !== 'number') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `Zone variable state is missing: ${variableName} in zone ${String(resolvedZoneId)}`, {
        effectType: 'setVar',
        scope: 'zoneVar',
        zone: String(resolvedZoneId),
        var: variableName,
        availableZoneVars: Object.keys(zoneVarMap).sort(),
      });
    }

    const nextValue = clamp(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef.min, variableDef.max);
    if (
      !emitVarChangeTraceIfChanged(ctx, {
        scope: 'zone',
        zone: String(resolvedZoneId),
        varName: variableName,
        oldValue: currentValue,
        newValue: nextValue,
      })
    ) {
      return { state: ctx.state, rng: ctx.rng };
    }

    return {
      state: {
        ...ctx.state,
        zoneVars: {
          ...ctx.state.zoneVars,
          [String(resolvedZoneId)]: {
            ...zoneVarMap,
            [variableName]: nextValue,
          },
        },
      },
      rng: ctx.rng,
      emittedEvents: [zoneVarChangedEvent(resolvedZoneId, variableName, currentValue, nextValue)],
    };
  }

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
    if (
      !emitVarChangeTraceIfChanged(ctx, {
        scope: 'global',
        varName: variableName,
        oldValue: currentValue,
        newValue: nextValue,
      })
    ) {
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
  const playerVars = ctx.state.perPlayerVars[playerId];
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
  if (
    !emitVarChangeTraceIfChanged(ctx, {
      scope: 'perPlayer',
      player: playerId,
      varName: variableName,
      oldValue: currentValue,
      newValue: nextValue,
    })
  ) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [playerId]: {
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
  const { scope, var: variableName, player, zone, delta } = effect.addVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');

  if (scope === 'zoneVar') {
    if (zone === undefined) {
      throw effectRuntimeError('variableRuntimeValidationFailed', 'addVar scope "zoneVar" requires zone selector', {
        effectType: 'addVar',
        scope: 'zoneVar',
        var: variableName,
      });
    }

    const resolvedZoneId = resolveZoneRef(zone, evalCtx);
    const variableDef = resolveZoneVarDef(ctx, variableName, 'addVar');
    if (variableDef.type !== 'int') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `addVar cannot target non-int zone variable: ${variableName}`, {
        effectType: 'addVar',
        scope: 'zoneVar',
        var: variableName,
        actualType: variableDef.type,
      });
    }

    const zoneVarMap = ctx.state.zoneVars[String(resolvedZoneId)];
    if (zoneVarMap === undefined) {
      throw effectRuntimeError('variableRuntimeValidationFailed', `Zone variable state is missing for zone: ${String(resolvedZoneId)}`, {
        effectType: 'addVar',
        scope: 'zoneVar',
        zone: String(resolvedZoneId),
        var: variableName,
        availableZones: Object.keys(ctx.state.zoneVars).sort(),
      });
    }

    const currentValue = zoneVarMap[variableName];
    if (typeof currentValue !== 'number') {
      throw effectRuntimeError('variableRuntimeValidationFailed', `Zone variable state is missing: ${variableName} in zone ${String(resolvedZoneId)}`, {
        effectType: 'addVar',
        scope: 'zoneVar',
        zone: String(resolvedZoneId),
        var: variableName,
        availableZoneVars: Object.keys(zoneVarMap).sort(),
      });
    }

    const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
    if (
      !emitVarChangeTraceIfChanged(ctx, {
        scope: 'zone',
        zone: String(resolvedZoneId),
        varName: variableName,
        oldValue: currentValue,
        newValue: nextValue,
      })
    ) {
      return { state: ctx.state, rng: ctx.rng };
    }

    return {
      state: {
        ...ctx.state,
        zoneVars: {
          ...ctx.state.zoneVars,
          [String(resolvedZoneId)]: {
            ...zoneVarMap,
            [variableName]: nextValue,
          },
        },
      },
      rng: ctx.rng,
      emittedEvents: [zoneVarChangedEvent(resolvedZoneId, variableName, currentValue, nextValue)],
    };
  }

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
    if (
      !emitVarChangeTraceIfChanged(ctx, {
        scope: 'global',
        varName: variableName,
        oldValue: currentValue,
        newValue: nextValue,
      })
    ) {
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
  const playerVars = ctx.state.perPlayerVars[playerId];
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
  if (
    !emitVarChangeTraceIfChanged(ctx, {
      scope: 'perPlayer',
      player: playerId,
      varName: variableName,
      oldValue: currentValue,
      newValue: nextValue,
    })
  ) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [playerId]: {
          ...playerVars,
          [variableName]: nextValue,
        },
      },
    },
    rng: ctx.rng,
    emittedEvents: [perPlayerVarChangedEvent(playerId, variableName, currentValue, nextValue)],
  };
};

export const applySetActivePlayer = (
  effect: Extract<EffectAST, { readonly setActivePlayer: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const resolvedPlayers = resolvePlayerSel(effect.setActivePlayer.player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw effectRuntimeError('variableRuntimeValidationFailed', 'setActivePlayer requires exactly one resolved player', {
      effectType: 'setActivePlayer',
      selector: effect.setActivePlayer.player,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }

  const nextActive = resolvedPlayers[0]!;
  if (nextActive === ctx.state.activePlayer) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      activePlayer: nextActive,
    },
    rng: ctx.rng,
  };
};
