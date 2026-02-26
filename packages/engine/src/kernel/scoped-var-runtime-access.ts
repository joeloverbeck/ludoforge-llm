import { effectRuntimeError } from './effect-error.js';
import {
  resolveSinglePlayerWithNormalization,
  resolveZoneWithNormalization,
} from './selector-resolution-normalization.js';
import type { EffectRuntimeReason } from './runtime-reasons.js';
import type { EffectContext } from './effect-context.js';
import type { RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import type { GameState, IntVariableDef, PlayerSel, VariableDef, VariableValue, ZoneRef } from './types.js';

type ScopedVarDefinitionScope = 'global' | 'pvar' | 'zoneVar';
type ScopedVarRuntimeErrorCode = EffectRuntimeReason;
type ScopedVarEffectType = string;

type DefinitionScopeEndpoint = Readonly<{
  scope: ScopedVarDefinitionScope;
  var: string;
}>;

export type ScopedVarResolvableEndpoint =
  | Readonly<{
      scope: 'global';
      var: string;
    }>
  | Readonly<{
      scope: 'pvar';
      var: string;
      player: PlayerSel;
    }>
  | Readonly<{
      scope: 'zoneVar';
      var: string;
      zone: ZoneRef;
    }>;

export type ScopedVarMalformedResolvableEndpoint =
  | Readonly<{
      scope: 'global';
      var: string;
    }>
  | Readonly<{
      scope: 'pvar';
      var: string;
      player?: PlayerSel;
    }>
  | Readonly<{
      scope: 'zoneVar';
      var: string;
      zone?: ZoneRef;
    }>;

export type ScopedVarStateBranches = Pick<GameState, 'globalVars' | 'perPlayerVars' | 'zoneVars'>;

const availableZoneVarNames = (ctx: EffectContext): readonly string[] => (ctx.def.zoneVars ?? []).map((variable) => variable.name).sort();

const resolveRuntimeScopedEndpointImpl = (
  endpoint: ScopedVarMalformedResolvableEndpoint,
  evalCtx: EffectContext,
  options: Readonly<{
    code: ScopedVarRuntimeErrorCode;
    effectType: ScopedVarEffectType;
    pvarCardinalityMessage: string;
    pvarResolutionFailureMessage: string;
    zoneResolutionFailureMessage: string;
    pvarMissingSelectorMessage?: string;
    zoneMissingSelectorMessage?: string;
    context?: Readonly<Record<string, unknown>>;
  }>,
): RuntimeScopedVarEndpoint => {
  if (endpoint.scope === 'global') {
    return {
      scope: 'global',
      var: endpoint.var,
    };
  }

  if (endpoint.scope === 'pvar') {
    if (endpoint.player === undefined) {
      throw effectRuntimeError(
        options.code,
        options.pvarMissingSelectorMessage ?? `${options.effectType} pvar endpoint requires player selector`,
        {
          effectType: options.effectType,
          scope: 'pvar',
          endpoint,
          ...(options.context ?? {}),
        },
      );
    }

    const player = resolveSinglePlayerWithNormalization(endpoint.player, evalCtx, {
      code: options.code,
      effectType: options.effectType,
      scope: 'pvar',
      cardinalityMessage: options.pvarCardinalityMessage,
      resolutionFailureMessage: options.pvarResolutionFailureMessage,
      context: {
        endpoint,
        ...(options.context ?? {}),
      },
    });
    return {
      scope: 'pvar',
      player,
      var: endpoint.var,
    };
  }

  if (endpoint.zone === undefined) {
    throw effectRuntimeError(
      options.code,
      options.zoneMissingSelectorMessage ?? `${options.effectType} zoneVar endpoint requires zone selector`,
      {
        effectType: options.effectType,
        scope: 'zoneVar',
        endpoint,
        ...(options.context ?? {}),
      },
    );
  }

  const zone = resolveZoneWithNormalization(endpoint.zone, evalCtx, {
    code: options.code,
    effectType: options.effectType,
    scope: 'zoneVar',
    resolutionFailureMessage: options.zoneResolutionFailureMessage,
    context: {
      endpoint,
      ...(options.context ?? {}),
    },
  });
  return {
    scope: 'zone',
    zone,
    var: endpoint.var,
  };
};

export const resolveRuntimeScopedEndpoint = (
  endpoint: ScopedVarResolvableEndpoint,
  evalCtx: EffectContext,
  options: Parameters<typeof resolveRuntimeScopedEndpointImpl>[2],
): RuntimeScopedVarEndpoint => resolveRuntimeScopedEndpointImpl(endpoint, evalCtx, options);

export const resolveRuntimeScopedEndpointWithMalformedSupport = (
  endpoint: ScopedVarMalformedResolvableEndpoint,
  evalCtx: EffectContext,
  options: Parameters<typeof resolveRuntimeScopedEndpointImpl>[2],
): RuntimeScopedVarEndpoint => resolveRuntimeScopedEndpointImpl(endpoint, evalCtx, options);

export const resolveScopedVarDef = (
  ctx: EffectContext,
  endpoint: DefinitionScopeEndpoint,
  effectType: ScopedVarEffectType,
  code: ScopedVarRuntimeErrorCode,
): VariableDef | IntVariableDef => {
  if (endpoint.scope === 'global') {
    const variableDef = ctx.def.globalVars.find((variable) => variable.name === endpoint.var);
    if (variableDef === undefined) {
      throw effectRuntimeError(code, `Unknown global variable: ${endpoint.var}`, {
        effectType,
        scope: 'global',
        var: endpoint.var,
        availableGlobalVars: ctx.def.globalVars.map((variable) => variable.name).sort(),
      });
    }
    return variableDef;
  }

  if (endpoint.scope === 'pvar') {
    const variableDef = ctx.def.perPlayerVars.find((variable) => variable.name === endpoint.var);
    if (variableDef === undefined) {
      throw effectRuntimeError(code, `Unknown per-player variable: ${endpoint.var}`, {
        effectType,
        scope: 'pvar',
        var: endpoint.var,
        availablePerPlayerVars: ctx.def.perPlayerVars.map((variable) => variable.name).sort(),
      });
    }
    return variableDef;
  }

  const variableDef = (ctx.def.zoneVars ?? []).find((variable) => variable.name === endpoint.var);
  if (variableDef === undefined) {
    throw effectRuntimeError(code, `Unknown zone variable: ${endpoint.var}`, {
      effectType,
      scope: 'zoneVar',
      var: endpoint.var,
      availableZoneVars: availableZoneVarNames(ctx),
    });
  }

  return variableDef;
};

export const resolveScopedIntVarDef = (
  ctx: EffectContext,
  endpoint: DefinitionScopeEndpoint,
  effectType: ScopedVarEffectType,
  code: ScopedVarRuntimeErrorCode,
): IntVariableDef => {
  const variableDef = resolveScopedVarDef(ctx, endpoint, effectType, code);
  if (variableDef.type !== 'int') {
    throw effectRuntimeError(code, `${effectType} cannot target non-int variable: ${endpoint.var}`, {
      effectType,
      scope: endpoint.scope,
      var: endpoint.var,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

export const readScopedVarValue = (
  ctx: EffectContext,
  endpoint: RuntimeScopedVarEndpoint,
  effectType: ScopedVarEffectType,
  code: ScopedVarRuntimeErrorCode,
): VariableValue | number => {
  if (endpoint.scope === 'global') {
    const value = ctx.state.globalVars[endpoint.var];
    if (typeof value !== 'number' && typeof value !== 'boolean') {
      throw effectRuntimeError(code, `Global variable state is missing: ${endpoint.var}`, {
        effectType,
        scope: 'global',
        var: endpoint.var,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }
    return value;
  }

  if (endpoint.scope === 'pvar') {
    const playerVars = ctx.state.perPlayerVars[endpoint.player];
    if (playerVars === undefined) {
      throw effectRuntimeError(code, `Per-player vars missing for player ${endpoint.player}`, {
        effectType,
        scope: 'pvar',
        playerId: endpoint.player,
        availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
      });
    }

    const value = playerVars[endpoint.var];
    if (typeof value !== 'number' && typeof value !== 'boolean') {
      throw effectRuntimeError(code, `Per-player variable state is missing: ${endpoint.var}`, {
        effectType,
        scope: 'pvar',
        playerId: endpoint.player,
        var: endpoint.var,
        availablePlayerVars: Object.keys(playerVars).sort(),
      });
    }

    return value;
  }

  const zoneVarMap = ctx.state.zoneVars[String(endpoint.zone)];
  if (zoneVarMap === undefined) {
    throw effectRuntimeError(code, `Zone variable state is missing for zone: ${String(endpoint.zone)}`, {
      effectType,
      scope: 'zoneVar',
      zone: String(endpoint.zone),
      var: endpoint.var,
      availableZones: Object.keys(ctx.state.zoneVars).sort(),
    });
  }

  const value = zoneVarMap[endpoint.var];
  if (typeof value !== 'number') {
    throw effectRuntimeError(code, `Zone variable state is missing: ${endpoint.var} in zone ${String(endpoint.zone)}`, {
      effectType,
      scope: 'zoneVar',
      zone: String(endpoint.zone),
      var: endpoint.var,
      availableZoneVars: Object.keys(zoneVarMap).sort(),
    });
  }

  return value;
};

export const readScopedIntVarValue = (
  ctx: EffectContext,
  endpoint: RuntimeScopedVarEndpoint,
  effectType: ScopedVarEffectType,
  code: ScopedVarRuntimeErrorCode,
): number => {
  const value = readScopedVarValue(ctx, endpoint, effectType, code);
  if (typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value)) {
    return value;
  }

  if (endpoint.scope === 'global') {
    throw effectRuntimeError(code, `Global variable state must be a finite safe integer: ${endpoint.var}`, {
      effectType,
      scope: 'global',
      var: endpoint.var,
      actualType: typeof value,
      value,
      availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
    });
  }

  if (endpoint.scope === 'pvar') {
    throw effectRuntimeError(code, `Per-player variable state must be a finite safe integer: ${endpoint.var}`, {
      effectType,
      scope: 'pvar',
      playerId: endpoint.player,
      var: endpoint.var,
      actualType: typeof value,
      value,
      availablePlayerVars: Object.keys(ctx.state.perPlayerVars[endpoint.player] ?? {}).sort(),
    });
  }

  throw effectRuntimeError(code, `Zone variable state must be a finite safe integer: ${endpoint.var} in zone ${String(endpoint.zone)}`, {
    effectType,
    scope: 'zoneVar',
    zone: String(endpoint.zone),
    var: endpoint.var,
    actualType: typeof value,
    value,
    availableZoneVars: Object.keys(ctx.state.zoneVars[String(endpoint.zone)] ?? {}).sort(),
  });
};

export function writeScopedVarToBranches(
  branches: ScopedVarStateBranches,
  endpoint: Extract<RuntimeScopedVarEndpoint, { readonly scope: 'zone' }>,
  value: number,
): ScopedVarStateBranches;
export function writeScopedVarToBranches(
  branches: ScopedVarStateBranches,
  endpoint: Exclude<RuntimeScopedVarEndpoint, { readonly scope: 'zone' }>,
  value: VariableValue,
): ScopedVarStateBranches;
export function writeScopedVarToBranches(
  branches: ScopedVarStateBranches,
  endpoint: RuntimeScopedVarEndpoint,
  value: VariableValue,
): ScopedVarStateBranches {
  if (endpoint.scope === 'global') {
    return {
      ...branches,
      globalVars: {
        ...branches.globalVars,
        [endpoint.var]: value,
      },
    };
  }

  if (endpoint.scope === 'pvar') {
    return {
      ...branches,
      perPlayerVars: {
        ...branches.perPlayerVars,
        [endpoint.player]: {
          ...branches.perPlayerVars[endpoint.player],
          [endpoint.var]: value,
        },
      },
    };
  }

  return {
    ...branches,
    zoneVars: {
      ...branches.zoneVars,
      [endpoint.zone]: {
        ...(branches.zoneVars[endpoint.zone] ?? {}),
        [endpoint.var]: value as number,
      },
    },
  };
}
