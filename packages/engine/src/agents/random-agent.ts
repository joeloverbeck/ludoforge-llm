import type { Agent, Move } from '../kernel/types.js';
import { completeTemplateMove } from '../kernel/move-completion.js';
import { pickRandom, selectStochasticFallback } from './agent-move-selection.js';

export class RandomAgent implements Agent {
  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove called with empty legalMoves');
    }

    const completedMoves: Move[] = [];
    const stochasticMoves: Move[] = [];
    let rng = input.rng;

    for (const move of input.legalMoves) {
      const result = completeTemplateMove(input.def, input.state, move, rng, input.runtime);
      if (result.kind === 'completed') {
        completedMoves.push(result.move);
        rng = result.rng;
      } else if (result.kind === 'stochasticUnresolved') {
        stochasticMoves.push(result.move);
        rng = result.rng;
      }
    }

    if (completedMoves.length === 0 && stochasticMoves.length > 0) {
      return selectStochasticFallback(stochasticMoves, rng);
    }

    if (completedMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove: no playable moves after template completion');
    }

    const { item: selected, rng: nextRng } = pickRandom(completedMoves, rng);
    return { move: selected, rng: nextRng };
  }
}
