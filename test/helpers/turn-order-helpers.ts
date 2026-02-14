import type { GameState, TurnFlowPendingFreeOperationGrant } from '../../src/kernel/index.js';

export function maybeCardDrivenRuntime(state: GameState) {
  return state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : undefined;
}

export function requireCardDrivenRuntime(state: GameState) {
  if (state.turnOrderState.type !== 'cardDriven') {
    throw new Error(`Expected cardDriven turnOrderState, received "${state.turnOrderState.type}".`);
  }
  return state.turnOrderState.runtime;
}

export function withPendingFreeOperationGrant(
  state: GameState,
  grant?: {
    readonly faction?: string;
    readonly actionIds?: readonly string[];
    readonly zoneFilter?: TurnFlowPendingFreeOperationGrant['zoneFilter'];
  },
): GameState {
  const runtime = requireCardDrivenRuntime(state);
  const nextGrant: TurnFlowPendingFreeOperationGrant = {
    faction: grant?.faction ?? String(state.activePlayer),
    ...(grant?.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(grant?.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
  };
  return {
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        pendingFreeOperationGrants: [...(runtime.pendingFreeOperationGrants ?? []), nextGrant],
      },
    },
  };
}
