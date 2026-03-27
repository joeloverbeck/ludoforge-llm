import type { EffectContext, TraceProvenanceContext } from './effect-context.js';
import type { EffectTraceProvenance } from './types.js';

export const resolveTraceProvenance = (
  ctx: TraceProvenanceContext,
): EffectTraceProvenance => {
  const traceContext = ctx.traceContext ?? {
    eventContext: 'actionEffect' as const,
    effectPathRoot: 'effects',
  };
  return {
    phase: String(ctx.state.currentPhase),
    eventContext: traceContext.eventContext,
    ...(traceContext.actionId === undefined ? {} : { actionId: traceContext.actionId }),
    effectPath: `${traceContext.effectPathRoot}${ctx.effectPath ?? ''}`,
  };
};

export const withTracePath = (
  ctx: EffectContext,
  suffix: string,
): EffectContext => {
  // Fast path: skip the costly full-context spread when tracing is disabled.
  // The effectPath field is only consumed by trace emission and resolveTraceProvenance.
  if (ctx.collector.trace === null && ctx.collector.conditionTrace === null) {
    return ctx;
  }
  return {
    ...ctx,
    effectPath: `${ctx.effectPath ?? ''}${suffix}`,
  };
};
