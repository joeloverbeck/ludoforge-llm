import type { GameState, PlayerId, TurnFlowPendingFreeOperationGrant } from '../../src/kernel/index.js';

export function maybeCardDrivenRuntime(state: GameState) {
  return state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : undefined;
}

export function requireCardDrivenRuntime(state: GameState) {
  if (state.turnOrderState.type !== 'cardDriven') {
    throw new Error(`Expected cardDriven turnOrderState, received "${state.turnOrderState.type}".`);
  }
  return state.turnOrderState.runtime;
}

/**
 * Free-operation grant fields accepted by the helper.
 * All fields are optional — sensible defaults are applied for isolated grant testing.
 *
 * Ordered free-op tests should prefer:
 *  - `pendingFreeOperationGrants` assertions for readiness/sequence windows
 *  - resolved board-state assertions for effect behavior
 *  - surfaced legal moves or normalized surfaced moves for `limitedOperation`
 *
 * Avoid:
 *  - asserting on unresolved `legalMoves(...).params` for ordered free-op windows
 *    unless move shape itself is the subject under test
 *  - large multi-grant event windows when a single isolated grant fixture
 *    would test the behavior more directly
 */
export interface FreeOperationGrantOverrides {
  readonly grantId?: string;
  readonly seat?: string;
  readonly operationClass?: TurnFlowPendingFreeOperationGrant['operationClass'];
  readonly actionIds?: readonly string[];
  readonly zoneFilter?: TurnFlowPendingFreeOperationGrant['zoneFilter'];
  readonly moveZoneBindings?: readonly string[];
  readonly moveZoneProbeBindings?: readonly string[];
  readonly allowDuringMonsoon?: boolean;
  readonly executionContext?: TurnFlowPendingFreeOperationGrant['executionContext'];
  readonly viabilityPolicy?: TurnFlowPendingFreeOperationGrant['viabilityPolicy'];
  readonly completionPolicy?: TurnFlowPendingFreeOperationGrant['completionPolicy'];
  readonly outcomePolicy?: TurnFlowPendingFreeOperationGrant['outcomePolicy'];
  readonly postResolutionTurnFlow?: TurnFlowPendingFreeOperationGrant['postResolutionTurnFlow'];
  readonly remainingUses?: number;
  readonly sequenceBatchId?: string;
  readonly sequenceIndex?: number;
  readonly sequenceContext?: TurnFlowPendingFreeOperationGrant['sequenceContext'];
  readonly tokenInterpretations?: TurnFlowPendingFreeOperationGrant['tokenInterpretations'];
}

function buildGrant(
  runtime: ReturnType<typeof requireCardDrivenRuntime>,
  activePlayer: PlayerId,
  grant: FreeOperationGrantOverrides | undefined,
): TurnFlowPendingFreeOperationGrant {
  const nextIndex = (runtime.pendingFreeOperationGrants ?? []).length;
  const activeSeat = runtime.seatOrder[Number(activePlayer)] ?? String(activePlayer);
  return {
    grantId: grant?.grantId ?? `test-grant-${nextIndex}`,
    seat: grant?.seat ?? activeSeat,
    operationClass: grant?.operationClass ?? 'operation',
    ...(grant?.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(grant?.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
    ...(grant?.moveZoneBindings === undefined ? {} : { moveZoneBindings: [...grant.moveZoneBindings] }),
    ...(grant?.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: [...grant.moveZoneProbeBindings] }),
    ...(grant?.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
    ...(grant?.executionContext === undefined ? {} : { executionContext: grant.executionContext }),
    ...(grant?.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
    ...(grant?.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
    ...(grant?.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
    ...(grant?.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
    ...(grant?.tokenInterpretations === undefined ? {} : { tokenInterpretations: [...grant.tokenInterpretations] }),
    ...(grant?.sequenceContext === undefined ? {} : { sequenceContext: grant.sequenceContext }),
    remainingUses: grant?.remainingUses ?? 1,
    sequenceBatchId: grant?.sequenceBatchId ?? `test-free-op-batch-${nextIndex}`,
    sequenceIndex: grant?.sequenceIndex ?? nextIndex,
  };
}

export function withPendingFreeOperationGrant(
  state: GameState,
  grant?: FreeOperationGrantOverrides,
): GameState {
  const runtime = requireCardDrivenRuntime(state);
  const nextGrant = buildGrant(runtime, state.activePlayer, grant);
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

/**
 * Install exactly one pending free-operation grant, replacing any existing grants.
 * Optionally sets activePlayer for isolated grant execution tests.
 */
export function withIsolatedFreeOperationGrant(
  state: GameState,
  activePlayer: PlayerId,
  grant: FreeOperationGrantOverrides,
): GameState {
  const runtime = requireCardDrivenRuntime(state);
  const isolatedGrant = buildGrant(
    { ...runtime, pendingFreeOperationGrants: [] },
    activePlayer,
    grant,
  );
  return {
    ...state,
    activePlayer,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        pendingFreeOperationGrants: [isolatedGrant],
      },
    },
  };
}
