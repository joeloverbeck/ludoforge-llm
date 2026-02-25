import { kernelRuntimeError } from './runtime-error.js';
import type { GameState } from './types.js';

export const validateTurnFlowRuntimeStateInvariants = (state: GameState): void => {
  if (state.turnOrderState.type !== 'cardDriven') {
    return;
  }

  const pendingDeferredEventEffects = state.turnOrderState.runtime.pendingDeferredEventEffects ?? [];
  for (let index = 0; index < pendingDeferredEventEffects.length; index += 1) {
    const deferred = pendingDeferredEventEffects[index]!;
    if (
      !Number.isSafeInteger(deferred.actorPlayer)
      || deferred.actorPlayer < 0
      || deferred.actorPlayer >= state.playerCount
    ) {
      throw kernelRuntimeError(
        'RUNTIME_CONTRACT_INVALID',
        `Turn-flow runtime invariant failed: pendingDeferredEventEffects[${index}].actorPlayer out of range: actorPlayer=${String(deferred.actorPlayer)} playerCount=${state.playerCount} deferredId=${deferred.deferredId} actionId=${deferred.actionId}`,
      );
    }
  }
};
