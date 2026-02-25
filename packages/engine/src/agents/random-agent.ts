import { nextInt } from '../kernel/prng.js';
import type { Agent, Move } from '../kernel/types.js';
import { completeTemplateMove } from './template-completion.js';

export class RandomAgent implements Agent {
  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove called with empty legalMoves');
    }

    const completedMoves: Move[] = [];
    let rng = input.rng;

    for (const move of input.legalMoves) {
      const result = completeTemplateMove(input.def, input.state, move, rng);
      if (result !== null) {
        completedMoves.push(result.move);
        rng = result.rng;
      }
    }

    if (completedMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove: no playable moves after template completion');
    }

    if (completedMoves.length === 1) {
      return { move: completedMoves[0]!, rng };
    }

    const [index, nextRng] = nextInt(rng, 0, completedMoves.length - 1);
    const selected = completedMoves[index];
    if (selected === undefined) {
      throw new Error(`RandomAgent.chooseMove selected out-of-range index ${index}`);
    }
    return { move: selected, rng: nextRng };
  }
}
