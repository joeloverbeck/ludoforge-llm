import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type { Agent } from '../kernel/types.js';
import { pickRandom, selectStochasticFallback } from './agent-move-selection.js';
import { preparePlayableMoves } from './prepare-playable-moves.js';

export class RandomAgent implements Agent {
  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove called with empty legalMoves');
    }

    const { completedMoves, stochasticMoves, rng } = preparePlayableMoves(input);

    if (completedMoves.length === 0 && stochasticMoves.length > 0) {
      const fallback = selectStochasticFallback(stochasticMoves, rng);
      return {
        ...fallback,
        agentDecision: {
          kind: 'builtin',
          agent: { kind: 'builtin', builtinId: 'random' },
          candidateCount: stochasticMoves.length,
          selectedIndex: stochasticMoves.findIndex((move) => move === fallback.move),
          selectedStableMoveKey: toMoveIdentityKey(input.def, fallback.move.move),
        },
      };
    }

    if (completedMoves.length === 0) {
      throw new Error('RandomAgent.chooseMove: no playable moves after template completion');
    }

    const { item: selected, rng: nextRng } = pickRandom(completedMoves, rng);
    return {
      move: selected,
      rng: nextRng,
      agentDecision: {
        kind: 'builtin',
        agent: { kind: 'builtin', builtinId: 'random' },
        candidateCount: completedMoves.length,
        selectedIndex: completedMoves.findIndex((move) => move === selected),
        selectedStableMoveKey: toMoveIdentityKey(input.def, selected.move),
      },
    };
  }
}
