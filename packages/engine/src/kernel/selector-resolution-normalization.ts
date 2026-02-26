import { effectRuntimeError, isEffectRuntimeError } from './effect-error.js';
import { isEvalError } from './eval-error.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import type { EffectRuntimeReason } from './runtime-reasons.js';
import type { EvalContext } from './eval-context.js';
import type { InterpreterMode } from './interpreter-mode.js';
import type { PlayerId, ZoneId } from './branded.js';
import type { PlayerSel, ZoneRef } from './types.js';

type NormalizedResolverCode = EffectRuntimeReason;
type NormalizedResolverEffectType = string;
type NormalizedResolverPayloadField = 'selector' | 'zone';

export type NormalizedResolverScope =
  | 'activePlayer'
  | 'from'
  | 'pvar'
  | 'space'
  | 'to'
  | 'zone'
  | 'zoneVar';

export type SelectorResolutionFailurePolicy = 'normalize' | 'passthrough';

export const selectorResolutionFailurePolicyForMode = (
  mode: InterpreterMode,
): SelectorResolutionFailurePolicy => (mode === 'discovery' ? 'passthrough' : 'normalize');

export const normalizeSelectorResolutionError = (
  error: unknown,
  options: Readonly<{
    code: NormalizedResolverCode;
    effectType: NormalizedResolverEffectType;
    message: string;
    scope: NormalizedResolverScope;
    payloadField?: NormalizedResolverPayloadField;
    payload?: unknown;
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
    ...(options.payloadField === undefined ? {} : { [options.payloadField]: options.payload }),
    ...(options.context ?? {}),
    ...(isEvalError(error) ? { sourceErrorCode: error.code } : {}),
    ...errorContext,
  });
};

export const resolveSinglePlayerWithNormalization = (
  selector: PlayerSel,
  evalCtx: EvalContext,
  options: Readonly<{
    code: NormalizedResolverCode;
    effectType: NormalizedResolverEffectType;
    scope: NormalizedResolverScope;
    cardinalityMessage: string;
    resolutionFailureMessage: string;
    onResolutionFailure: SelectorResolutionFailurePolicy;
    context?: Readonly<Record<string, unknown>>;
  }>,
): PlayerId => {
  let resolvedPlayers: readonly PlayerId[];
  try {
    resolvedPlayers = resolvePlayerSel(selector, evalCtx);
  } catch (error: unknown) {
    if (options.onResolutionFailure === 'passthrough') {
      throw error;
    }
    return normalizeSelectorResolutionError(error, {
      code: options.code,
      effectType: options.effectType,
      message: options.resolutionFailureMessage,
      scope: options.scope,
      payloadField: 'selector',
      payload: selector,
      ...(options.context === undefined ? {} : { context: options.context }),
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

export const resolvePlayersWithNormalization = (
  selector: PlayerSel,
  evalCtx: EvalContext,
  options: Readonly<{
    code: NormalizedResolverCode;
    effectType: NormalizedResolverEffectType;
    scope: NormalizedResolverScope;
    resolutionFailureMessage: string;
    onResolutionFailure: SelectorResolutionFailurePolicy;
    context?: Readonly<Record<string, unknown>>;
  }>,
): readonly PlayerId[] => {
  try {
    return resolvePlayerSel(selector, evalCtx);
  } catch (error: unknown) {
    if (options.onResolutionFailure === 'passthrough') {
      throw error;
    }
    return normalizeSelectorResolutionError(error, {
      code: options.code,
      effectType: options.effectType,
      message: options.resolutionFailureMessage,
      scope: options.scope,
      payloadField: 'selector',
      payload: selector,
      ...(options.context === undefined ? {} : { context: options.context }),
    });
  }
};

export const resolveZoneWithNormalization = (
  zoneRef: ZoneRef,
  evalCtx: EvalContext,
  options: Readonly<{
    code: NormalizedResolverCode;
    effectType: NormalizedResolverEffectType;
    scope: NormalizedResolverScope;
    resolutionFailureMessage: string;
    onResolutionFailure: SelectorResolutionFailurePolicy;
    context?: Readonly<Record<string, unknown>>;
  }>,
): ZoneId => {
  try {
    return resolveZoneRef(zoneRef, evalCtx);
  } catch (error: unknown) {
    if (options.onResolutionFailure === 'passthrough') {
      throw error;
    }
    return normalizeSelectorResolutionError(error, {
      code: options.code,
      effectType: options.effectType,
      message: options.resolutionFailureMessage,
      scope: options.scope,
      payloadField: 'zone',
      payload: zoneRef,
      ...(options.context === undefined ? {} : { context: options.context }),
    });
  }
};
