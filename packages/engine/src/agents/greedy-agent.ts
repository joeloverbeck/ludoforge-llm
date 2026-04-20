import { applyTrustedMove } from '../kernel/apply-move.js';
import { applyDecision } from '../kernel/microturn/apply.js';
import type { Decision } from '../kernel/microturn/types.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  Agent,
  AgentLegacyDecisionInput,
  AgentLegacyDecisionResult,
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
  TrustedExecutableMove,
} from '../kernel/types.js';
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

  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult;
  chooseDecision(input: AgentLegacyDecisionInput): AgentLegacyDecisionResult;
  chooseDecision(input: AgentMicroturnDecisionInput | AgentLegacyDecisionInput): AgentMicroturnDecisionResult | AgentLegacyDecisionResult {
    if ('microturn' in input) {
      if (input.microturn.legalActions.length === 0) {
        throw new Error('GreedyAgent.chooseDecision called with empty legalActions');
      }

      const candidates = input.microturn.legalActions.slice(0, this.maxMovesToEvaluate);

      let bestDecision = candidates[0];
      let bestScore = Number.NEGATIVE_INFINITY;
      const tiedBestDecisions: Decision[] = [];

      for (const decision of candidates) {
        const nextState = applyDecision(input.def, input.state, decision, undefined, input.runtime).state;
        const score = evaluateState(input.def, nextState, input.state.activePlayer, input.runtime);
        if (score > bestScore) {
          bestScore = score;
          bestDecision = decision;
          tiedBestDecisions.length = 0;
          tiedBestDecisions.push(decision);
        } else if (score === bestScore) {
          tiedBestDecisions.push(decision);
        }
      }

      if (bestDecision === undefined) {
        throw new Error('GreedyAgent.chooseDecision could not select a decision');
      }

      if (tiedBestDecisions.length <= 1) {
        return {
          decision: bestDecision,
          rng: input.rng,
          agentDecision: {
            kind: 'builtin',
            agent: { kind: 'builtin', builtinId: 'greedy' },
            candidateCount: candidates.length,
            selectedIndex: candidates.findIndex((decision) => decision === bestDecision),
            ...(bestDecision.kind !== 'actionSelection' || bestDecision.move === undefined
              ? {}
              : { selectedStableMoveKey: toMoveIdentityKey(input.def, bestDecision.move) }),
          },
        };
      }

      const { item: selectedDecision, rng: nextRng } = pickRandom(tiedBestDecisions, input.rng);
      return {
        decision: selectedDecision,
        rng: nextRng,
        agentDecision: {
          kind: 'builtin',
          agent: { kind: 'builtin', builtinId: 'greedy' },
          candidateCount: candidates.length,
          selectedIndex: candidates.findIndex((decision) => decision === selectedDecision),
          ...(selectedDecision.kind !== 'actionSelection' || selectedDecision.move === undefined
            ? {}
            : { selectedStableMoveKey: toMoveIdentityKey(input.def, selectedDecision.move) }),
        },
      };
    }

    if (input.legalMoves.length === 0) {
      throw new Error('GreedyAgent.chooseDecision called with empty legalMoves');
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
      throw new Error('GreedyAgent.chooseDecision could not select a move');
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
