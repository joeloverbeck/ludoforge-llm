import { applyMove } from '../kernel/apply-move.js';
import { nextInt } from '../kernel/prng.js';
import type { Agent } from '../kernel/types.js';
import { evaluateState } from './evaluate-state.js';
import { selectCandidatesDeterministically } from './select-candidates.js';

export interface GreedyAgentConfig {
  readonly maxMovesToEvaluate?: number;
}

export class GreedyAgent implements Agent {
  private readonly maxMovesToEvaluate: number | undefined;

  constructor(config: GreedyAgentConfig = {}) {
    const { maxMovesToEvaluate } = config;
    if (
      maxMovesToEvaluate !== undefined
      && (!Number.isSafeInteger(maxMovesToEvaluate) || maxMovesToEvaluate < 1)
    ) {
      throw new RangeError('GreedyAgent maxMovesToEvaluate must be a positive safe integer');
    }
    this.maxMovesToEvaluate = maxMovesToEvaluate;
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove called with empty legalMoves');
    }

    const candidates = selectCandidatesDeterministically(input.legalMoves, input.rng, this.maxMovesToEvaluate);
    let bestMove = candidates.moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    const tiedBestMoves: typeof input.legalMoves[number][] = [];

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
