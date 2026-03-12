import type { GameState } from './types.js';

export type CapturedSequenceZonesByKey = Readonly<Record<string, readonly string[]>>;

export const resolveCapturedSequenceZonesByKey = (
  state: GameState,
  grant: { readonly sequenceBatchId?: string },
): CapturedSequenceZonesByKey | undefined => {
  if (state.turnOrderState.type !== 'cardDriven' || grant.sequenceBatchId === undefined) {
    return undefined;
  }

  const captured = state.turnOrderState.runtime.freeOperationSequenceContexts?.[grant.sequenceBatchId]?.capturedMoveZonesByKey;
  if (captured === undefined || Object.keys(captured).length === 0) {
    return undefined;
  }

  return captured;
};
