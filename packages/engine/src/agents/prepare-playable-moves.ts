import { legalChoicesEvaluate } from '../kernel/legal-choices.js';
import { evaluatePlayableMoveCandidate } from '../kernel/playable-candidate.js';
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
      const result = evaluatePlayableMoveCandidate(input.def, input.state, move, rng, input.runtime);
      rng = result.rng;
      if (result.kind === 'playableComplete') {
        completedMoves.push(result.move);
        continue;
      }
      if (result.kind === 'playableStochastic') {
        stochasticMoves.push(result.move);
        break;
      }
      if (result.rejection === 'completionUnsatisfiable') {
        break;
      }
    }
  }

  return {
    completedMoves,
    stochasticMoves,
    rng,
  };
}
