import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { effectRuntimeError } from './effect-error.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import type { PlayerId } from './branded.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, PlayerSel } from './types.js';

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const expectInteger = (
  value: unknown,
  effectType: 'commitResource',
  field: 'amount' | 'min' | 'max',
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `${effectType}.${field} must evaluate to a finite safe integer`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const resolveSinglePlayer = (selector: PlayerSel, ctx: EffectContext): PlayerId => {
  const resolvedPlayers = resolvePlayerSel(selector, ctx);
  if (resolvedPlayers.length !== 1) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', 'Per-player variable operations require exactly one resolved player', {
      effectType: 'commitResource',
      selector,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }
  return resolvedPlayers[0]!;
};

const resolvePerPlayerIntVarDef = (ctx: EffectContext, varName: string) => {
  const variableDef = ctx.def.perPlayerVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Unknown per-player variable: ${varName}`, {
      effectType: 'commitResource',
      scope: 'pvar',
      var: varName,
      availablePerPlayerVars: ctx.def.perPlayerVars.map((variable) => variable.name).sort(),
    });
  }
  if (variableDef.type !== 'int') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `commitResource cannot target non-int variable: ${varName}`, {
      effectType: 'commitResource',
      scope: 'pvar',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const resolveGlobalIntVarDef = (ctx: EffectContext, varName: string) => {
  const variableDef = ctx.def.globalVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Unknown global variable: ${varName}`, {
      effectType: 'commitResource',
      scope: 'global',
      var: varName,
      availableGlobalVars: ctx.def.globalVars.map((variable) => variable.name).sort(),
    });
  }
  if (variableDef.type !== 'int') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `commitResource cannot target non-int variable: ${varName}`, {
      effectType: 'commitResource',
      scope: 'global',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const readPerPlayerIntValue = (ctx: EffectContext, playerId: PlayerId, varName: string): number => {
  const playerKey = String(playerId);
  const playerVars = ctx.state.perPlayerVars[playerKey];
  if (playerVars === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Per-player vars missing for player ${playerId}`, {
      effectType: 'commitResource',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const value = playerVars[varName];
  if (typeof value !== 'number') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Per-player variable state is missing: ${varName}`, {
      effectType: 'commitResource',
      playerId,
      var: varName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  return value;
};

const readGlobalIntValue = (ctx: EffectContext, varName: string): number => {
  const value = ctx.state.globalVars[varName];
  if (typeof value !== 'number') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Global variable state is missing: ${varName}`, {
      effectType: 'commitResource',
      var: varName,
      availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
    });
  }
  return value;
};

const withActualBind = (
  ctx: EffectContext,
  actualBind: string | undefined,
  actual: number,
): Readonly<Record<string, unknown>> | undefined => {
  if (actualBind === undefined) {
    return undefined;
  }

  return {
    ...ctx.bindings,
    [actualBind]: actual,
  };
};

export const applyCommitResource = (
  effect: Extract<EffectAST, { readonly commitResource: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const sourcePlayer = resolveSinglePlayer(effect.commitResource.from.player, evalCtx);
  const sourceVar = effect.commitResource.from.var;
  const sourceDef = resolvePerPlayerIntVarDef(ctx, sourceVar);
  const sourceBefore = readPerPlayerIntValue(ctx, sourcePlayer, sourceVar);

  const requestedAmount = expectInteger(evalValue(effect.commitResource.amount, evalCtx), 'commitResource', 'amount');
  const sourceAvailable = Math.max(0, sourceBefore - sourceDef.min);

  const destination = effect.commitResource.to;
  const destinationPlayer =
    destination.scope === 'pvar'
      ? (() => {
          if (destination.player === undefined) {
            throw effectRuntimeError('resourceRuntimeValidationFailed', 'commitResource.to.player is required when to.scope is "pvar"', {
              effectType: 'commitResource',
              scope: destination.scope,
              to: destination,
            });
          }
          return resolveSinglePlayer(destination.player, evalCtx);
        })()
      : undefined;

  const destinationDef =
    destination.scope === 'global'
      ? resolveGlobalIntVarDef(ctx, destination.var)
      : resolvePerPlayerIntVarDef(ctx, destination.var);
  const destinationBefore =
    destination.scope === 'global'
      ? readGlobalIntValue(ctx, destination.var)
      : readPerPlayerIntValue(ctx, destinationPlayer!, destination.var);
  const destinationHeadroom = Math.max(0, destinationDef.max - destinationBefore);

  let actual = Math.max(0, requestedAmount);
  actual = Math.min(actual, sourceAvailable, destinationHeadroom);

  if (effect.commitResource.min !== undefined) {
    const minAmount = Math.max(0, expectInteger(evalValue(effect.commitResource.min, evalCtx), 'commitResource', 'min'));
    if (actual < minAmount) {
      actual = Math.min(sourceAvailable, destinationHeadroom);
    }
  }

  if (effect.commitResource.max !== undefined) {
    const maxAmount = Math.max(0, expectInteger(evalValue(effect.commitResource.max, evalCtx), 'commitResource', 'max'));
    actual = Math.min(actual, maxAmount);
  }

  const resolvedBindings = withActualBind(ctx, effect.commitResource.actualBind, actual);

  const destinationIsSameCell =
    destination.scope === 'pvar' && destinationPlayer === sourcePlayer && destination.var === sourceVar;
  if (actual === 0 || destinationIsSameCell) {
    return {
      state: ctx.state,
      rng: ctx.rng,
      emittedEvents: [],
      ...(resolvedBindings === undefined ? {} : { bindings: resolvedBindings }),
    };
  }

  const sourceAfter = sourceBefore - actual;
  const destinationAfter = destinationBefore + actual;
  const sourcePlayerKey = String(sourcePlayer);
  const nextSourceVars = {
    ...ctx.state.perPlayerVars[sourcePlayerKey],
    [sourceVar]: sourceAfter,
  };

  const nextPerPlayerVars =
    destination.scope === 'pvar'
      ? sourcePlayer === destinationPlayer
        ? {
            ...ctx.state.perPlayerVars,
            [sourcePlayerKey]: {
              ...nextSourceVars,
              [destination.var]: destinationAfter,
            },
          }
        : {
            ...ctx.state.perPlayerVars,
            [sourcePlayerKey]: nextSourceVars,
            [String(destinationPlayer)]: {
              ...ctx.state.perPlayerVars[String(destinationPlayer)],
              [destination.var]: destinationAfter,
            },
          }
      : {
          ...ctx.state.perPlayerVars,
          [sourcePlayerKey]: nextSourceVars,
        };

  emitTrace(ctx.collector, {
    kind: 'varChange',
    scope: 'perPlayer',
    player: sourcePlayer,
    varName: sourceVar,
    oldValue: sourceBefore,
    newValue: sourceAfter,
  });
  emitTrace(ctx.collector, {
    kind: 'varChange',
    scope: destination.scope === 'global' ? 'global' : 'perPlayer',
    ...(destination.scope === 'pvar' ? { player: destinationPlayer! } : {}),
    varName: destination.var,
    oldValue: destinationBefore,
    newValue: destinationAfter,
  });

  return {
    state: {
      ...ctx.state,
      globalVars:
        destination.scope === 'global'
          ? {
              ...ctx.state.globalVars,
              [destination.var]: destinationAfter,
            }
          : ctx.state.globalVars,
      perPlayerVars: nextPerPlayerVars,
    },
    rng: ctx.rng,
    emittedEvents: [
      {
        type: 'varChanged',
        scope: 'perPlayer',
        player: sourcePlayer,
        var: sourceVar,
        oldValue: sourceBefore,
        newValue: sourceAfter,
      },
      destination.scope === 'global'
        ? {
            type: 'varChanged' as const,
            scope: 'global' as const,
            var: destination.var,
            oldValue: destinationBefore,
            newValue: destinationAfter,
          }
        : {
            type: 'varChanged' as const,
            scope: 'perPlayer' as const,
            player: destinationPlayer!,
            var: destination.var,
            oldValue: destinationBefore,
            newValue: destinationAfter,
          },
    ],
    ...(resolvedBindings === undefined ? {} : { bindings: resolvedBindings }),
  };
};
