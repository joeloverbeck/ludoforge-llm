import { evalValue } from './eval-value.js';
import { effectRuntimeError } from './effect-error.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { resolveSinglePlayerWithNormalization, selectorResolutionFailurePolicyForMode } from './selector-resolution-normalization.js';
import {
  readScopedIntVarValue,
  readScopedVarValue,
  resolveRuntimeScopedEndpoint,
  resolveScopedVarDef,
  toScopedVarWrite,
  writeScopedVarsToState,
} from './scoped-var-runtime-access.js';
import { toTraceVarChangePayload, toVarChangedEvent, type RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST } from './types.js';
import type { TriggerEvent } from './types.js';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Merge moveParams into bindings. Fast path: return bindings directly when moveParams is empty. */
const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => {
  const mp = ctx.moveParams;
  for (const key in mp) {
    void key;
    return { ...mp, ...ctx.bindings };
  }
  return ctx.bindings;
};

const expectInteger = (value: unknown, effectType: 'setVar' | 'addVar', field: 'value' | 'delta'): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, `${effectType}.${field} must evaluate to a finite safe integer`, {
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, `${effectType}.${field} must evaluate to boolean`, {
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
): TriggerEvent | undefined => {
  const tracePayload = toTraceVarChangePayload(endpoint, oldValue, newValue);
  if (!emitVarChangeTraceIfChanged(ctx, tracePayload)) {
    return undefined;
  }

  return toVarChangedEvent(endpoint, oldValue, newValue);
};

export const applySetVar = (effect: Extract<EffectAST, { readonly setVar: unknown }>, ctx: EffectContext): EffectResult => {
  const profiler = ctx.profiler;
  const { value } = effect.setVar;
  const t0_bindings = profiler !== undefined ? performance.now() : 0;
  const resolvedBindings = resolveEffectBindings(ctx);
  const evalCtx = resolvedBindings === ctx.bindings ? ctx : { ...ctx, bindings: resolvedBindings };
  if (profiler !== undefined) {
    const k = 'setVar:bindings'; const b = profiler.dynamic.get(k); if (b) b.totalMs += performance.now() - t0_bindings; else profiler.dynamic.set(k, { count: 0, totalMs: performance.now() - t0_bindings });
  }
  const t0_eval = profiler !== undefined ? performance.now() : 0;
  const evaluatedValue = evalValue(value, evalCtx);
  if (profiler !== undefined) {
    const k = 'setVar:evalValue'; const b = profiler.dynamic.get(k); if (b) { b.totalMs += performance.now() - t0_eval; b.count += 1; } else profiler.dynamic.set(k, { count: 1, totalMs: performance.now() - t0_eval });
  }
  const t0_endpoint = profiler !== undefined ? performance.now() : 0;
  const endpoint = resolveRuntimeScopedEndpoint(effect.setVar, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
    effectType: 'setVar',
    pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
    pvarResolutionFailureMessage: 'setVar pvar selector resolution failed',
    zoneResolutionFailureMessage: 'setVar zoneVar selector resolution failed',
    context: { endpoint: effect.setVar },
  });
  if (profiler !== undefined) {
    const k = 'setVar:resolveEndpoint'; const b = profiler.dynamic.get(k); if (b) { b.totalMs += performance.now() - t0_endpoint; b.count += 1; } else profiler.dynamic.set(k, { count: 1, totalMs: performance.now() - t0_endpoint });
  }
  const variableDef = resolveScopedVarDef(
    ctx,
    { scope: effect.setVar.scope, var: endpoint.var },
    'setVar',
    EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
  );
  if (endpoint.scope === 'zone' && variableDef.type !== 'int') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, `setVar on zone variable only supports int type: ${endpoint.var}`, {
      effectType: 'setVar',
      scope: 'zoneVar',
      var: endpoint.var,
      actualType: variableDef.type,
    });
  }

  const currentValue =
    variableDef.type === 'int'
      ? readScopedIntVarValue(ctx, endpoint, 'setVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED)
      : readScopedVarValue(ctx, endpoint, 'setVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
  const nextValue =
    variableDef.type === 'int'
      ? clamp(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef.min, variableDef.max)
      : expectBoolean(evaluatedValue, 'setVar', 'value');
  const emittedEvent = emitVarChangeArtifacts(ctx, endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: ctx.state, rng: ctx.rng };
  }

  const scopedWrite =
    endpoint.scope === 'zone'
      ? toScopedVarWrite(endpoint, expectInteger(nextValue, 'setVar', 'value'))
      : toScopedVarWrite(endpoint, nextValue);

  const t0_write = profiler !== undefined ? performance.now() : 0;
  const newState = writeScopedVarsToState(ctx.state, [scopedWrite]);
  if (profiler !== undefined) {
    const k = 'setVar:writeState'; const b = profiler.dynamic.get(k); if (b) { b.totalMs += performance.now() - t0_write; b.count += 1; } else profiler.dynamic.set(k, { count: 1, totalMs: performance.now() - t0_write });
  }
  return {
    state: newState,
    rng: ctx.rng,
    emittedEvents: [emittedEvent],
  };
};

export const applyAddVar = (effect: Extract<EffectAST, { readonly addVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { delta } = effect.addVar;
  const resolvedBindingsAdd = resolveEffectBindings(ctx);
  const evalCtx = resolvedBindingsAdd === ctx.bindings ? ctx : { ...ctx, bindings: resolvedBindingsAdd };
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');
  const endpoint = resolveRuntimeScopedEndpoint(effect.addVar, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
    effectType: 'addVar',
    pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
    pvarResolutionFailureMessage: 'addVar pvar selector resolution failed',
    zoneResolutionFailureMessage: 'addVar zoneVar selector resolution failed',
    context: { endpoint: effect.addVar },
  });
  const variableDef = resolveScopedVarDef(
    ctx,
    { scope: effect.addVar.scope, var: endpoint.var },
    'addVar',
    EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
  );
  if (variableDef.type !== 'int') {
    const message =
      effect.addVar.scope === 'zoneVar'
        ? `addVar cannot target non-int zone variable: ${endpoint.var}`
        : `addVar cannot target non-int variable: ${endpoint.var}`;
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, message, {
      effectType: 'addVar',
      scope: effect.addVar.scope,
      var: endpoint.var,
      actualType: variableDef.type,
    });
  }

  const currentValue = readScopedIntVarValue(ctx, endpoint, 'addVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
  const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
  const emittedEvent = emitVarChangeArtifacts(ctx, endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: writeScopedVarsToState(ctx.state, [toScopedVarWrite(endpoint, nextValue)]),
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
    code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
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
