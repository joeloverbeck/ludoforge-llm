import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import type { PlayerId } from './branded.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { Move } from './types.js';

interface FreeOperationPreflightOverlayInput {
  readonly executionPlayer: PlayerId;
  readonly zoneFilter?: FreeOperationExecutionOverlay['zoneFilter'];
  readonly executionContext?: FreeOperationExecutionOverlay['grantContext'] | undefined;
}

interface FreeOperationPreflightOverlayDiagnostics {
  readonly source: FreeOperationZoneFilterSurface;
  readonly actionId: string;
  readonly moveParams: Move['params'];
}

export interface FreeOperationPreflightOverlay {
  readonly executionPlayerOverride?: PlayerId;
  readonly skipPhaseCheck?: boolean;
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay;
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
    skipPhaseCheck: true,
    ...((analysis.zoneFilter === undefined && analysis.executionContext === undefined)
      ? {}
      : {
          freeOperationOverlay: {
            ...(analysis.zoneFilter === undefined
              ? {}
              : {
                  zoneFilter: analysis.zoneFilter,
                  zoneFilterDiagnostics: {
                    source: surface,
                    actionId: String(move.actionId),
                    moveParams: move.params,
                  } satisfies FreeOperationPreflightOverlayDiagnostics,
                }),
            ...(analysis.executionContext === undefined ? {} : { grantContext: analysis.executionContext }),
          },
        }),
  };
};
