import type { EffectTraceForEach, EffectTraceProvenance, EffectTraceReduce, MacroOrigin } from './types.js';

export const buildForEachTraceEntry = (params: {
  readonly bind: string;
  readonly macroOrigin?: MacroOrigin;
  readonly matchCount: number;
  readonly iteratedCount: number;
  readonly explicitLimit: boolean;
  readonly resolvedLimit: number;
  readonly provenance: EffectTraceProvenance;
}): EffectTraceForEach => ({
  kind: 'forEach',
  bind: params.bind,
  ...(params.macroOrigin === undefined ? {} : { macroOrigin: params.macroOrigin }),
  matchCount: params.matchCount,
  iteratedCount: params.iteratedCount,
  provenance: params.provenance,
  ...(params.explicitLimit ? { limit: params.resolvedLimit } : {}),
});

export const buildReduceTraceEntry = (params: {
  readonly itemBind: string;
  readonly accBind: string;
  readonly resultBind: string;
  readonly itemMacroOrigin?: MacroOrigin;
  readonly accMacroOrigin?: MacroOrigin;
  readonly resultMacroOrigin?: MacroOrigin;
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
  ...(params.itemMacroOrigin === undefined ? {} : { itemMacroOrigin: params.itemMacroOrigin }),
  ...(params.accMacroOrigin === undefined ? {} : { accMacroOrigin: params.accMacroOrigin }),
  ...(params.resultMacroOrigin === undefined ? {} : { resultMacroOrigin: params.resultMacroOrigin }),
  matchCount: params.matchCount,
  iteratedCount: params.iteratedCount,
  provenance: params.provenance,
  ...(params.explicitLimit ? { limit: params.resolvedLimit } : {}),
});
