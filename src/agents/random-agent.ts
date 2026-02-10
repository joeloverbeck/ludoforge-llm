import { nextInt } from '../kernel/prng.js';
import type { Agent } from '../kernel/types.js';

export class RandomAgent implements Agent {
  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove called with empty legalMoves');
    }

    if (input.legalMoves.length === 1) {
      const move = input.legalMoves[0];
      if (move === undefined) {
        throw new Error('RandomAgent.chooseMove called with empty legalMoves');
      }
      return { move, rng: input.rng };
    }

    const [index, rng] = nextInt(input.rng, 0, input.legalMoves.length - 1);
    const move = input.legalMoves[index];
    if (move === undefined) {
      throw new Error(`RandomAgent.chooseMove selected out-of-range index ${index}`);
    }
    return { move, rng };
  }
}
