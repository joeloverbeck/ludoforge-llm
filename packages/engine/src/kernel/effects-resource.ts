import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { effectRuntimeError } from './effect-error.js';
import {
  readScopedIntVarValue,
  resolveRuntimeScopedEndpointWithMalformedSupport,
  resolveScopedIntVarDef,
  writeScopedVarToBranches,
} from './scoped-var-runtime-access.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import { toTraceResourceEndpoint, toTraceVarChangePayload, toVarChangedEvent } from './scoped-var-runtime-mapping.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import type { RuntimeScopedVarEndpoint } from './scoped-var-runtime-mapping.js';
import type { PlayerId, ZoneId } from './branded.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST } from './types.js';

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

const writeResolvedEndpointValue = (
  branches: Pick<EffectContext['state'], 'globalVars' | 'perPlayerVars' | 'zoneVars'>,
  endpoint: ResolvedEndpoint,
  value: number,
): Pick<EffectContext['state'], 'globalVars' | 'perPlayerVars' | 'zoneVars'> => {
  if (endpoint.scope === 'zone') {
    return writeScopedVarToBranches(branches, endpoint, value);
  }

  return writeScopedVarToBranches(branches, endpoint, value);
};

const resolveEndpoint = (
  endpoint: TransferEndpoint,
  evalCtx: EffectContext,
  ctx: EffectContext,
): ResolvedEndpoint => {
  const runtimeEndpoint = resolveRuntimeScopedEndpointWithMalformedSupport(endpoint, evalCtx, {
    code: 'resourceRuntimeValidationFailed',
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
    const variableDef = resolveScopedIntVarDef(ctx, { scope: 'global', var: runtimeEndpoint.var }, 'transferVar', 'resourceRuntimeValidationFailed');
    return {
      scope: 'global',
      var: runtimeEndpoint.var,
      min: variableDef.min,
      max: variableDef.max,
      before: readScopedIntVarValue(ctx, resolvedEndpoint, 'transferVar', 'resourceRuntimeValidationFailed'),
    };
  }

  if (runtimeEndpoint.scope === 'pvar') {
    const resolvedEndpoint: RuntimeScopedVarEndpoint = {
      scope: 'pvar',
      var: runtimeEndpoint.var,
      player: runtimeEndpoint.player,
    };
    const perPlayerVarDef = resolveScopedIntVarDef(
      ctx,
      { scope: 'pvar', var: runtimeEndpoint.var },
      'transferVar',
      'resourceRuntimeValidationFailed',
    );
    return {
      scope: 'pvar',
      var: runtimeEndpoint.var,
      player: runtimeEndpoint.player,
      min: perPlayerVarDef.min,
      max: perPlayerVarDef.max,
      before: readScopedIntVarValue(ctx, resolvedEndpoint, 'transferVar', 'resourceRuntimeValidationFailed'),
    };
  }

  const resolvedEndpoint: RuntimeScopedVarEndpoint = {
    scope: 'zone',
    var: runtimeEndpoint.var,
    zone: runtimeEndpoint.zone,
  };
  const zoneVarDef = resolveScopedIntVarDef(
    ctx,
    { scope: 'zoneVar', var: runtimeEndpoint.var },
    'transferVar',
    'resourceRuntimeValidationFailed',
  );
  return {
    scope: 'zone',
    var: runtimeEndpoint.var,
    zone: runtimeEndpoint.zone,
    min: zoneVarDef.min,
    max: zoneVarDef.max,
    before: readScopedIntVarValue(ctx, resolvedEndpoint, 'transferVar', 'resourceRuntimeValidationFailed'),
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
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const source = resolveEndpoint(effect.transferVar.from, evalCtx, ctx);
  const destination = resolveEndpoint(effect.transferVar.to, evalCtx, ctx);

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
  const sourceVarChange = toTraceVarChangePayload(source, source.before, sourceAfter);
  const destinationVarChange = toTraceVarChangePayload(destination, destination.before, destinationAfter);

  emitTrace(ctx.collector, {
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
  emitVarChangeTraceIfChanged(ctx, { ...sourceVarChange, provenance });
  emitVarChangeTraceIfChanged(ctx, { ...destinationVarChange, provenance });

  let branches = {
    globalVars: ctx.state.globalVars,
    perPlayerVars: ctx.state.perPlayerVars,
    zoneVars: ctx.state.zoneVars,
  };
  branches = writeResolvedEndpointValue(branches, source, sourceAfter);
  branches = writeResolvedEndpointValue(branches, destination, destinationAfter);

  return {
    state: {
      ...ctx.state,
      globalVars: branches.globalVars,
      perPlayerVars: branches.perPlayerVars,
      zoneVars: branches.zoneVars,
    },
    rng: ctx.rng,
    emittedEvents: [
      toVarChangedEvent(source, source.before, sourceAfter),
      toVarChangedEvent(destination, destination.before, destinationAfter),
    ],
    ...(resolvedBindings === undefined ? {} : { bindings: resolvedBindings }),
  };
};
