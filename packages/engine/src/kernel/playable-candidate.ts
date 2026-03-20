import { probeMoveViability, type MoveViabilityProbeResult } from './apply-move.js';
import {
  completeTemplateMove,
  type TemplateCompletionResult,
} from './move-completion.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type { MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import type { GameDef, GameState, Move, Rng, RuntimeWarning } from './types.js';

export type PlayableCandidateClassification =
  | Readonly<{
      readonly kind: 'playableComplete';
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
    }>
  | Readonly<{
      readonly kind: 'playableStochastic';
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly viability: Extract<MoveViabilityProbeResult, { readonly viable: true; readonly complete: false }>;
    }>
  | Readonly<{
      readonly kind: 'rejected';
      readonly move: Move;
      readonly rejection: 'completionUnsatisfiable' | 'notViable' | 'notDecisionComplete';
      readonly viability?: Exclude<MoveViabilityProbeResult, { readonly viable: true }>;
    }>;

export type PlayableCandidateEvaluation =
  | (PlayableCandidateClassification & Readonly<{ readonly rng: Rng }>);

const classifyPlayableCandidateViability = (
  move: Move,
  viability: MoveViabilityProbeResult,
): PlayableCandidateClassification => {
  if (!viability.viable) {
    return {
      kind: 'rejected',
      move,
      rejection: 'notViable',
      viability,
    };
  }
  if (viability.complete) {
    return {
      kind: 'playableComplete',
      move: viability.move,
      warnings: viability.warnings,
    };
  }
  if (viability.stochasticDecision !== undefined) {
    return {
      kind: 'playableStochastic',
      move: viability.move,
      warnings: viability.warnings,
      viability,
    };
  }
  return {
    kind: 'rejected',
    move: viability.move,
    rejection: 'notDecisionComplete',
  };
};

const classifyCompletedTemplateMove = (
  move: Move,
  completed: TemplateCompletionResult,
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): PlayableCandidateClassification => {
  if (completed.kind === 'unsatisfiable') {
    return {
      kind: 'rejected',
      move,
      rejection: 'completionUnsatisfiable',
    };
  }
  return classifyPlayableCandidateViability(
    completed.move,
    probeMoveViability(def, state, completed.move, runtime),
  );
};

export const classifyPlayableMoveCandidate = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): PlayableCandidateClassification => classifyPlayableCandidateViability(
  move,
  probeMoveViability(def, state, move, runtime),
);

export const evaluatePlayableMoveCandidate = (
  def: GameDef,
  state: GameState,
  move: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
  budgets?: Partial<MoveEnumerationBudgets>,
): PlayableCandidateEvaluation => {
  const completed = completeTemplateMove(def, state, move, rng, runtime, budgets);
  return {
    ...classifyCompletedTemplateMove(move, completed, def, state, runtime),
    rng: completed.kind === 'unsatisfiable' ? rng : completed.rng,
  };
};
