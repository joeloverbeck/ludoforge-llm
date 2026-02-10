import { applyMove } from '../kernel/apply-move.js';
import type { Agent } from '../kernel/types.js';
import { evaluateState } from './evaluate-state.js';

export class GreedyAgent implements Agent {
  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove called with empty legalMoves');
    }

    let bestMove = input.legalMoves[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const move of input.legalMoves) {
      const nextState = applyMove(input.def, input.state, move).state;
      const score = evaluateState(input.def, nextState, input.playerId);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    if (bestMove === undefined) {
      throw new Error('GreedyAgent.chooseMove could not select a move');
    }

    return { move: bestMove, rng: input.rng };
  }
}

