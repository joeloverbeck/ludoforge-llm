import { effectRuntimeError, isEffectRuntimeError } from './effect-error.js';
import { isEvalError } from './eval-error.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import type { EffectContext } from './effect-context.js';
import type { RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import type { PlayerId, ZoneId } from './branded.js';
import type { GameState, IntVariableDef, PlayerSel, VariableDef, VariableValue, ZoneRef } from './types.js';

type ScopedVarDefinitionScope = 'global' | 'pvar' | 'zoneVar';
type ScopedVarRuntimeErrorCode = 'variableRuntimeValidationFailed' | 'resourceRuntimeValidationFailed';
type ScopedVarEffectType = 'setVar' | 'addVar' | 'transferVar';

type DefinitionScopeEndpoint = Readonly<{
  scope: ScopedVarDefinitionScope;
  var: string;
}>;

export type ScopedVarStateBranches = Pick<GameState, 'globalVars' | 'perPlayerVars' | 'zoneVars'>;

const availableZoneVarNames = (ctx: EffectContext): readonly string[] => (ctx.def.zoneVars ?? []).map((variable) => variable.name).sort();

const normalizeSelectorResolutionError = (
  error: unknown,
  options: Readonly<{
    code: ScopedVarRuntimeErrorCode;
    effectType: ScopedVarEffectType | 'setActivePlayer';
    message: string;
    scope: string;
    context?: Readonly<Record<string, unknown>>;
  }>,
): never => {
  if (isEffectRuntimeError(error)) {
    throw error;
  }

  const errorContext =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
        }
      : {
          thrown: String(error),
        };

  throw effectRuntimeError(options.code, options.message, {
    effectType: options.effectType,
    scope: options.scope,
    ...(options.context ?? {}),
    ...(isEvalError(error) ? { sourceErrorCode: error.code } : {}),
    ...errorContext,
  });
};

export const resolveSinglePlayerWithNormalization = (
  selector: PlayerSel,
  evalCtx: EffectContext,
  options: Readonly<{
    code: ScopedVarRuntimeErrorCode;
    effectType: ScopedVarEffectType | 'setActivePlayer';
    scope: string;
    cardinalityMessage: string;
    resolutionFailureMessage: string;
    context?: Readonly<Record<string, unknown>>;
  }>,
): PlayerId => {
  let resolvedPlayers: readonly PlayerId[];
  try {
    resolvedPlayers = resolvePlayerSel(selector, evalCtx);
  } catch (error: unknown) {
    return normalizeSelectorResolutionError(error, {
      code: options.code,
      effectType: options.effectType,
      message: options.resolutionFailureMessage,
      scope: options.scope,
      context: {
        selector,
        ...(options.context ?? {}),
      },
    });
  }

  if (resolvedPlayers.length !== 1) {
    throw effectRuntimeError(options.code, options.cardinalityMessage, {
      effectType: options.effectType,
      scope: options.scope,
      selector,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
      ...(options.context ?? {}),
    });
  }

  return resolvedPlayers[0]!;
};

export const resolveZoneWithNormalization = (
  zoneRef: ZoneRef,
  evalCtx: EffectContext,
  options: Readonly<{
    code: ScopedVarRuntimeErrorCode;
    effectType: ScopedVarEffectType | 'setActivePlayer';
    scope: string;
    resolutionFailureMessage: string;
    context?: Readonly<Record<string, unknown>>;
  }>,
): ZoneId => {
  try {
    return resolveZoneRef(zoneRef, evalCtx);
  } catch (error: unknown) {
    return normalizeSelectorResolutionError(error, {
      code: options.code,
      effectType: options.effectType,
      message: options.resolutionFailureMessage,
      scope: options.scope,
      context: {
        zone: zoneRef,
        ...(options.context ?? {}),
      },
    });
  }
};

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
