import type {
  AgentPolicySurfaceVisibilityClass,
  CompiledAgentPolicySurfaceCatalog,
  CompiledAgentPolicySurfaceVisibility,
} from '../kernel/types.js';

export interface ResolvedPolicySurfaceRef {
  readonly type: 'number';
  readonly family: 'globalVar' | 'perPlayerVar' | 'derivedMetric' | 'victoryCurrentMargin' | 'victoryCurrentRank';
  readonly id: string;
  readonly seatToken?: string;
  readonly visibility: CompiledAgentPolicySurfaceVisibility;
}

export function resolvePolicySurfaceRef(
  catalog: CompiledAgentPolicySurfaceCatalog,
  refPath: string,
): ResolvedPolicySurfaceRef | null {
  if (refPath.startsWith('var.global.')) {
    const variableId = refPath.slice('var.global.'.length);
    const visibility = catalog.globalVars[variableId];
    return visibility === undefined ? null : {
      type: 'number',
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
      type: 'number',
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
      type: 'number',
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
      type: 'number',
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
      type: 'number',
      family: 'victoryCurrentRank',
      id: 'currentRank',
      seatToken,
      visibility: catalog.victory.currentRank,
    };
  }

  return null;
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
