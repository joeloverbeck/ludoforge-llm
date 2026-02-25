import { emitTrace } from './execution-collector.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import type { EffectContext } from './effect-context.js';
import type { EffectTraceProvenance, EffectTraceVarChange } from './types.js';

type WithOptionalProvenance<T> = Omit<T, 'kind' | 'provenance'> & {
  readonly provenance?: EffectTraceProvenance;
};
type VarChangeTraceInput =
  | WithOptionalProvenance<Extract<EffectTraceVarChange, { readonly scope: 'global' }>>
  | WithOptionalProvenance<Extract<EffectTraceVarChange, { readonly scope: 'perPlayer' }>>
  | WithOptionalProvenance<Extract<EffectTraceVarChange, { readonly scope: 'zone' }>>;

export const emitVarChangeTraceIfChanged = (
  ctx: Pick<EffectContext, 'collector' | 'state' | 'traceContext' | 'effectPath'>,
  entry: VarChangeTraceInput,
): boolean => {
  if (entry.oldValue === entry.newValue) {
    return false;
  }

  const provenance = entry.provenance ?? resolveTraceProvenance(ctx);
  if (entry.scope === 'global') {
    emitTrace(ctx.collector, {
      kind: 'varChange',
      scope: 'global',
      varName: entry.varName,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      provenance,
    });
    return true;
  }

  if (entry.scope === 'perPlayer') {
    emitTrace(ctx.collector, {
      kind: 'varChange',
      scope: 'perPlayer',
      player: entry.player,
      varName: entry.varName,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      provenance,
    });
    return true;
  }

  emitTrace(ctx.collector, {
    kind: 'varChange',
    scope: 'zone',
    zone: entry.zone,
    varName: entry.varName,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    provenance,
  });

  return true;
};
