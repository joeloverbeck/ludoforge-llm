import { probeMoveViability, type MoveViabilityProbeResult } from './apply-move.js';
import {
  completeTemplateMove,
  type TemplateCompletionResult,
  type TemplateMoveCompletionOptions,
} from './move-completion.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { createTrustedExecutableMove } from './trusted-move.js';
import type { GameDef, GameState, Move, Rng, RuntimeWarning, TrustedExecutableMove } from './types.js';

export type PlayableCandidateClassification =
  | Readonly<{
      readonly kind: 'playableComplete';
      readonly move: TrustedExecutableMove;
      readonly warnings: readonly RuntimeWarning[];
    }>
  | Readonly<{
      readonly kind: 'playableStochastic';
      readonly move: TrustedExecutableMove;
      readonly warnings: readonly RuntimeWarning[];
      readonly viability: Extract<MoveViabilityProbeResult, { readonly viable: true; readonly complete: false }>;
    }>
  | Readonly<{
      readonly kind: 'rejected';
      readonly move: Move;
      readonly rejection: 'structurallyUnsatisfiable' | 'drawDeadEnd' | 'notViable' | 'notDecisionComplete';
      readonly viability?: Exclude<MoveViabilityProbeResult, { readonly viable: true }>;
    }>;

export type PlayableCandidateEvaluation =
  | (PlayableCandidateClassification & Readonly<{ readonly rng: Rng }>);

export type PlayableMoveCandidateOptions = TemplateMoveCompletionOptions;

const classifyPlayableCandidateViability = (
  move: Move,
  state: GameState,
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
      move: createTrustedExecutableMove(viability.move, state.stateHash, 'templateCompletion'),
      warnings: viability.warnings,
    };
  }
  if (viability.stochasticDecision !== undefined) {
    return {
      kind: 'playableStochastic',
      move: createTrustedExecutableMove(viability.move, state.stateHash, 'templateCompletion'),
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
  if (completed.kind === 'structurallyUnsatisfiable' || completed.kind === 'drawDeadEnd') {
    return {
      kind: 'rejected',
      move,
      rejection: completed.kind,
    };
  }
  const viability = probeMoveViability(def, state, completed.move, runtime);
  if (!viability.viable) {
    return {
      kind: 'rejected',
      move: completed.move,
      rejection: 'drawDeadEnd',
      viability,
    };
  }
  if (viability.viable && !viability.complete && viability.stochasticDecision === undefined) {
    return {
      kind: 'rejected',
      move: viability.move,
      rejection: 'drawDeadEnd',
    };
  }
  return classifyPlayableCandidateViability(completed.move, state, viability);
};

export const classifyPlayableMoveCandidate = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
): PlayableCandidateClassification => classifyPlayableCandidateViability(
  move,
  state,
  probeMoveViability(def, state, move, runtime),
);

export const evaluatePlayableMoveCandidate = (
  def: GameDef,
  state: GameState,
  move: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
  options?: PlayableMoveCandidateOptions,
): PlayableCandidateEvaluation => {
  const completed = completeTemplateMove(def, state, move, rng, runtime, options);
  const classification = classifyCompletedTemplateMove(move, completed, def, state, runtime);
  let nextRng: Rng;
  if (classification.kind === 'rejected') {
    if (completed.kind === 'drawDeadEnd') {
      nextRng = completed.rng;
    } else if (completed.kind === 'completed' && classification.rejection === 'drawDeadEnd') {
      nextRng = completed.rng;
    } else {
      nextRng = rng;
    }
  } else if (completed.kind === 'completed' || completed.kind === 'stochasticUnresolved') {
    nextRng = completed.rng;
  } else {
    throw new Error('completed classification must carry rng when candidate is playable');
  }
  return {
    ...classification,
    rng: nextRng,
  };
};
