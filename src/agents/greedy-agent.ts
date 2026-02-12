import { applyMove } from '../kernel/apply-move.js';
import { nextInt } from '../kernel/prng.js';
import type { Agent, Move, Rng } from '../kernel/types.js';
import { evaluateState } from './evaluate-state.js';
import { selectCandidatesDeterministically } from './select-candidates.js';
import { completeTemplateMove, isTemplateMoveForProfile } from './template-completion.js';

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
    this.maxMovesToEvaluate = maxMovesToEvaluate;
    this.completionsPerTemplate = completionsPerTemplate ?? DEFAULT_COMPLETIONS_PER_TEMPLATE;
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove called with empty legalMoves');
    }

    // Expand template moves into concrete candidates
    const expandedMoves: Move[] = [];
    let rng: Rng = input.rng;

    for (const move of input.legalMoves) {
      if (isTemplateMoveForProfile(input.def, move)) {
        for (let i = 0; i < this.completionsPerTemplate; i += 1) {
          const result = completeTemplateMove(input.def, input.state, move, rng);
          if (result !== null) {
            expandedMoves.push(result.move);
            rng = result.rng;
          } else {
            // Template is unplayable, skip all remaining attempts
            break;
          }
        }
      } else {
        expandedMoves.push(move);
      }
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
      const nextState = applyMove(input.def, input.state, move).state;
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

    const [selectedIndex, nextRng] = nextInt(candidates.rng, 0, tiedBestMoves.length - 1);
    const selectedMove = tiedBestMoves[selectedIndex];
    if (selectedMove === undefined) {
      throw new Error(`GreedyAgent.chooseMove selected out-of-range tied move index ${selectedIndex}`);
    }
    return { move: selectedMove, rng: nextRng };
  }
}
