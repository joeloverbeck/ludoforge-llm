import type { CompiledPolicyExpr, GameDef, GameState } from '../kernel/index.js';
import {
  findPolicyWasmPreviewMarkerDefault,
  policyWasmPreviewMarkerKey,
} from './policy-wasm-production-preview-values.js';

export interface PolicyWasmPreviewFeatureSlot { readonly slotIndex: number; readonly featureId: string; }

export interface PolicyWasmPreviewFeatureEvalState {
  readonly slotValues: readonly number[];
  readonly markerValues: ReadonlyMap<string, string>;
}

export const classifyPolicyWasmPreviewStateSlots = (
  previewStateSlots: readonly string[],
  parseGlobalSlot: (slot: string) => string | null,
): {
  readonly slotIndexByGlobalVar: Map<string, number>;
  readonly featureSlots: readonly PolicyWasmPreviewFeatureSlot[];
  readonly unsupportedSlot?: string;
} => {
  const slotIndexByGlobalVar = new Map<string, number>();
  const featureSlots: PolicyWasmPreviewFeatureSlot[] = [];
  for (const [index, slot] of previewStateSlots.entries()) {
    const globalVar = parseGlobalSlot(slot);
    if (globalVar !== null) {
      slotIndexByGlobalVar.set(globalVar, index);
      continue;
    }
    if (slot.startsWith('feature.') && slot.length > 'feature.'.length) {
      featureSlots.push({ slotIndex: index, featureId: slot.slice('feature.'.length) });
      continue;
    }
    return { slotIndexByGlobalVar, featureSlots, unsupportedSlot: slot };
  }
  return { slotIndexByGlobalVar, featureSlots };
};

export const evalPolicyWasmPreviewStateFeature = (
  featureId: string,
  def: GameDef,
  rootState: GameState,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: PolicyWasmPreviewFeatureEvalState,
): number | undefined => {
  const feature = def.agents?.compiled.stateFeatures[featureId];
  const value = feature === undefined
    ? undefined
    : evalCompiledPreviewExpr(feature.expr, def, rootState, slotIndexByGlobalVar, state);
  return typeof value === 'number' ? value : undefined;
};

const evalCompiledPreviewExpr = (
  expr: CompiledPolicyExpr,
  def: GameDef,
  rootState: GameState,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: PolicyWasmPreviewFeatureEvalState,
): number | string | boolean | undefined => {
  if (expr.kind === 'literal') {
    return typeof expr.value === 'number' || typeof expr.value === 'string' || typeof expr.value === 'boolean'
      ? expr.value
      : undefined;
  }
  if (expr.kind === 'ref') {
    const ref = expr.ref;
    if (ref.kind === 'currentSurface' && ref.family === 'globalVar') {
      const slotIndex = slotIndexByGlobalVar.get(ref.id);
      return slotIndex === undefined ? rootState.globalVars[ref.id] : state.slotValues[slotIndex];
    }
    if (ref.kind === 'currentSurface' && ref.family === 'globalMarker') {
      return state.markerValues.get(policyWasmPreviewMarkerKey('__global__', ref.id))
        ?? rootState.globalMarkers?.[ref.id]
        ?? findPolicyWasmPreviewMarkerDefault(def, ref.id)
        ?? '';
    }
    return undefined;
  }
  if (expr.kind !== 'op') {
    return undefined;
  }
  const args = expr.args.map((arg) => evalCompiledPreviewExpr(arg, def, rootState, slotIndexByGlobalVar, state));
  switch (expr.op) {
    case 'add':
      return args.every((arg): arg is number => typeof arg === 'number')
        ? args.reduce((total, arg) => total + arg, 0)
        : undefined;
    case 'eq':
      return args.length === 2 ? args[0] === args[1] : undefined;
    case 'boolToNumber':
      return typeof args[0] === 'boolean' ? (args[0] ? 1 : 0) : undefined;
    default:
      return undefined;
  }
};
