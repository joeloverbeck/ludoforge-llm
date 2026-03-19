import type {
  AgentPolicySurfaceVisibilityClass,
  CompiledAgentPolicyRef,
  CompiledAgentPolicySurfaceCatalog,
  CompiledAgentPolicySurfaceVisibility,
} from '../kernel/types.js';

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
