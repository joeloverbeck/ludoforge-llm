import { applyTrustedMove } from '../kernel/apply-move.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type { Agent, TrustedExecutableMove } from '../kernel/types.js';
import { evaluateState } from './evaluate-state.js';
import {
  createNoPlayableMoveInvariantError,
  pickRandom,
  selectStochasticFallback,
} from './agent-move-selection.js';
import { preparePlayableMoves } from './prepare-playable-moves.js';
import { selectCandidatesDeterministically } from './select-candidates.js';

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
    if (
      completionsPerTemplate !== undefined
      && (!Number.isSafeInteger(completionsPerTemplate) || completionsPerTemplate < 1)
    ) {
      throw new RangeError('GreedyAgent completionsPerTemplate must be a positive safe integer');
    }
    this.maxMovesToEvaluate = maxMovesToEvaluate;
    this.completionsPerTemplate = completionsPerTemplate ?? DEFAULT_COMPLETIONS_PER_TEMPLATE;
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseMove called with empty legalMoves');
    }

    const { completedMoves: expandedMoves, stochasticMoves, rng } = preparePlayableMoves(input, {
      pendingTemplateCompletions: this.completionsPerTemplate,
    });

    if (expandedMoves.length === 0 && stochasticMoves.length > 0) {
      const fallback = selectStochasticFallback(stochasticMoves, rng);
      return {
        ...fallback,
        agentDecision: {
          kind: 'builtin',
          agent: { kind: 'builtin', builtinId: 'greedy' },
          candidateCount: stochasticMoves.length,
          selectedIndex: stochasticMoves.findIndex((move) => move === fallback.move),
          selectedStableMoveKey: toMoveIdentityKey(input.def, fallback.move.move),
        },
      };
    }

    if (expandedMoves.length === 0) {
      throw createNoPlayableMoveInvariantError('GreedyAgent', input.legalMoves.length);
    }

    // Apply maxMovesToEvaluate cap
    const candidates = selectCandidatesDeterministically(
      expandedMoves,
      rng,
      this.maxMovesToEvaluate,
    );

    let bestMove = candidates.moves[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    const tiedBestMoves: TrustedExecutableMove[] = [];

    for (const move of candidates.moves) {
      const nextState = applyTrustedMove(input.def, input.state, move, undefined, input.runtime).state;
      const score = evaluateState(input.def, nextState, input.playerId, input.runtime);
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
      return {
        move: bestMove,
        rng: candidates.rng,
        agentDecision: {
          kind: 'builtin',
          agent: { kind: 'builtin', builtinId: 'greedy' },
          candidateCount: candidates.moves.length,
          selectedIndex: candidates.moves.findIndex((move) => move === bestMove),
          selectedStableMoveKey: toMoveIdentityKey(input.def, bestMove.move),
        },
      };
    }

    const { item: selectedMove, rng: nextRng } = pickRandom(tiedBestMoves, candidates.rng);
    return {
      move: selectedMove,
      rng: nextRng,
      agentDecision: {
        kind: 'builtin',
        agent: { kind: 'builtin', builtinId: 'greedy' },
        candidateCount: candidates.moves.length,
        selectedIndex: candidates.moves.findIndex((move) => move === selectedMove),
        selectedStableMoveKey: toMoveIdentityKey(input.def, selectedMove.move),
      },
    };
  }
}
