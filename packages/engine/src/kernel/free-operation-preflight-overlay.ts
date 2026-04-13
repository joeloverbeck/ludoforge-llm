import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import type { PlayerId } from './branded.js';
import type { CapturedSequenceZonesByKey } from './free-operation-captured-sequence-zones.js';
import type { FreeOperationExecutionOverlay } from './free-operation-overlay.js';
import type { Move } from './types.js';

interface FreeOperationPreflightOverlayInput {
  readonly executionPlayer: PlayerId;
  readonly zoneFilter?: FreeOperationExecutionOverlay['zoneFilter'];
  readonly bindingCountZoneFilter?: FreeOperationExecutionOverlay['bindingCountZoneFilter'];
  readonly executionContext?: FreeOperationExecutionOverlay['grantContext'] | undefined;
  readonly capturedSequenceZonesByKey?: CapturedSequenceZonesByKey | undefined;
  readonly tokenInterpretations?: FreeOperationExecutionOverlay['tokenInterpretations'] | undefined;
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
  options?: {
    readonly skipPhaseCheck?: boolean;
  },
): FreeOperationPreflightOverlay => {
  if (analysis === null || analysis === undefined) {
    return {};
  }

  return {
    executionPlayerOverride: analysis.executionPlayer,
    ...(options?.skipPhaseCheck === false ? {} : { skipPhaseCheck: true }),
    ...((
      analysis.zoneFilter === undefined
      && analysis.bindingCountZoneFilter === undefined
      && analysis.executionContext === undefined
      && analysis.capturedSequenceZonesByKey === undefined
      && analysis.tokenInterpretations === undefined
    )
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
            ...(analysis.bindingCountZoneFilter === undefined ? {} : { bindingCountZoneFilter: analysis.bindingCountZoneFilter }),
            ...(analysis.executionContext === undefined ? {} : { grantContext: analysis.executionContext }),
            ...(analysis.capturedSequenceZonesByKey === undefined
              ? {}
              : { capturedSequenceZonesByKey: analysis.capturedSequenceZonesByKey }),
            ...(analysis.tokenInterpretations === undefined ? {} : { tokenInterpretations: analysis.tokenInterpretations }),
          },
        }),
  };
};
