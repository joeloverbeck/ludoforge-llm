import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import type { PlayerId } from './branded.js';
import type { ConditionAST, Move } from './types.js';

interface FreeOperationPreflightOverlayInput {
  readonly executionPlayer: PlayerId;
  readonly zoneFilter?: ConditionAST;
}

interface FreeOperationPreflightOverlayDiagnostics {
  readonly source: FreeOperationZoneFilterSurface;
  readonly actionId: string;
  readonly moveParams: Move['params'];
}

export interface FreeOperationPreflightOverlay {
  readonly executionPlayerOverride?: PlayerId;
  readonly freeOperationZoneFilter?: ConditionAST;
  readonly freeOperationZoneFilterDiagnostics?: FreeOperationPreflightOverlayDiagnostics;
}

export const buildFreeOperationPreflightOverlay = (
  analysis: FreeOperationPreflightOverlayInput | null | undefined,
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
