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
    readonly grantId?: string;
    readonly seat?: string;
    readonly operationClass?: TurnFlowPendingFreeOperationGrant['operationClass'];
    readonly actionIds?: readonly string[];
    readonly zoneFilter?: TurnFlowPendingFreeOperationGrant['zoneFilter'];
    readonly remainingUses?: number;
    readonly sequenceBatchId?: string;
    readonly sequenceIndex?: number;
  },
): GameState {
  const runtime = requireCardDrivenRuntime(state);
  const nextIndex = (runtime.pendingFreeOperationGrants ?? []).length;
  const nextGrant: TurnFlowPendingFreeOperationGrant = {
    grantId: grant?.grantId ?? `test-grant-${nextIndex}`,
    seat: grant?.seat ?? String(state.activePlayer),
    operationClass: grant?.operationClass ?? 'operation',
    ...(grant?.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(grant?.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
    remainingUses: grant?.remainingUses ?? 1,
    sequenceBatchId: grant?.sequenceBatchId ?? `test-free-op-batch-${nextIndex}`,
    sequenceIndex: grant?.sequenceIndex ?? nextIndex,
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
