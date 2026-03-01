import { kernelRuntimeError } from './runtime-error.js';
import { resolveTurnFlowSeatForPlayerIndex } from './seat-resolution.js';
import type { GameDef, GameState } from './types.js';

export const requireCardDrivenActiveSeat = (
  def: Pick<GameDef, 'seats' | 'turnOrder'>,
  state: GameState,
  surface: string,
): string => {
  if (state.turnOrderState.type !== 'cardDriven') {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `Turn-flow runtime invariant failed: ${surface} requires cardDriven turnOrderState.`,
    );
  }

  const seat = resolveTurnFlowSeatForPlayerIndex(
    def,
    state.playerCount,
    state.turnOrderState.runtime.seatOrder,
    Number(state.activePlayer),
  );
  if (seat !== null) {
    return seat;
  }

  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `Turn-flow runtime invariant failed: ${surface} could not resolve active seat for activePlayer=${String(state.activePlayer)} seatOrder=[${state.turnOrderState.runtime.seatOrder.join(', ')}]`,
  );
};

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
