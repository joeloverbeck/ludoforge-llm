import { legalChoicesEvaluate } from '../kernel/legal-choices.js';
import { completeTemplateMove } from '../kernel/move-completion.js';
import { probeMoveViability } from '../kernel/apply-move.js';
import type { Agent, Move, Rng } from '../kernel/types.js';

export interface PreparePlayableMovesOptions {
  readonly pendingTemplateCompletions?: number;
}

export interface PreparedPlayableMoves {
  readonly completedMoves: readonly Move[];
  readonly stochasticMoves: readonly Move[];
  readonly rng: Rng;
}

export function preparePlayableMoves(
  input: Pick<Parameters<Agent['chooseMove']>[0], 'def' | 'state' | 'legalMoves' | 'rng' | 'runtime'>,
  options: PreparePlayableMovesOptions = {},
): PreparedPlayableMoves {
  const completedMoves: Move[] = [];
  const stochasticMoves: Move[] = [];
  let rng = input.rng;
  const pendingTemplateCompletions = options.pendingTemplateCompletions ?? 1;

  for (const move of input.legalMoves) {
    const choiceState = legalChoicesEvaluate(input.def, input.state, move, undefined, input.runtime);
    if (choiceState.kind === 'illegal') {
      continue;
    }

    const attempts = choiceState.kind === 'pending' ? pendingTemplateCompletions : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = completeTemplateMove(input.def, input.state, move, rng, input.runtime);
      if (result.kind === 'completed') {
        const viability = probeMoveViability(input.def, input.state, result.move, input.runtime);
        if (viability.viable && viability.complete) {
          completedMoves.push(result.move);
        }
        rng = result.rng;
        continue;
      }
      if (result.kind === 'stochasticUnresolved') {
        const viability = probeMoveViability(input.def, input.state, result.move, input.runtime);
        if (viability.viable) {
          stochasticMoves.push(result.move);
        }
        rng = result.rng;
      }
      break;
    }
  }

  return {
    completedMoves,
    stochasticMoves,
    rng,
  };
}
