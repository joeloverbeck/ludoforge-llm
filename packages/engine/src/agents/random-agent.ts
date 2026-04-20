import type { Agent } from '../kernel/types.js';
import type {
  AgentLegacyDecisionInput,
  AgentLegacyDecisionResult,
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
} from '../kernel/types.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import {
  createNoPlayableMoveInvariantError,
  pickRandom,
  selectStochasticFallback,
} from './agent-move-selection.js';
import { preparePlayableMoves } from './prepare-playable-moves.js';

export class RandomAgent implements Agent {
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult;
  chooseDecision(input: AgentLegacyDecisionInput): AgentLegacyDecisionResult;
  chooseDecision(input: AgentMicroturnDecisionInput | AgentLegacyDecisionInput): AgentMicroturnDecisionResult | AgentLegacyDecisionResult {
    if ('microturn' in input) {
      if (input.microturn.legalActions.length === 0) {
        throw new Error('RandomAgent.chooseDecision called with empty legalActions');
      }

      const { item: selected, rng: nextRng } = pickRandom(input.microturn.legalActions, input.rng);
      return {
        decision: selected,
        rng: nextRng,
        agentDecision: {
          kind: 'builtin',
          agent: { kind: 'builtin', builtinId: 'random' },
          candidateCount: input.microturn.legalActions.length,
          selectedIndex: input.microturn.legalActions.findIndex((decision) => decision === selected),
          ...(selected.kind !== 'actionSelection' || selected.move === undefined
            ? {}
            : { selectedStableMoveKey: toMoveIdentityKey(input.def, selected.move) }),
        },
      };
    }

    if (input.legalMoves.length === 0) {
      throw new Error('RandomAgent.chooseDecision called with empty legalMoves');
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
      throw createNoPlayableMoveInvariantError('RandomAgent', input.legalMoves.length);
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
