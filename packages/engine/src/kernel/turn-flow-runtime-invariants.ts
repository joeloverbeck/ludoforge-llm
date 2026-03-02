import {
  kernelRuntimeError,
  type TurnFlowActiveSeatInvariantContext,
  type TurnFlowActiveSeatInvariantSurface,
} from './runtime-error.js';
import {
  analyzeSeatOrderShape,
  resolveTurnFlowSeatForPlayerIndex,
  type SeatResolutionContext,
} from './seat-resolution.js';
import type { GameDef, GameState } from './types.js';

export const TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT = 'turnFlow.activeSeat.unresolvable';

export const makeActiveSeatUnresolvableInvariantContext = (
  surface: TurnFlowActiveSeatInvariantSurface,
  activePlayer: number,
  seatOrder: readonly string[],
): TurnFlowActiveSeatInvariantContext => ({
  invariant: TURN_FLOW_ACTIVE_SEAT_UNRESOLVABLE_INVARIANT,
  surface,
  activePlayer,
  seatOrder: [...seatOrder],
});

export const activeSeatUnresolvableInvariantMessage = (
  context: Pick<TurnFlowActiveSeatInvariantContext, 'surface' | 'activePlayer' | 'seatOrder'>,
): string =>
  `Turn-flow runtime invariant failed: ${context.surface} could not resolve active seat for activePlayer=${String(context.activePlayer)} seatOrder=[${context.seatOrder.join(', ')}]`;

export const requireCardDrivenActiveSeat = (
  def: Pick<GameDef, 'seats' | 'turnOrder'>,
  state: GameState,
  surface: TurnFlowActiveSeatInvariantSurface,
  seatResolution: SeatResolutionContext,
): string => {
  if (state.turnOrderState.type !== 'cardDriven') {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `Turn-flow runtime invariant failed: ${surface} requires cardDriven turnOrderState.`,
    );
  }

  const seat = resolveTurnFlowSeatForPlayerIndex(
    state.turnOrderState.runtime.seatOrder,
    Number(state.activePlayer),
    seatResolution.index,
  );
  if (seat !== null) {
    return seat;
  }

  const context = makeActiveSeatUnresolvableInvariantContext(
    surface,
    Number(state.activePlayer),
    state.turnOrderState.runtime.seatOrder,
  );
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    activeSeatUnresolvableInvariantMessage(context),
    context,
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

export const assertCardMetadataSeatOrderRuntimeInvariant = (
  seatOrder: readonly string[],
  context: {
    readonly cardId: string;
    readonly metadataKey: string;
  },
): void => {
  const shape = analyzeSeatOrderShape(seatOrder);
  if (shape.duplicateSeats.length === 0 && shape.distinctSeatCount >= 2) {
    return;
  }

  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `Turn-flow runtime invariant failed: card metadata seat order shape invalid (cardId=${context.cardId}, metadataKey=${context.metadataKey}, distinctSeatCount=${shape.distinctSeatCount}, duplicates=[${shape.duplicateSeats.join(', ')}]).`,
  );
};
