import { emitTrace } from './execution-collector.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import type { PlayerId } from './branded.js';
import type { EffectContext } from './effect-context.js';
import type { EffectTraceProvenance, VariableValue } from './types.js';

type GlobalVarChangeTrace = {
  readonly scope: 'global';
  readonly varName: string;
  readonly oldValue: VariableValue;
  readonly newValue: VariableValue;
  readonly provenance?: EffectTraceProvenance;
};

type PerPlayerVarChangeTrace = {
  readonly scope: 'perPlayer';
  readonly player: PlayerId;
  readonly varName: string;
  readonly oldValue: VariableValue;
  readonly newValue: VariableValue;
  readonly provenance?: EffectTraceProvenance;
};

type ZoneVarChangeTrace = {
  readonly scope: 'zone';
  readonly zone: string;
  readonly varName: string;
  readonly oldValue: VariableValue;
  readonly newValue: VariableValue;
  readonly provenance?: EffectTraceProvenance;
};

export const emitVarChangeTraceIfChanged = (
  ctx: Pick<EffectContext, 'collector' | 'state' | 'traceContext' | 'effectPath'>,
  entry: GlobalVarChangeTrace | PerPlayerVarChangeTrace | ZoneVarChangeTrace,
): boolean => {
  if (entry.oldValue === entry.newValue) {
    return false;
  }

  emitTrace(ctx.collector, {
    kind: 'varChange',
    scope: entry.scope,
    ...(entry.scope === 'perPlayer' ? { player: entry.player } : {}),
    ...(entry.scope === 'zone' ? { zone: entry.zone } : {}),
    varName: entry.varName,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    provenance: entry.provenance ?? resolveTraceProvenance(ctx),
  });

  return true;
};
