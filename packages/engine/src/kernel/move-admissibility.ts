import type { GameDefRuntime } from './gamedef-runtime.js';
import { MISSING_BINDING_POLICY_CONTEXTS } from './missing-binding-policy.js';
import {
  classifyMoveDecisionSequenceAdmissionForLegalMove,
} from './move-decision-sequence.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
import type { GameDef, GameState, Move } from './types.js';
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
        | 'floatingUnresolved';
    }>;

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
