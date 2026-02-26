import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import { resolveSinglePlayerWithNormalization, selectorResolutionFailurePolicyForMode } from './selector-resolution-normalization.js';
import {
  readScopedIntVarValue,
  readScopedVarValue,
  resolveRuntimeScopedEndpoint,
  resolveScopedVarDef,
  writeScopedVarToState,
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

  const currentValue =
    variableDef.type === 'int'
      ? readScopedIntVarValue(ctx, endpoint, 'setVar', 'variableRuntimeValidationFailed')
      : readScopedVarValue(ctx, endpoint, 'setVar', 'variableRuntimeValidationFailed');
  const nextValue =
    variableDef.type === 'int'
      ? clamp(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef.min, variableDef.max)
      : expectBoolean(evaluatedValue, 'setVar', 'value');
  const emittedEvent = emitVarChangeArtifacts(ctx, endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: writeScopedVarToState(ctx.state, endpoint, nextValue),
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

  const currentValue = readScopedIntVarValue(ctx, endpoint, 'addVar', 'variableRuntimeValidationFailed');
  const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
  const emittedEvent = emitVarChangeArtifacts(ctx, endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: writeScopedVarToState(ctx.state, endpoint, nextValue),
    rng: ctx.rng,
    emittedEvents: [emittedEvent],
  };
};

export const applySetActivePlayer = (
  effect: Extract<EffectAST, { readonly setActivePlayer: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const nextActive = resolveSinglePlayerWithNormalization(effect.setActivePlayer.player, evalCtx, {
    code: 'variableRuntimeValidationFailed',
    effectType: 'setActivePlayer',
    scope: 'activePlayer',
    cardinalityMessage: 'setActivePlayer requires exactly one resolved player',
    resolutionFailureMessage: 'setActivePlayer selector resolution failed',
    onResolutionFailure,
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
