import type { EffectContext } from './effect-context.js';
import type { EffectTraceProvenance } from './types.js';

export const resolveTraceProvenance = (
  ctx: Pick<EffectContext, 'state' | 'traceContext' | 'effectPath'>,
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
): EffectContext => ({
  ...ctx,
  effectPath: `${ctx.effectPath ?? ''}${suffix}`,
});
