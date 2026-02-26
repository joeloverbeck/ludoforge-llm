import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import { resolveSinglePlayerWithNormalization } from './selector-resolution-normalization.js';
import {
  readScopedVarValue,
  resolveRuntimeScopedEndpoint,
  resolveScopedVarDef,
  writeScopedVarToBranches,
} from './scoped-var-runtime-access.js';
import { toTraceVarChangePayload, toVarChangedEvent, type RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import type { EffectContext, EffectResult } from './effect-context.js';
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

const writeScopedVarToState = (
  ctx: EffectContext,
  endpoint: RuntimeScopedVarEndpoint,
  value: number | boolean,
): EffectContext['state'] => {
  const baseBranches = {
    globalVars: ctx.state.globalVars,
    perPlayerVars: ctx.state.perPlayerVars,
    zoneVars: ctx.state.zoneVars,
  };
  const branches =
    endpoint.scope === 'zone'
      ? writeScopedVarToBranches(baseBranches, endpoint, value as number)
      : writeScopedVarToBranches(baseBranches, endpoint, value);

  return {
    ...ctx.state,
    globalVars: branches.globalVars,
    perPlayerVars: branches.perPlayerVars,
    zoneVars: branches.zoneVars,
  };
};

const readScopedIntForAddVar = (ctx: EffectContext, endpoint: RuntimeScopedVarEndpoint, variableName: string): number => {
  const value = readScopedVarValue(ctx, endpoint, 'addVar', 'variableRuntimeValidationFailed');
  if (typeof value === 'number') {
    return value;
  }

  if (endpoint.scope === 'global') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Global variable state is missing: ${variableName}`, {
      effectType: 'addVar',
      scope: 'global',
      var: variableName,
      availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
    });
  }

  if (endpoint.scope === 'pvar') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId: endpoint.player,
      var: variableName,
      availablePlayerVars: Object.keys(ctx.state.perPlayerVars[endpoint.player] ?? {}).sort(),
    });
  }

  throw effectRuntimeError('variableRuntimeValidationFailed', `Zone variable state is missing: ${variableName} in zone ${String(endpoint.zone)}`, {
    effectType: 'addVar',
    scope: 'zoneVar',
    zone: String(endpoint.zone),
    var: variableName,
    availableZoneVars: Object.keys(ctx.state.zoneVars[String(endpoint.zone)] ?? {}).sort(),
  });
};

const emitVarChangeArtifacts = (
  ctx: EffectContext,
  endpoint: RuntimeScopedVarEndpoint,
  oldValue: number | boolean,
  newValue: number | boolean,
) => {
  const tracePayload = toTraceVarChangePayload(endpoint, oldValue, newValue);
  if (!emitVarChangeTraceIfChanged(ctx, tracePayload)) {
    return undefined;
  }

  return toVarChangedEvent(endpoint, oldValue, newValue);
};

export const applySetVar = (effect: Extract<EffectAST, { readonly setVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { var: variableName, value } = effect.setVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = evalValue(value, evalCtx);
  const endpoint = resolveRuntimeScopedEndpoint(effect.setVar, evalCtx, {
    code: 'variableRuntimeValidationFailed',
    effectType: 'setVar',
    pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
    pvarResolutionFailureMessage: 'setVar pvar selector resolution failed',
    zoneResolutionFailureMessage: 'setVar zoneVar selector resolution failed',
    context: { endpoint: effect.setVar },
  });
  const variableDef = resolveScopedVarDef(
    ctx,
    { scope: effect.setVar.scope, var: variableName },
    'setVar',
    'variableRuntimeValidationFailed',
  );
  if (endpoint.scope === 'zone' && variableDef.type !== 'int') {
    throw effectRuntimeError('variableRuntimeValidationFailed', `setVar on zone variable only supports int type: ${variableName}`, {
      effectType: 'setVar',
      scope: 'zoneVar',
      var: variableName,
      actualType: variableDef.type,
    });
  }

  const currentValue = readScopedVarValue(ctx, endpoint, 'setVar', 'variableRuntimeValidationFailed');
  const nextValue =
    variableDef.type === 'int'
      ? clamp(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef.min, variableDef.max)
      : expectBoolean(evaluatedValue, 'setVar', 'value');
  const emittedEvent = emitVarChangeArtifacts(ctx, endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: writeScopedVarToState(ctx, endpoint, nextValue),
    rng: ctx.rng,
    emittedEvents: [emittedEvent],
  };
};

export const applyAddVar = (effect: Extract<EffectAST, { readonly addVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { var: variableName, delta } = effect.addVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');
  const endpoint = resolveRuntimeScopedEndpoint(effect.addVar, evalCtx, {
    code: 'variableRuntimeValidationFailed',
    effectType: 'addVar',
    pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
    pvarResolutionFailureMessage: 'addVar pvar selector resolution failed',
    zoneResolutionFailureMessage: 'addVar zoneVar selector resolution failed',
    context: { endpoint: effect.addVar },
  });
  const variableDef = resolveScopedVarDef(
    ctx,
    { scope: effect.addVar.scope, var: variableName },
    'addVar',
    'variableRuntimeValidationFailed',
  );
  if (variableDef.type !== 'int') {
    const message =
      effect.addVar.scope === 'zoneVar'
        ? `addVar cannot target non-int zone variable: ${variableName}`
        : `addVar cannot target non-int variable: ${variableName}`;
    throw effectRuntimeError('variableRuntimeValidationFailed', message, {
      effectType: 'addVar',
      scope: effect.addVar.scope,
      var: variableName,
      actualType: variableDef.type,
    });
  }

  const currentValue = readScopedIntForAddVar(ctx, endpoint, variableName);
  const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
  const emittedEvent = emitVarChangeArtifacts(ctx, endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: writeScopedVarToState(ctx, endpoint, nextValue),
    rng: ctx.rng,
    emittedEvents: [emittedEvent],
  };
};

export const applySetActivePlayer = (
  effect: Extract<EffectAST, { readonly setActivePlayer: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const nextActive = resolveSinglePlayerWithNormalization(effect.setActivePlayer.player, evalCtx, {
    code: 'variableRuntimeValidationFailed',
    effectType: 'setActivePlayer',
    scope: 'activePlayer',
    cardinalityMessage: 'setActivePlayer requires exactly one resolved player',
    resolutionFailureMessage: 'setActivePlayer selector resolution failed',
    context: { endpoint: effect.setActivePlayer },
  });
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
