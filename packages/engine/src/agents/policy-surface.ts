import { buildAdjacencyGraph } from '../kernel/spatial.js';
import { buildRuntimeTableIndex } from '../kernel/runtime-table-index.js';
import { createEvalContext, createEvalRuntimeResources } from '../kernel/eval-context.js';
import { evalValue } from '../kernel/eval-value.js';
import type {
  AgentPolicySurfaceVisibilityClass,
  CompiledAgentPolicyRef,
  CompiledAgentPolicySurfaceCatalog,
  CompiledAgentPolicySurfaceVisibility,
  GameDef,
  GameState,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';

export interface PolicyVictorySurface {
  readonly marginBySeat: ReadonlyMap<string, number>;
  readonly rankBySeat: ReadonlyMap<string, number>;
}

export interface ResolvedPolicySurfaceRef extends Extract<CompiledAgentPolicyRef, { readonly kind: 'surface' }> {
  readonly visibility: CompiledAgentPolicySurfaceVisibility;
}

export function parseAuthoredPolicySurfaceRef(
  catalog: CompiledAgentPolicySurfaceCatalog,
  refPath: string,
  phase: 'current' | 'preview',
): ResolvedPolicySurfaceRef | null {
  if (refPath.startsWith('var.global.')) {
    const variableId = refPath.slice('var.global.'.length);
    const visibility = catalog.globalVars[variableId];
    return visibility === undefined ? null : {
      kind: 'surface',
      phase,
      family: 'globalVar',
      id: variableId,
      visibility,
    };
  }

  if (refPath.startsWith('var.seat.')) {
    const parts = refPath.split('.');
    if (parts.length !== 4) {
      return null;
    }
    const seatToken = parts[2];
    const variableId = parts[3];
    if (seatToken === undefined || variableId === undefined) {
      return null;
    }
    const visibility = catalog.perPlayerVars[variableId];
    return visibility === undefined ? null : {
      kind: 'surface',
      phase,
      family: 'perPlayerVar',
      id: variableId,
      seatToken,
      visibility,
    };
  }

  if (refPath.startsWith('metric.')) {
    const metricId = refPath.slice('metric.'.length);
    const visibility = catalog.derivedMetrics[metricId];
    return visibility === undefined ? null : {
      kind: 'surface',
      phase,
      family: 'derivedMetric',
      id: metricId,
      visibility,
    };
  }

  if (refPath.startsWith('victory.currentMargin.')) {
    const seatToken = refPath.slice('victory.currentMargin.'.length);
    if (seatToken.length === 0) {
      return null;
    }
    return {
      kind: 'surface',
      phase,
      family: 'victoryCurrentMargin',
      id: 'currentMargin',
      seatToken,
      visibility: catalog.victory.currentMargin,
    };
  }

  if (refPath.startsWith('victory.currentRank.')) {
    const seatToken = refPath.slice('victory.currentRank.'.length);
    if (seatToken.length === 0) {
      return null;
    }
    return {
      kind: 'surface',
      phase,
      family: 'victoryCurrentRank',
      id: 'currentRank',
      seatToken,
      visibility: catalog.victory.currentRank,
    };
  }

  return null;
}

export function getPolicySurfaceVisibility(
  catalog: CompiledAgentPolicySurfaceCatalog,
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'surface' }>,
): CompiledAgentPolicySurfaceVisibility | null {
  switch (ref.family) {
    case 'globalVar':
      return catalog.globalVars[ref.id] ?? null;
    case 'perPlayerVar':
      return catalog.perPlayerVars[ref.id] ?? null;
    case 'derivedMetric':
      return catalog.derivedMetrics[ref.id] ?? null;
    case 'victoryCurrentMargin':
      return catalog.victory.currentMargin;
    case 'victoryCurrentRank':
      return catalog.victory.currentRank;
  }
}

export function isSurfaceVisibilityAccessible(
  visibility: AgentPolicySurfaceVisibilityClass,
  actingSeatId: string,
  resolvedSeatId?: string,
): boolean {
  switch (visibility) {
    case 'public':
      return true;
    case 'seatVisible':
      return resolvedSeatId === actingSeatId;
    case 'hidden':
      return false;
  }
}

export function resolvePolicySeatToken(
  def: GameDef | undefined,
  state: GameState,
  seatToken: string,
  actingSeatId: string,
): string {
  if (seatToken === 'self') {
    return actingSeatId;
  }
  if (seatToken === 'active') {
    return def?.seats?.[state.activePlayer]?.id ?? actingSeatId;
  }
  return seatToken;
}

export function buildPolicyVictorySurface(
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): PolicyVictorySurface {
  const margins = def.terminal.margins ?? [];
  const adjacencyGraph = runtime?.adjacencyGraph ?? buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(def);
  const resources = createEvalRuntimeResources();
  const evalContext = createEvalContext({
    def,
    adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: {},
    runtimeTableIndex,
    resources,
  });

  const rows = margins.map((marginDef) => {
    const margin = evalValue(marginDef.value, evalContext);
    if (typeof margin !== 'number') {
      throw new Error(`Victory margin "${marginDef.seat}" did not evaluate to a number.`);
    }
    return { seat: marginDef.seat, margin };
  });

  const order = def.terminal.ranking?.order ?? 'desc';
  const tieBreakOrder = def.terminal.ranking?.tieBreakOrder ?? [];
  const tieBreakIndex = new Map(tieBreakOrder.map((seat, index): readonly [string, number] => [seat, index]));
  rows.sort((left, right) => {
    if (left.margin !== right.margin) {
      return order === 'desc' ? right.margin - left.margin : left.margin - right.margin;
    }
    const leftOrder = tieBreakIndex.get(left.seat) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = tieBreakIndex.get(right.seat) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.seat.localeCompare(right.seat);
  });

  const marginBySeat = new Map<string, number>();
  const rankBySeat = new Map<string, number>();
  rows.forEach((row, index) => {
    marginBySeat.set(row.seat, row.margin);
    rankBySeat.set(row.seat, index + 1);
  });
  return { marginBySeat, rankBySeat };
}
