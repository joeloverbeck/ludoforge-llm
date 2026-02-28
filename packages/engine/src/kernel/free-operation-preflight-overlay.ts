import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import type { FreeOperationDiscoveryAnalysisResult } from './turn-flow-eligibility.js';
import type { EvalContext } from './eval-context.js';
import type { Move } from './types.js';

export interface FreeOperationPreflightOverlay {
  readonly executionPlayerOverride?: FreeOperationDiscoveryAnalysisResult['executionPlayer'];
  readonly freeOperationZoneFilter?: EvalContext['freeOperationZoneFilter'];
  readonly freeOperationZoneFilterDiagnostics?: EvalContext['freeOperationZoneFilterDiagnostics'];
}

export const buildFreeOperationPreflightOverlay = (
  analysis: Pick<FreeOperationDiscoveryAnalysisResult, 'executionPlayer' | 'zoneFilter'> | null | undefined,
  move: Pick<Move, 'actionId' | 'params'>,
  surface: FreeOperationZoneFilterSurface,
): FreeOperationPreflightOverlay => {
  if (analysis === null || analysis === undefined) {
    return {};
  }

  return {
    executionPlayerOverride: analysis.executionPlayer,
    ...(analysis.zoneFilter === undefined
      ? {}
      : {
          freeOperationZoneFilter: analysis.zoneFilter,
          freeOperationZoneFilterDiagnostics: {
            source: surface,
            actionId: String(move.actionId),
            moveParams: move.params,
          },
        }),
  };
};
