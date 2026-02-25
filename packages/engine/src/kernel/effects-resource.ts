import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { effectRuntimeError } from './effect-error.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import type { PlayerId, ZoneId } from './branded.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, PlayerSel, ZoneRef } from './types.js';

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const expectInteger = (
  value: unknown,
  effectType: 'transferVar',
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
      effectType: 'transferVar',
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
      effectType: 'transferVar',
      scope: 'pvar',
      var: varName,
      availablePerPlayerVars: ctx.def.perPlayerVars.map((variable) => variable.name).sort(),
    });
  }
  if (variableDef.type !== 'int') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `transferVar cannot target non-int variable: ${varName}`, {
      effectType: 'transferVar',
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
      effectType: 'transferVar',
      scope: 'global',
      var: varName,
      availableGlobalVars: ctx.def.globalVars.map((variable) => variable.name).sort(),
    });
  }
  if (variableDef.type !== 'int') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `transferVar cannot target non-int variable: ${varName}`, {
      effectType: 'transferVar',
      scope: 'global',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const readPerPlayerIntValue = (ctx: EffectContext, playerId: PlayerId, varName: string): number => {
  const playerVars = ctx.state.perPlayerVars[playerId];
  if (playerVars === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Per-player vars missing for player ${playerId}`, {
      effectType: 'transferVar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const value = playerVars[varName];
  if (typeof value !== 'number') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Per-player variable state is missing: ${varName}`, {
      effectType: 'transferVar',
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
      effectType: 'transferVar',
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

type TransferEndpoint = {
  readonly scope: 'global' | 'pvar' | 'zoneVar';
  readonly var: string;
  readonly player?: PlayerSel;
  readonly zone?: ZoneRef;
};

type ResolvedEndpoint = {
  readonly scope: 'global' | 'pvar' | 'zone';
  readonly var: string;
  readonly player?: PlayerId;
  readonly zone?: ZoneId;
  readonly min: number;
  readonly max: number;
  readonly before: number;
};

const resolveZoneIntVarDef = (ctx: EffectContext, varName: string) => {
  const variableDef = (ctx.def.zoneVars ?? []).find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Unknown zone variable: ${varName}`, {
      effectType: 'transferVar',
      scope: 'zoneVar',
      var: varName,
      availableZoneVars: (ctx.def.zoneVars ?? []).map((variable) => variable.name).sort(),
    });
  }
  if (variableDef.type !== 'int') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `transferVar cannot target non-int variable: ${varName}`, {
      effectType: 'transferVar',
      scope: 'zoneVar',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const readZoneIntValue = (ctx: EffectContext, zoneId: ZoneId, varName: string): number => {
  const zoneVars = ctx.state.zoneVars[String(zoneId)];
  if (zoneVars === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Zone variable state is missing for zone: ${String(zoneId)}`, {
      effectType: 'transferVar',
      scope: 'zoneVar',
      zone: String(zoneId),
      availableZones: Object.keys(ctx.state.zoneVars).sort(),
    });
  }

  const value = zoneVars[varName];
  if (typeof value !== 'number') {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `Zone variable state is missing: ${varName} in zone ${String(zoneId)}`, {
      effectType: 'transferVar',
      scope: 'zoneVar',
      zone: String(zoneId),
      var: varName,
      availableZoneVars: Object.keys(zoneVars).sort(),
    });
  }

  return value;
};

const resolveEndpoint = (
  endpoint: TransferEndpoint,
  endpointPath: 'from' | 'to',
  evalCtx: EffectContext,
  ctx: EffectContext,
): ResolvedEndpoint => {
  if (endpoint.scope === 'global') {
    const variableDef = resolveGlobalIntVarDef(ctx, endpoint.var);
    return {
      scope: 'global',
      var: endpoint.var,
      min: variableDef.min,
      max: variableDef.max,
      before: readGlobalIntValue(ctx, endpoint.var),
    };
  }

  if (endpoint.scope === 'pvar') {
    if (endpoint.player === undefined) {
      throw effectRuntimeError('resourceRuntimeValidationFailed', `transferVar.${endpointPath}.player is required when ${endpointPath}.scope is "pvar"`, {
        effectType: 'transferVar',
        scope: endpoint.scope,
        [endpointPath]: endpoint,
      });
    }

    const player = resolveSinglePlayer(endpoint.player, evalCtx);
    const perPlayerVarDef = resolvePerPlayerIntVarDef(ctx, endpoint.var);
    return {
      scope: 'pvar',
      var: endpoint.var,
      player,
      min: perPlayerVarDef.min,
      max: perPlayerVarDef.max,
      before: readPerPlayerIntValue(ctx, player, endpoint.var),
    };
  }

  if (endpoint.zone === undefined) {
    throw effectRuntimeError('resourceRuntimeValidationFailed', `transferVar.${endpointPath}.zone is required when ${endpointPath}.scope is "zoneVar"`, {
      effectType: 'transferVar',
      scope: endpoint.scope,
      [endpointPath]: endpoint,
    });
  }

  const zone = resolveZoneRef(endpoint.zone, evalCtx);
  const zoneVarDef = resolveZoneIntVarDef(ctx, endpoint.var);
  return {
    scope: 'zone',
    var: endpoint.var,
    zone,
    min: zoneVarDef.min,
    max: zoneVarDef.max,
    before: readZoneIntValue(ctx, zone, endpoint.var),
  };
};

const isSameCell = (from: ResolvedEndpoint, to: ResolvedEndpoint): boolean =>
  from.scope === to.scope &&
  from.var === to.var &&
  (from.scope === 'global' || (from.scope === 'pvar' ? from.player === to.player : from.zone === to.zone));

const writePerPlayerVar = (
  perPlayerVars: EffectContext['state']['perPlayerVars'],
  player: PlayerId,
  varName: string,
  value: number,
): EffectContext['state']['perPlayerVars'] => {
  return {
    ...perPlayerVars,
    [player]: {
      ...perPlayerVars[player],
      [varName]: value,
    },
  };
};

const writeZoneVar = (
  zoneVars: EffectContext['state']['zoneVars'],
  zone: ZoneId,
  varName: string,
  value: number,
): EffectContext['state']['zoneVars'] => {
  return {
    ...zoneVars,
    [zone]: {
      ...(zoneVars[zone] ?? {}),
      [varName]: value,
    },
  };
};

export const applyTransferVar = (
  effect: Extract<EffectAST, { readonly transferVar: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const source = resolveEndpoint(effect.transferVar.from, 'from', evalCtx, ctx);
  const destination = resolveEndpoint(effect.transferVar.to, 'to', evalCtx, ctx);

  const requestedAmount = expectInteger(evalValue(effect.transferVar.amount, evalCtx), 'transferVar', 'amount');
  const sourceAvailable = Math.max(0, source.before - source.min);
  const destinationHeadroom = Math.max(0, destination.max - destination.before);

  let actual = Math.max(0, requestedAmount);
  actual = Math.min(actual, sourceAvailable, destinationHeadroom);

  let minAmount: number | undefined;
  if (effect.transferVar.min !== undefined) {
    minAmount = Math.max(0, expectInteger(evalValue(effect.transferVar.min, evalCtx), 'transferVar', 'min'));
    if (actual < minAmount) {
      actual = Math.min(sourceAvailable, destinationHeadroom);
    }
  }

  let maxAmount: number | undefined;
  if (effect.transferVar.max !== undefined) {
    maxAmount = Math.max(0, expectInteger(evalValue(effect.transferVar.max, evalCtx), 'transferVar', 'max'));
    actual = Math.min(actual, maxAmount);
  }

  const resolvedBindings = withActualBind(ctx, effect.transferVar.actualBind, actual);

  if (actual === 0 || isSameCell(source, destination)) {
    return {
      state: ctx.state,
      rng: ctx.rng,
      emittedEvents: [],
      ...(resolvedBindings === undefined ? {} : { bindings: resolvedBindings }),
    };
  }

  const sourceAfter = source.before - actual;
  const destinationAfter = destination.before + actual;
  const provenance = resolveTraceProvenance(ctx);

  emitTrace(ctx.collector, {
    kind: 'resourceTransfer',
    from:
      source.scope === 'global'
        ? {
            scope: 'global',
            varName: source.var,
          }
        : source.scope === 'pvar'
          ? {
            scope: 'perPlayer',
            player: source.player!,
            varName: source.var,
          }
          : {
            scope: 'zone',
            zone: source.zone!,
            varName: source.var,
          },
    to:
      destination.scope === 'global'
        ? {
            scope: 'global',
            varName: destination.var,
          }
        : destination.scope === 'pvar'
          ? {
            scope: 'perPlayer',
            player: destination.player!,
            varName: destination.var,
          }
          : {
            scope: 'zone',
            zone: destination.zone!,
            varName: destination.var,
          },
    requestedAmount,
    actualAmount: actual,
    sourceAvailable,
    destinationHeadroom,
    ...(minAmount === undefined ? {} : { minAmount }),
    ...(maxAmount === undefined ? {} : { maxAmount }),
    provenance,
  });
  if (source.scope === 'global') {
    emitVarChangeTraceIfChanged(ctx, {
      scope: 'global',
      varName: source.var,
      oldValue: source.before,
      newValue: sourceAfter,
      provenance,
    });
  } else {
    if (source.scope === 'pvar') {
      emitVarChangeTraceIfChanged(ctx, {
        scope: 'perPlayer',
        player: source.player!,
        varName: source.var,
        oldValue: source.before,
        newValue: sourceAfter,
        provenance,
      });
    } else {
      emitVarChangeTraceIfChanged(ctx, {
        scope: 'zone',
        zone: source.zone!,
        varName: source.var,
        oldValue: source.before,
        newValue: sourceAfter,
        provenance,
      });
    }
  }
  if (destination.scope === 'global') {
    emitVarChangeTraceIfChanged(ctx, {
      scope: 'global',
      varName: destination.var,
      oldValue: destination.before,
      newValue: destinationAfter,
      provenance,
    });
  } else {
    if (destination.scope === 'pvar') {
      emitVarChangeTraceIfChanged(ctx, {
        scope: 'perPlayer',
        player: destination.player!,
        varName: destination.var,
        oldValue: destination.before,
        newValue: destinationAfter,
        provenance,
      });
    } else {
      emitVarChangeTraceIfChanged(ctx, {
        scope: 'zone',
        zone: destination.zone!,
        varName: destination.var,
        oldValue: destination.before,
        newValue: destinationAfter,
        provenance,
      });
    }
  }

  let nextGlobalVars = ctx.state.globalVars;
  let nextPerPlayerVars = ctx.state.perPlayerVars;
  let nextZoneVars = ctx.state.zoneVars;

  if (source.scope === 'global') {
    nextGlobalVars = {
      ...nextGlobalVars,
      [source.var]: sourceAfter,
    };
  } else {
    if (source.scope === 'pvar') {
      nextPerPlayerVars = writePerPlayerVar(nextPerPlayerVars, source.player!, source.var, sourceAfter);
    } else {
      nextZoneVars = writeZoneVar(nextZoneVars, source.zone!, source.var, sourceAfter);
    }
  }

  if (destination.scope === 'global') {
    nextGlobalVars = {
      ...nextGlobalVars,
      [destination.var]: destinationAfter,
    };
  } else {
    if (destination.scope === 'pvar') {
      nextPerPlayerVars = writePerPlayerVar(nextPerPlayerVars, destination.player!, destination.var, destinationAfter);
    } else {
      nextZoneVars = writeZoneVar(nextZoneVars, destination.zone!, destination.var, destinationAfter);
    }
  }

  return {
    state: {
      ...ctx.state,
      globalVars: nextGlobalVars,
      perPlayerVars: nextPerPlayerVars,
      zoneVars: nextZoneVars,
    },
    rng: ctx.rng,
    emittedEvents: [
      source.scope === 'global'
        ? {
            type: 'varChanged' as const,
            scope: 'global' as const,
            var: source.var,
            oldValue: source.before,
            newValue: sourceAfter,
          }
        : {
            type: 'varChanged' as const,
            scope: source.scope === 'pvar' ? 'perPlayer' as const : 'zone' as const,
            ...(source.scope === 'pvar' ? { player: source.player! } : { zone: source.zone! }),
            var: source.var,
            oldValue: source.before,
            newValue: sourceAfter,
          },
      destination.scope === 'global'
        ? {
            type: 'varChanged' as const,
            scope: 'global' as const,
            var: destination.var,
            oldValue: destination.before,
            newValue: destinationAfter,
          }
        : {
            type: 'varChanged' as const,
            scope: destination.scope === 'pvar' ? 'perPlayer' as const : 'zone' as const,
            ...(destination.scope === 'pvar' ? { player: destination.player! } : { zone: destination.zone! }),
            var: destination.var,
            oldValue: destination.before,
            newValue: destinationAfter,
          },
    ],
    ...(resolvedBindings === undefined ? {} : { bindings: resolvedBindings }),
  };
};
