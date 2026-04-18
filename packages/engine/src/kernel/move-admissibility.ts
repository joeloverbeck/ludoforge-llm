import type { GameDefRuntime } from './gamedef-runtime.js';
import { MISSING_BINDING_POLICY_CONTEXTS } from './missing-binding-policy.js';
import { evaluateMoveLegality } from './move-legality-predicate.js';
import {
  classifyMoveDecisionSequenceAdmissionForLegalMove,
} from './move-decision-sequence.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { ILLEGAL_MOVE_REASONS, type IllegalMoveReason } from './runtime-reasons.js';
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

type MoveAdmissibilityReason = Extract<MoveAdmissibilityVerdict, { kind: 'inadmissible' }>['reason'];

const LEGALITY_TO_ADMISSIBILITY = Object.freeze({
  [ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED]: 'freeOperationOutcomePolicyFailed',
} satisfies Partial<Record<IllegalMoveReason, MoveAdmissibilityReason>>);

const unmappedLegalityReasonError = (reason: IllegalMoveReason): Error =>
  new Error(`unmapped legality reason for admissibility classification: ${reason}`);

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
  runtime?: GameDefRuntime,
): MoveAdmissibilityVerdict | null => {
  if (!viability.viable || viability.move.freeOperation !== true) {
    return null;
  }
  const verdict = evaluateMoveLegality(def, state, viability.move, runtime);
  if (verdict.kind === 'legal') {
    return null;
  }
  const admissibilityReason = LEGALITY_TO_ADMISSIBILITY[verdict.reason as keyof typeof LEGALITY_TO_ADMISSIBILITY];
  if (admissibilityReason === undefined) {
    throw unmappedLegalityReasonError(verdict.reason);
  }
  return {
    kind: 'inadmissible',
    reason: admissibilityReason,
    ...('grantId' in verdict.context ? { outcomePolicyGrantId: verdict.context.grantId } : {}),
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

  const outcomePolicyVerdict = classifyFreeOperationOutcomePolicyAdmissibility(def, state, viability, runtime);
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
