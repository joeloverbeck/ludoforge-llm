import { nextInt } from '../kernel/prng.js';
import type { Agent, Move, Rng } from '../kernel/types.js';
import { completeTemplateMove } from '../kernel/move-completion.js';

export class RandomAgent implements Agent {
  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove called with empty legalMoves');
    }

    const completedMoves: Move[] = [];
    const stochasticMoves: { move: Move; rng: Rng }[] = [];
    let rng = input.rng;

    for (const move of input.legalMoves) {
      const result = completeTemplateMove(input.def, input.state, move, rng, input.runtime);
      if (result.kind === 'completed') {
        completedMoves.push(result.move);
        rng = result.rng;
      } else if (result.kind === 'stochasticUnresolved') {
        stochasticMoves.push({ move: result.move, rng: result.rng });
        rng = result.rng;
      }
    }

    if (completedMoves.length === 0 && stochasticMoves.length > 0) {
      if (stochasticMoves.length === 1) {
        return { move: stochasticMoves[0]!.move, rng };
      }
      const [index, nextRng] = nextInt(rng, 0, stochasticMoves.length - 1);
      return { move: stochasticMoves[index]!.move, rng: nextRng };
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
