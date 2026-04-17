import {
  hasLegalCompletedFreeOperationMoveInCurrentState,
} from './free-operation-viability.js';
import {
  resolveStrongestPotentialRequiredFreeOperationOutcomeGrant,
  resolveStrongestRequiredFreeOperationOutcomeGrant,
} from './free-operation-outcome-policy.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { createSeatResolutionContext } from './identity.js';
import { MISSING_BINDING_POLICY_CONTEXTS } from './missing-binding-policy.js';
import {
  classifyMoveDecisionSequenceAdmissionForLegalMove,
} from './move-decision-sequence.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { isTurnFlowErrorCode } from './turn-flow-error.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import type { GameDef, GameState, Move, TurnFlowPendingFreeOperationGrant } from './types.js';
import type { MoveViabilityResult } from './viability-predicate.js';

export type MoveAdmissibilityVerdict =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'pendingAdmissible'; continuation: 'decision' | 'decisionSet' | 'stochastic' }>
  | Readonly<{
      kind: 'inadmissible';
      reason:
        | 'illegalMove'
        | 'runtimeError'
        | 'floatingUnsatisfiable'
        | 'floatingUnresolved'
        | 'freeOperationOutcomePolicyFailed';
      readonly outcomePolicyGrantId?: TurnFlowPendingFreeOperationGrant['grantId'];
    }>;

/**
 * Resolve the strongest required free-operation outcome grant that applies to
 * the move, tolerating the zone-filter evaluation failure surface used by the
 * match-evaluation grant resolver. The match-evaluation surface deliberately
 * throws when a grant zone-filter cannot be evaluated against the move's
 * current binding shape; for outcome-policy admissibility we treat that as
 * "no resolved grant" and fall back to the potential grant set.
 */
const resolveOutcomePolicyGrantForAdmissibility = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: ReturnType<typeof createSeatResolutionContext>,
): TurnFlowPendingFreeOperationGrant | null => {
  const potential = resolveStrongestPotentialRequiredFreeOperationOutcomeGrant(
    def,
    state,
    move,
    seatResolution,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
  );
  try {
    const resolved = resolveStrongestRequiredFreeOperationOutcomeGrant(
      def,
      state,
      move,
      seatResolution,
      TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
    );
    return resolved ?? potential;
  } catch (error) {
    if (!isTurnFlowErrorCode(error, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED')) {
      throw error;
    }
    return potential;
  }
};

/**
 * The free-operation outcome-policy admissibility gate.
 *
 * Spec 17 §1 and Foundations Alignment #14 require a single classifier to
 * be authoritative for admissibility across enumeration, probing,
 * decision-sequence admission, and completion. Free-operation outcome
 * policy (`mustChangeGameplayState`) is a grant-level legality concern that
 * MUST participate in the same classifier rather than being enforced by a
 * parallel post-rewrite path. Returning `inadmissible` here converges the
 * scattered enumeration, deferred-rewrite, and probe checks onto a single
 * verdict.
 */
const classifyFreeOperationOutcomePolicyAdmissibility = (
  def: GameDef,
  state: GameState,
  viability: MoveViabilityResult,
): MoveAdmissibilityVerdict | null => {
  if (!viability.viable || viability.move.freeOperation !== true) {
    return null;
  }
  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  const strongestOutcomeGrant = resolveOutcomePolicyGrantForAdmissibility(
    def,
    state,
    viability.move,
    seatResolution,
  );
  if (strongestOutcomeGrant === null) {
    return null;
  }
  if (hasLegalCompletedFreeOperationMoveInCurrentState(def, state, viability.move, seatResolution)) {
    return null;
  }
  return {
    kind: 'inadmissible',
    reason: 'freeOperationOutcomePolicyFailed',
    outcomePolicyGrantId: strongestOutcomeGrant.grantId,
  };
};

export const classifyMoveAdmissibility = (
  def: GameDef,
  state: GameState,
  move: Move,
  viability: MoveViabilityResult,
  runtime?: GameDefRuntime,
): MoveAdmissibilityVerdict => {
  if (!viability.viable) {
    return viability.code === 'ILLEGAL_MOVE'
      ? { kind: 'inadmissible', reason: 'illegalMove' }
      : { kind: 'inadmissible', reason: 'runtimeError' };
  }

  const outcomePolicyVerdict = classifyFreeOperationOutcomePolicyAdmissibility(def, state, viability);
  if (outcomePolicyVerdict !== null) {
    return outcomePolicyVerdict;
  }

  if (viability.complete) {
    return { kind: 'complete' };
  }

  if (viability.stochasticDecision !== undefined) {
    return { kind: 'pendingAdmissible', continuation: 'stochastic' };
  }

  if (viability.nextDecision !== undefined) {
    return { kind: 'pendingAdmissible', continuation: 'decision' };
  }

  if (viability.nextDecisionSet !== undefined) {
    return { kind: 'pendingAdmissible', continuation: 'decisionSet' };
  }

  const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(
    def,
    state,
    move,
    MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    {
      budgets: resolveMoveEnumerationBudgets(),
    },
    runtime,
  );

  return admission === 'unsatisfiable'
    ? { kind: 'inadmissible', reason: 'floatingUnsatisfiable' }
    : { kind: 'inadmissible', reason: 'floatingUnresolved' };
};
