import type { EffectTraceForEach, EffectTraceProvenance, EffectTraceReduce } from './types.js';

export const buildForEachTraceEntry = (params: {
  readonly bind: string;
  readonly matchCount: number;
  readonly iteratedCount: number;
  readonly explicitLimit: boolean;
  readonly resolvedLimit: number;
  readonly provenance: EffectTraceProvenance;
}): EffectTraceForEach => ({
  kind: 'forEach',
  bind: params.bind,
  matchCount: params.matchCount,
  iteratedCount: params.iteratedCount,
  provenance: params.provenance,
  ...(params.explicitLimit ? { limit: params.resolvedLimit } : {}),
});

export const buildReduceTraceEntry = (params: {
  readonly itemBind: string;
  readonly accBind: string;
  readonly resultBind: string;
  readonly matchCount: number;
  readonly iteratedCount: number;
  readonly explicitLimit: boolean;
  readonly resolvedLimit: number;
  readonly provenance: EffectTraceProvenance;
}): EffectTraceReduce => ({
  kind: 'reduce',
  itemBind: params.itemBind,
  accBind: params.accBind,
  resultBind: params.resultBind,
  matchCount: params.matchCount,
  iteratedCount: params.iteratedCount,
  provenance: params.provenance,
  ...(params.explicitLimit ? { limit: params.resolvedLimit } : {}),
});
