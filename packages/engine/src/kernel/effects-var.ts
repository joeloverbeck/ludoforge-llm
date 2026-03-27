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
  writeScopedVarsMutable,
  writeScopedVarsToState,
} from './scoped-var-runtime-access.js';
import { toTraceVarChangePayload, toVarChangedEvent, type RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import { clampIntVarValue } from './var-runtime-utils.js';
import { updateRunningHash } from './zobrist.js';
import { updateVarRunningHash } from './zobrist-var-hash.js';
import { toTraceEmissionContext } from './effect-context.js';
import type { EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';
import type { MutableGameState } from './state-draft.js';
import type { EffectAST } from './types.js';
import type { TriggerEvent } from './types.js';

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
  traceCtx: ReturnType<typeof toTraceEmissionContext>,
  endpoint: RuntimeScopedVarEndpoint,
  oldValue: number | boolean,
  newValue: number | boolean,
): TriggerEvent | undefined => {
  const tracePayload = toTraceVarChangePayload(endpoint, oldValue, newValue);
  if (!emitVarChangeTraceIfChanged(traceCtx, tracePayload)) {
    return undefined;
  }

  return toVarChangedEvent(endpoint, oldValue, newValue);
};

export const applySetVar = (
  effect: Extract<EffectAST, { readonly setVar: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const profiler = env.profiler;
  const { value } = effect.setVar;
  const t0_bindings = profiler !== undefined ? performance.now() : 0;
  const evalCtx = scope;
  if (profiler !== undefined) {
    const k = 'setVar:bindings'; const b = profiler.dynamic.get(k); if (b) b.totalMs += performance.now() - t0_bindings; else profiler.dynamic.set(k, { count: 0, totalMs: performance.now() - t0_bindings });
  }
  const t0_eval = profiler !== undefined ? performance.now() : 0;
  const evaluatedValue = evalValue(value, evalCtx);
  if (profiler !== undefined) {
    const k = 'setVar:evalValue'; const b = profiler.dynamic.get(k); if (b) { b.totalMs += performance.now() - t0_eval; b.count += 1; } else profiler.dynamic.set(k, { count: 1, totalMs: performance.now() - t0_eval });
  }
  const t0_endpoint = profiler !== undefined ? performance.now() : 0;
  const endpoint = resolveRuntimeScopedEndpoint(effect.setVar, evalCtx, env.mode, {
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
    { def: env.def },
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
      ? readScopedIntVarValue({ state: cursor.state }, endpoint, 'setVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED)
      : readScopedVarValue({ state: cursor.state }, endpoint, 'setVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
  const nextValue =
    variableDef.type === 'int'
      ? clampIntVarValue(expectInteger(evaluatedValue, 'setVar', 'value'), variableDef)
      : expectBoolean(evaluatedValue, 'setVar', 'value');
  const emittedEvent = emitVarChangeArtifacts(toTraceEmissionContext(env, cursor), endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: cursor.state, rng: cursor.rng };
  }

  const scopedWrite =
    endpoint.scope === 'zone'
      ? toScopedVarWrite(endpoint, expectInteger(nextValue, 'setVar', 'value'))
      : toScopedVarWrite(endpoint, nextValue);

  const t0_write = profiler !== undefined ? performance.now() : 0;
  let newState: import('./types.js').GameState;
  if (cursor.tracker) {
    writeScopedVarsMutable(cursor.state as MutableGameState, [scopedWrite], cursor.tracker);
    updateVarRunningHash(cursor.state as MutableGameState, env.cachedRuntime?.zobristTable, endpoint, currentValue, nextValue);
    newState = cursor.state;
  } else {
    newState = writeScopedVarsToState(cursor.state, [scopedWrite]);
  }
  if (profiler !== undefined) {
    const k = 'setVar:writeState'; const b = profiler.dynamic.get(k); if (b) { b.totalMs += performance.now() - t0_write; b.count += 1; } else profiler.dynamic.set(k, { count: 1, totalMs: performance.now() - t0_write });
  }
  return {
    state: newState,
    rng: cursor.rng,
    emittedEvents: [emittedEvent],
  };
};

export const applyAddVar = (
  effect: Extract<EffectAST, { readonly addVar: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { delta } = effect.addVar;
  const evalCtx = scope;
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');
  const endpoint = resolveRuntimeScopedEndpoint(effect.addVar, evalCtx, env.mode, {
    code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
    effectType: 'addVar',
    pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
    pvarResolutionFailureMessage: 'addVar pvar selector resolution failed',
    zoneResolutionFailureMessage: 'addVar zoneVar selector resolution failed',
    context: { endpoint: effect.addVar },
  });
  const variableDef = resolveScopedVarDef(
    { def: env.def },
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

  const currentValue = readScopedIntVarValue({ state: cursor.state }, endpoint, 'addVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
  const nextValue = clampIntVarValue(currentValue + evaluatedDelta, variableDef);
  const emittedEvent = emitVarChangeArtifacts(toTraceEmissionContext(env, cursor), endpoint, currentValue, nextValue);
  if (emittedEvent === undefined) {
    return { state: cursor.state, rng: cursor.rng };
  }

  const write = toScopedVarWrite(endpoint, nextValue);
  let newState: import('./types.js').GameState;
  if (cursor.tracker) {
    writeScopedVarsMutable(cursor.state as MutableGameState, [write], cursor.tracker);
    updateVarRunningHash(cursor.state as MutableGameState, env.cachedRuntime?.zobristTable, endpoint, currentValue, nextValue);
    newState = cursor.state;
  } else {
    newState = writeScopedVarsToState(cursor.state, [write]);
  }
  return {
    state: newState,
    rng: cursor.rng,
    emittedEvents: [emittedEvent],
  };
};

export const applySetActivePlayer = (
  effect: Extract<EffectAST, { readonly setActivePlayer: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const evalCtx = scope;
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(env.mode);
  const nextActive = resolveSinglePlayerWithNormalization(effect.setActivePlayer.player, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
    effectType: 'setActivePlayer',
    scope: 'activePlayer',
    cardinalityMessage: 'setActivePlayer requires exactly one resolved player',
    resolutionFailureMessage: 'setActivePlayer selector resolution failed',
    onResolutionFailure,
    context: { endpoint: effect.setActivePlayer },
  });
  if (nextActive === cursor.state.activePlayer) {
    return { state: cursor.state, rng: cursor.rng };
  }

  if (cursor.tracker) {
    const oldActive = cursor.state.activePlayer;
    (cursor.state as MutableGameState).activePlayer = nextActive;
    const table = env.cachedRuntime?.zobristTable;
    if (table) {
      updateRunningHash(
        cursor.state as MutableGameState,
        table,
        { kind: 'activePlayer', playerId: oldActive },
        { kind: 'activePlayer', playerId: nextActive },
      );
    }
    return { state: cursor.state, rng: cursor.rng };
  }
  return {
    state: { ...cursor.state, activePlayer: nextActive },
    rng: cursor.rng,
  };
};
