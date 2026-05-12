import type { CompiledPolicyExpr, GameDef, GameState } from '../kernel/index.js';
import {
  buildPolicyVictorySurface,
  resolvePolicyRoleSelector,
} from './policy-surface.js';
import {
  findPolicyWasmPreviewMarkerDefault,
  materializePolicyWasmPreviewState,
  policyWasmPreviewMarkerKey,
  type PolicyWasmPreviewZoneValues,
  type PolicyWasmPreviewZoneVarValues,
} from './policy-wasm-production-preview-values.js';

export interface PolicyWasmPreviewFeatureSlot { readonly slotIndex: number; readonly featureId: string; }
export interface PolicyWasmPreviewSurfaceSlot {
  readonly slotIndex: number;
  readonly family: 'victoryCurrentMargin' | 'victoryCurrentRank';
  readonly seatToken: string;
}

export interface PolicyWasmPreviewFeatureEvalState {
  readonly slotValues: readonly number[];
  readonly markerValues: ReadonlyMap<string, string>;
}

export interface PolicyWasmPreviewSurfaceEvalState extends PolicyWasmPreviewFeatureEvalState {
  readonly zoneVarValues: PolicyWasmPreviewZoneVarValues;
  readonly zoneValues: PolicyWasmPreviewZoneValues;
}

const parsePolicyWasmPreviewSurfaceSlot = (
  slot: string,
  slotIndex: number,
): PolicyWasmPreviewSurfaceSlot | undefined => {
  const prefix = 'surface.';
  if (!slot.startsWith(prefix)) {
    return undefined;
  }
  const [family, seatToken] = slot.slice(prefix.length).split('.');
  return (
    (family === 'victoryCurrentMargin' || family === 'victoryCurrentRank')
    && seatToken !== undefined
    && seatToken.length > 0
  )
    ? { slotIndex, family, seatToken }
    : undefined;
};

export const classifyPolicyWasmPreviewStateSlots = (
  previewStateSlots: readonly string[],
  parseGlobalSlot: (slot: string) => string | null,
): {
  readonly slotIndexByGlobalVar: Map<string, number>;
  readonly featureSlots: readonly PolicyWasmPreviewFeatureSlot[];
  readonly surfaceSlots: readonly PolicyWasmPreviewSurfaceSlot[];
  readonly unsupportedSlot?: string;
} => {
  const slotIndexByGlobalVar = new Map<string, number>();
  const featureSlots: PolicyWasmPreviewFeatureSlot[] = [];
  const surfaceSlots: PolicyWasmPreviewSurfaceSlot[] = [];
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
    const surfaceSlot = parsePolicyWasmPreviewSurfaceSlot(slot, index);
    if (surfaceSlot !== undefined) {
      surfaceSlots.push(surfaceSlot);
      continue;
    }
    return { slotIndexByGlobalVar, featureSlots, surfaceSlots, unsupportedSlot: slot };
  }
  return { slotIndexByGlobalVar, featureSlots, surfaceSlots };
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

export const evalPolicyWasmPreviewSurfaceSlot = (
  surfaceSlot: PolicyWasmPreviewSurfaceSlot,
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly originSeatId: string;
  },
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: PolicyWasmPreviewSurfaceEvalState,
): number | undefined => {
  const globalVars = { ...input.state.globalVars };
  for (const [globalVar, slotIndex] of slotIndexByGlobalVar) {
    globalVars[globalVar] = state.slotValues[slotIndex] ?? 0;
  }
  const previewState = materializePolicyWasmPreviewState(
    input.state,
    state.zoneValues,
    state.zoneVarValues,
    state.markerValues,
    globalVars,
  );
  const resolvedSeatId = resolvePolicyRoleSelector(
    input.def,
    previewState,
    { kind: 'role', seatToken: surfaceSlot.seatToken },
    input.originSeatId,
  );
  if (resolvedSeatId === undefined) {
    return undefined;
  }
  const victorySurface = buildPolicyVictorySurface(input.def, previewState);
  return surfaceSlot.family === 'victoryCurrentMargin'
    ? victorySurface.marginBySeat.get(resolvedSeatId)
    : victorySurface.rankBySeat.get(resolvedSeatId);
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
