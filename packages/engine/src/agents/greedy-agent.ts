import { applyMove } from '../kernel/apply-move.js';
import { legalChoicesEvaluate } from '../kernel/legal-choices.js';
import { completeTemplateMove } from '../kernel/move-completion.js';
import type { Agent, Move, Rng } from '../kernel/types.js';
import { evaluateState } from './evaluate-state.js';
import { pickRandom, selectStochasticFallback } from './agent-move-selection.js';
import { selectCandidatesDeterministically } from './select-candidates.js';

const DEFAULT_COMPLETIONS_PER_TEMPLATE = 5;

export interface GreedyAgentConfig {
  readonly maxMovesToEvaluate?: number;
  readonly completionsPerTemplate?: number;
}

export class GreedyAgent implements Agent {
  private readonly maxMovesToEvaluate: number | undefined;
  private readonly completionsPerTemplate: number;

  constructor(config: GreedyAgentConfig = {}) {
    const { maxMovesToEvaluate, completionsPerTemplate } = config;
    if (
      maxMovesToEvaluate !== undefined
      && (!Number.isSafeInteger(maxMovesToEvaluate) || maxMovesToEvaluate < 1)
    ) {
      throw new RangeError('GreedyAgent maxMovesToEvaluate must be a positive safe integer');
    }
    if (
      completionsPerTemplate !== undefined
      && (!Number.isSafeInteger(completionsPerTemplate) || completionsPerTemplate < 1)
    ) {
      throw new RangeError('GreedyAgent completionsPerTemplate must be a positive safe integer');
    }
    this.maxMovesToEvaluate = maxMovesToEvaluate;
    this.completionsPerTemplate = completionsPerTemplate ?? DEFAULT_COMPLETIONS_PER_TEMPLATE;
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove called with empty legalMoves');
    }

    // Expand template moves into concrete candidates
    const expandedMoves: Move[] = [];
    const stochasticMoves: Move[] = [];
    let rng: Rng = input.rng;

    for (const move of input.legalMoves) {
      const choiceState = legalChoicesEvaluate(input.def, input.state, move, undefined, input.runtime);
      if (choiceState.kind === 'illegal') {
        continue;
      }

      const attempts = choiceState.kind === 'pending' ? this.completionsPerTemplate : 1;
      for (let i = 0; i < attempts; i += 1) {
        const result = completeTemplateMove(input.def, input.state, move, rng, input.runtime);
        if (result.kind === 'completed') {
          expandedMoves.push(result.move);
          rng = result.rng;
        } else if (result.kind === 'stochasticUnresolved') {
          stochasticMoves.push(result.move);
          rng = result.rng;
          break;
        } else {
          // Unsatisfiable — skip all remaining attempts.
          break;
        }
      }
    }

    if (expandedMoves.length === 0 && stochasticMoves.length > 0) {
      return selectStochasticFallback(stochasticMoves, rng);
    }

    if (expandedMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove: no playable moves after template completion');
    }

    // Apply maxMovesToEvaluate cap
    const candidates = selectCandidatesDeterministically(
      expandedMoves,
      rng,
      this.maxMovesToEvaluate,
    );

    let bestMove = candidates.moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    const tiedBestMoves: Move[] = [];

    for (const move of candidates.moves) {
      const nextState = applyMove(input.def, input.state, move, undefined, input.runtime).state;
      const score = evaluateState(input.def, nextState, input.playerId);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        tiedBestMoves.length = 0;
        tiedBestMoves.push(move);
      } else if (score === bestScore) {
        tiedBestMoves.push(move);
      }
    }

    if (bestMove === undefined) {
      throw new Error('GreedyAgent.chooseMove could not select a move');
    }

    if (tiedBestMoves.length <= 1) {
      return { move: bestMove, rng: candidates.rng };
    }

    const { item: selectedMove, rng: nextRng } = pickRandom(tiedBestMoves, candidates.rng);
    return { move: selectedMove, rng: nextRng };
  }
}
