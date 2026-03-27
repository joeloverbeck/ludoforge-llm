import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { effectRuntimeError } from './effect-error.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import {
  readScopedIntVarValue,
  resolveRuntimeScopedEndpointWithMalformedSupport,
  resolveScopedIntVarDef,
  toScopedVarWrite,
  writeScopedVarsMutable,
  writeScopedVarsToState,
} from './scoped-var-runtime-access.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import { toTraceResourceEndpoint, toTraceVarChangePayload, toVarChangedEvent } from './scoped-var-runtime-mapping.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import { updateVarRunningHash } from './zobrist-var-hash.js';
import { mergeToEvalContext, mergeToReadContext, toTraceEmissionContext } from './effect-context.js';
import type { RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import type { PlayerId, ZoneId } from './branded.js';
import type { ReadContext } from './eval-context.js';
import type { EffectCursor, EffectEnv, PartialEffectResult } from './effect-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';
import type { MutableGameState } from './state-draft.js';
import type { EffectAST, EffectTraceProvenance } from './types.js';

const expectInteger = (
  value: unknown,
  effectType: 'transferVar',
  field: 'amount' | 'min' | 'max',
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED, `${effectType}.${field} must evaluate to a finite safe integer`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const withActualBind = (
  bindings: Readonly<Record<string, unknown>>,
  actualBind: string | undefined,
  actual: number,
): Readonly<Record<string, unknown>> | undefined => {
  if (actualBind === undefined) {
    return undefined;
  }

  return {
    ...bindings,
    [actualBind]: actual,
  };
};

type TransferEndpoint = Extract<EffectAST, { readonly transferVar: unknown }>['transferVar']['from'];

type ResolvedEndpoint =
  | {
      readonly scope: 'global';
      readonly var: string;
      readonly min: number;
      readonly max: number;
      readonly before: number;
    }
  | {
      readonly scope: 'pvar';
      readonly var: string;
      readonly player: PlayerId;
      readonly min: number;
      readonly max: number;
      readonly before: number;
    }
  | {
      readonly scope: 'zone';
      readonly var: string;
      readonly zone: ZoneId;
      readonly min: number;
      readonly max: number;
      readonly before: number;
    };

type ResourceReadContext = Pick<ReadContext, 'def' | 'state'>;
const resolveResourceTraceProvenance = (traceCtx: ReturnType<typeof toTraceEmissionContext>): EffectTraceProvenance =>
  resolveTraceProvenance(traceCtx);

const resolveEndpoint = (
  endpoint: TransferEndpoint,
  evalCtx: ReadContext,
  readCtx: ResourceReadContext,
  mode: EffectEnv['mode'],
): ResolvedEndpoint => {
  const runtimeEndpoint = resolveRuntimeScopedEndpointWithMalformedSupport(endpoint, evalCtx, mode, {
    code: EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED,
    effectType: 'transferVar',
    pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
    pvarResolutionFailureMessage: 'transferVar pvar endpoint resolution failed',
    zoneResolutionFailureMessage: 'transferVar zoneVar endpoint resolution failed',
    pvarMissingSelectorMessage: 'transferVar pvar endpoint requires player selector',
    zoneMissingSelectorMessage: 'transferVar zoneVar endpoint requires zone selector',
    context: { endpoint },
  });

  if (runtimeEndpoint.scope === 'global') {
    const resolvedEndpoint: RuntimeScopedVarEndpoint = {
      scope: 'global',
      var: runtimeEndpoint.var,
    };
    const variableDef = resolveScopedIntVarDef(readCtx, { scope: 'global', var: runtimeEndpoint.var }, 'transferVar', EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED);
    return {
      scope: 'global',
      var: runtimeEndpoint.var,
      min: variableDef.min,
      max: variableDef.max,
      before: readScopedIntVarValue(readCtx, resolvedEndpoint, 'transferVar', EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED),
    };
  }

  if (runtimeEndpoint.scope === 'pvar') {
    const resolvedEndpoint: RuntimeScopedVarEndpoint = {
      scope: 'pvar',
      var: runtimeEndpoint.var,
      player: runtimeEndpoint.player,
    };
    const perPlayerVarDef = resolveScopedIntVarDef(
      readCtx,
      { scope: 'pvar', var: runtimeEndpoint.var },
      'transferVar',
      EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED,
    );
    return {
      scope: 'pvar',
      var: runtimeEndpoint.var,
      player: runtimeEndpoint.player,
      min: perPlayerVarDef.min,
      max: perPlayerVarDef.max,
      before: readScopedIntVarValue(readCtx, resolvedEndpoint, 'transferVar', EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED),
    };
  }

  const resolvedEndpoint: RuntimeScopedVarEndpoint = {
    scope: 'zone',
    var: runtimeEndpoint.var,
    zone: runtimeEndpoint.zone,
  };
  const zoneVarDef = resolveScopedIntVarDef(
    readCtx,
    { scope: 'zoneVar', var: runtimeEndpoint.var },
    'transferVar',
    EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED,
  );
  return {
    scope: 'zone',
    var: runtimeEndpoint.var,
    zone: runtimeEndpoint.zone,
    min: zoneVarDef.min,
    max: zoneVarDef.max,
    before: readScopedIntVarValue(readCtx, resolvedEndpoint, 'transferVar', EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED),
  };
};

const isSameCell = (from: ResolvedEndpoint, to: ResolvedEndpoint): boolean => {
  if (from.scope !== to.scope || from.var !== to.var) {
    return false;
  }

  if (from.scope === 'global') {
    return true;
  }

  if (from.scope === 'pvar') {
    return to.scope === 'pvar' && from.player === to.player;
  }

  return to.scope === 'zone' && from.zone === to.zone;
};

export const applyTransferVar = (
  effect: Extract<EffectAST, { readonly transferVar: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const evalCtx = mergeToEvalContext(env, cursor);
  const readCtx = mergeToReadContext(env, cursor);
  const traceCtx = toTraceEmissionContext(env, cursor);
  const source = resolveEndpoint(effect.transferVar.from, evalCtx, readCtx, env.mode);
  const destination = resolveEndpoint(effect.transferVar.to, evalCtx, readCtx, env.mode);

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

  const actualBindBindings = withActualBind(cursor.bindings, effect.transferVar.actualBind, actual);

  if (actual === 0 || isSameCell(source, destination)) {
    return {
      state: cursor.state,
      rng: cursor.rng,
      emittedEvents: [],
      ...(actualBindBindings === undefined ? {} : { bindings: actualBindBindings }),
    };
  }

  const sourceAfter = source.before - actual;
  const destinationAfter = destination.before + actual;
  const provenance = resolveResourceTraceProvenance(traceCtx);
  const sourceVarChange = toTraceVarChangePayload(source, source.before, sourceAfter);
  const destinationVarChange = toTraceVarChangePayload(destination, destination.before, destinationAfter);

  emitTrace(env.collector, {
    kind: 'resourceTransfer',
    from: toTraceResourceEndpoint(source),
    to: toTraceResourceEndpoint(destination),
    requestedAmount,
    actualAmount: actual,
    sourceAvailable,
    destinationHeadroom,
    ...(minAmount === undefined ? {} : { minAmount }),
    ...(maxAmount === undefined ? {} : { maxAmount }),
    provenance,
  });
  emitVarChangeTraceIfChanged(traceCtx, { ...sourceVarChange, provenance });
  emitVarChangeTraceIfChanged(traceCtx, { ...destinationVarChange, provenance });

  const writes = [
    toScopedVarWrite(source, sourceAfter),
    toScopedVarWrite(destination, destinationAfter),
  ];

  let nextState: import('./types.js').GameState;
  if (cursor.tracker) {
    writeScopedVarsMutable(cursor.state as MutableGameState, writes, cursor.tracker);
    const table = env.cachedRuntime?.zobristTable;
    updateVarRunningHash(cursor.state as MutableGameState, table, source, source.before, sourceAfter);
    updateVarRunningHash(cursor.state as MutableGameState, table, destination, destination.before, destinationAfter);
    nextState = cursor.state;
  } else {
    nextState = writeScopedVarsToState(cursor.state, writes);
  }

  return {
    state: nextState,
    rng: cursor.rng,
    emittedEvents: [
      toVarChangedEvent(source, source.before, sourceAfter),
      toVarChangedEvent(destination, destination.before, destinationAfter),
    ],
    ...(actualBindBindings === undefined ? {} : { bindings: actualBindBindings }),
  };
};
