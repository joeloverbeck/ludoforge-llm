import { asActionId, asPlayerId } from './branded.js';
import { MISSING_BINDING_POLICY_CONTEXTS, shouldDeferMissingBinding } from './missing-binding-policy.js';
import {
  isMoveDecisionSequenceSatisfiable,
  resolveMoveDecisionSequence,
} from './move-decision-sequence.js';
import { resolvePlayerIndexForTurnFlowSeat, type SeatResolutionContext } from './seat-resolution.js';
import {
  doesGrantAuthorizeMove,
  isPendingFreeOperationGrantSequenceReady,
} from './free-operation-grant-authorization.js';
import { resolveFreeOperationGrantSeatToken } from './free-operation-seat-resolution.js';
import { isFreeOperationApplicableForMove } from './free-operation-discovery-analysis.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import type {
  GameDef,
  GameState,
  Move,
  TurnFlowFreeOperationGrantContract,
  TurnFlowFreeOperationGrantViabilityPolicy,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

const cardDrivenRuntime = (state: GameState) =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;

const toPendingFreeOperationGrant = (
  grant: TurnFlowFreeOperationGrantContract,
  grantId: string,
  sequenceBatchId: string | undefined,
): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  seat: grant.seat,
  ...(grant.executeAsSeat === undefined ? {} : { executeAsSeat: grant.executeAsSeat }),
  operationClass: grant.operationClass,
  ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
  ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
  ...(grant.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
  ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
  remainingUses: grant.uses ?? 1,
  ...(sequenceBatchId === undefined ? {} : { sequenceBatchId }),
  ...(grant.sequence?.step === undefined ? {} : { sequenceIndex: grant.sequence.step }),
});

export const DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY: TurnFlowFreeOperationGrantViabilityPolicy = 'emitAlways';

export const resolveFreeOperationGrantViabilityPolicy = (
  grant: Pick<TurnFlowFreeOperationGrantContract, 'viabilityPolicy'>,
): TurnFlowFreeOperationGrantViabilityPolicy =>
  grant.viabilityPolicy ?? DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY;

export const grantRequiresUsableProbe = (grant: Pick<TurnFlowFreeOperationGrantContract, 'viabilityPolicy'>): boolean => {
  const policy = resolveFreeOperationGrantViabilityPolicy(grant);
  return policy === 'requireUsableAtIssue' || policy === 'requireUsableForEventPlay';
};

export const isFreeOperationGrantUsableInCurrentState = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
  options?: {
    readonly sequenceProbeBlockers?: readonly TurnFlowPendingFreeOperationGrant[];
  },
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return false;
  }

  const seat = resolveFreeOperationGrantSeatToken(grant.seat, activeSeat, seatOrder);
  if (seat === null) {
    return false;
  }

  let executeAsSeat: string | undefined;
  if (grant.executeAsSeat !== undefined) {
    const resolvedExecuteAsSeat = resolveFreeOperationGrantSeatToken(grant.executeAsSeat, activeSeat, seatOrder);
    if (resolvedExecuteAsSeat === null) {
      return false;
    }
    executeAsSeat = resolvedExecuteAsSeat;
  }

  const probeGrant: TurnFlowPendingFreeOperationGrant = {
    ...toPendingFreeOperationGrant(grant, '__probe__', grant.sequence === undefined ? undefined : '__probeBatch__'),
    seat,
    ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
  };
  const pendingProbeGrants = [...(options?.sequenceProbeBlockers ?? []), probeGrant];
  const probeActivePlayerIndex = resolvePlayerIndexForTurnFlowSeat(seat, seatResolution.index);
  const probeState: GameState = {
    ...state,
    ...(probeActivePlayerIndex === null ? {} : { activePlayer: asPlayerId(probeActivePlayerIndex) }),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: seat,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingFreeOperationGrants: pendingProbeGrants,
      },
    },
  };
  if (!isPendingFreeOperationGrantSequenceReady(pendingProbeGrants, probeGrant)) {
    return false;
  }

  const actionIds = resolveGrantFreeOperationActionDomain(def, probeGrant);
  for (const actionId of actionIds) {
    const probeMove: Move = {
      actionId: asActionId(actionId),
      params: {},
      freeOperation: true,
    };
    if (!isFreeOperationApplicableForMove(def, probeState, probeMove, seatResolution)) {
      continue;
    }
    const decisionProbe = resolveMoveDecisionSequence(def, probeState, probeMove, {
      choose: () => undefined,
    });
    if (
      decisionProbe.complete &&
      doesGrantAuthorizeMove(def, probeState, pendingProbeGrants, probeGrant, decisionProbe.move)
    ) {
      return true;
    }
    if (
      !decisionProbe.complete &&
      decisionProbe.illegal === undefined
    ) {
      try {
        if (isMoveDecisionSequenceSatisfiable(def, probeState, probeMove)) {
          return true;
        }
      } catch (error) {
        if (!shouldDeferMissingBinding(error, MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE)) {
          throw error;
        }
      }
    }
  }

  return false;
};
