import { buildAdjacencyGraph } from '../kernel/spatial.js';
import { buildRuntimeTableIndex } from '../kernel/runtime-table-index.js';
import { createEvalContext, createEvalRuntimeResources } from '../kernel/eval-context.js';
import { evalValue } from '../kernel/eval-value.js';
import type {
  AgentPolicySurfaceVisibilityClass,
  CompiledAgentPolicySurfaceRef,
  CompiledAgentPolicySurfaceCatalog,
  CompiledAgentPolicySurfaceSelector,
  CompiledAgentPolicySurfaceVisibility,
  GameDef,
  GameState,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';

export interface PolicyVictorySurface {
  readonly marginBySeat: ReadonlyMap<string, number>;
  readonly rankBySeat: ReadonlyMap<string, number>;
}

export type ResolvedPolicySurfaceRef = CompiledAgentPolicySurfaceRef & {
  readonly visibility: CompiledAgentPolicySurfaceVisibility;
};

export function parseAuthoredPolicySurfaceRef(
  catalog: CompiledAgentPolicySurfaceCatalog,
  refPath: string,
  scope: 'current' | 'preview',
): ResolvedPolicySurfaceRef | null {
  const kind: CompiledAgentPolicySurfaceRef['kind'] = scope === 'preview' ? 'previewSurface' : 'currentSurface';
  if (refPath.startsWith('var.global.')) {
    const variableId = refPath.slice('var.global.'.length);
    const visibility = catalog.globalVars[variableId];
    return visibility === undefined ? null : {
      kind,
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
      kind,
      family: 'perPlayerVar',
      id: variableId,
      selector: {
        kind: 'role',
        seatToken,
      },
      visibility,
    };
  }

  if (refPath.startsWith('var.player.')) {
    const parts = refPath.split('.');
    if (parts.length !== 4) {
      return null;
    }
    const playerSelector = parts[2];
    const variableId = parts[3];
    if ((playerSelector !== 'self' && playerSelector !== 'active') || variableId === undefined) {
      return null;
    }
    const visibility = catalog.perPlayerVars[variableId];
    return visibility === undefined ? null : {
      kind,
      family: 'perPlayerVar',
      id: variableId,
      selector: {
        kind: 'player',
        player: playerSelector,
      },
      visibility,
    };
  }

  if (refPath.startsWith('metric.')) {
    const metricId = refPath.slice('metric.'.length);
    const visibility = catalog.derivedMetrics[metricId];
    return visibility === undefined ? null : {
      kind,
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
      kind,
      family: 'victoryCurrentMargin',
      id: 'currentMargin',
      selector: {
        kind: 'role',
        seatToken,
      },
      visibility: catalog.victory.currentMargin,
    };
  }

  if (refPath.startsWith('victory.currentRank.')) {
    const seatToken = refPath.slice('victory.currentRank.'.length);
    if (seatToken.length === 0) {
      return null;
    }
    return {
      kind,
      family: 'victoryCurrentRank',
      id: 'currentRank',
      selector: {
        kind: 'role',
        seatToken,
      },
      visibility: catalog.victory.currentRank,
    };
  }

  if (refPath === 'activeCard.id') {
    return {
      kind,
      family: 'activeCardIdentity',
      id: 'id',
      visibility: catalog.activeCardIdentity,
    };
  }

  if (refPath === 'activeCard.deckId') {
    return {
      kind,
      family: 'activeCardIdentity',
      id: 'deckId',
      visibility: catalog.activeCardIdentity,
    };
  }

  if (refPath.startsWith('activeCard.hasTag.')) {
    const tagName = refPath.slice('activeCard.hasTag.'.length);
    if (tagName.length === 0) {
      return null;
    }
    return {
      kind,
      family: 'activeCardTag',
      id: tagName,
      visibility: catalog.activeCardTag,
    };
  }

  if (refPath.startsWith('activeCard.metadata.')) {
    const metadataKey = refPath.slice('activeCard.metadata.'.length);
    if (metadataKey.length === 0) {
      return null;
    }
    return {
      kind,
      family: 'activeCardMetadata',
      id: metadataKey,
      visibility: catalog.activeCardMetadata,
    };
  }

  return null;
}

export function getPolicySurfaceVisibility(
  catalog: CompiledAgentPolicySurfaceCatalog,
  ref: CompiledAgentPolicySurfaceRef,
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
    case 'activeCardIdentity':
      return catalog.activeCardIdentity;
    case 'activeCardTag':
      return catalog.activeCardTag;
    case 'activeCardMetadata':
      return catalog.activeCardMetadata;
  }
}

export function isSurfaceVisibilityAccessible(
  visibility: AgentPolicySurfaceVisibilityClass,
  actingSeatId: string,
  resolvedSeatId?: string,
  actingPlayerIndex?: number,
  resolvedPlayerIndex?: number,
): boolean {
  switch (visibility) {
    case 'public':
      return true;
    case 'seatVisible':
      if (actingPlayerIndex !== undefined && resolvedPlayerIndex !== undefined) {
        return actingPlayerIndex === resolvedPlayerIndex;
      }
      return resolvedSeatId === actingSeatId;
    case 'hidden':
      return false;
  }
}

export function resolvePolicyRoleSelector(
  def: GameDef | undefined,
  state: GameState,
  selector: Extract<CompiledAgentPolicySurfaceSelector, { readonly kind: 'role' }>,
  actingSeatId: string,
): string {
  const { seatToken } = selector;
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
