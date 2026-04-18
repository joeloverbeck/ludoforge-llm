import type { GameDefRuntime } from './gamedef-runtime.js';
import {
  resolveStrongestPotentialRequiredFreeOperationOutcomeGrant,
  resolveStrongestRequiredFreeOperationOutcomeGrant,
} from './free-operation-outcome-policy.js';
import {
  doesCompletedProbeMoveChangeGameplayState,
  hasLegalCompletedFreeOperationMoveInCurrentState,
} from './free-operation-viability.js';
import { createSeatResolutionContext } from './identity.js';
import { resolveMoveDecisionSequence, type ResolveMoveDecisionSequenceResult } from './move-decision-sequence.js';
import type { IllegalMoveContext } from './runtime-error.js';
import { ILLEGAL_MOVE_REASONS, type IllegalMoveReason } from './runtime-reasons.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import type { GameDef, GameState, Move, TurnFlowPendingFreeOperationGrant } from './types.js';

export type LegalityVerdict =
  | Readonly<{ kind: 'legal' }>
  | Readonly<{ kind: 'illegal'; reason: IllegalMoveReason; context: IllegalMoveContext }>;

const LEGAL_VERDICT: LegalityVerdict = Object.freeze({ kind: 'legal' });

const isIndeterminateZoneFilterFailure = (error: unknown): boolean => {
  if (!isTurnFlowErrorCode(error, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')) {
    return false;
  }
  const causeCode = typeof error.context === 'object' && error.context !== null
    ? (error.context as { readonly causeCode?: unknown }).causeCode
    : undefined;
  return causeCode === 'MISSING_BINDING' || causeCode === 'MISSING_VAR';
};

const outcomePolicyFailureVerdict = (
  move: Move,
  grant: TurnFlowPendingFreeOperationGrant,
): LegalityVerdict => ({
  kind: 'illegal',
  reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED,
  context: {
    actionId: move.actionId,
    params: move.params,
    reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED,
    grantId: grant.grantId,
    outcomePolicy: 'mustChangeGameplayState',
  },
});

const resolveOutcomePolicyGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
  complete: boolean,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): TurnFlowPendingFreeOperationGrant | null => {
  const surfaceId = TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION;
  const potential = complete
    ? null
    : resolveStrongestPotentialRequiredFreeOperationOutcomeGrant(def, state, move, seatResolution, surfaceId);
  try {
    const resolved = resolveStrongestRequiredFreeOperationOutcomeGrant(def, state, move, seatResolution, surfaceId);
    return complete ? resolved : (resolved ?? potential);
  } catch (error) {
    if (!isTurnFlowErrorCode(error, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')) {
      throw error;
    }
    return potential;
  }
};

const resolveDecisionSequenceZoneFilterFailure = (
  def: GameDef,
  state: GameState,
  move: Move,
): LegalityVerdict => {
  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  try {
    void resolveStrongestRequiredFreeOperationOutcomeGrant(
      def,
      state,
      move,
      seatResolution,
      TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
    );
    return LEGAL_VERDICT;
  } catch (error) {
    if (isIndeterminateZoneFilterFailure(error)) {
      return LEGAL_VERDICT;
    }
    throw error;
  }
};

export const evaluateMoveLegality = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): LegalityVerdict => {
  let sequence: ResolveMoveDecisionSequenceResult;
  try {
    sequence = resolveMoveDecisionSequence(
      def,
      state,
      move,
      { choose: () => undefined },
      runtime,
    );
  } catch (error) {
    if (
      !isTurnFlowErrorCode(error, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')
      || error.context?.surface !== 'legalChoices'
    ) {
      throw error;
    }
    return resolveDecisionSequenceZoneFilterFailure(def, state, move);
  }
  if (sequence.illegal !== undefined) {
    return sequence.illegal.reason === 'freeOperationZoneFilterMismatch'
      ? resolveDecisionSequenceZoneFilterFailure(def, state, sequence.move)
      : LEGAL_VERDICT;
  }
  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  const outcomeGrant = resolveOutcomePolicyGrant(def, state, sequence.move, sequence.complete, seatResolution);
  if (outcomeGrant === null) {
    return LEGAL_VERDICT;
  }
  if (sequence.complete) {
    return doesCompletedProbeMoveChangeGameplayState(def, state, sequence.move, seatResolution)
      ? LEGAL_VERDICT
      : outcomePolicyFailureVerdict(sequence.move, outcomeGrant);
  }
  return hasLegalCompletedFreeOperationMoveInCurrentState(def, state, sequence.move, seatResolution)
    ? LEGAL_VERDICT
    : outcomePolicyFailureVerdict(sequence.move, outcomeGrant);
};
