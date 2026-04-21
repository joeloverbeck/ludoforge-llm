import { applyDecision } from '../kernel/microturn/apply.js';
import type { Decision } from '../kernel/microturn/types.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  Agent,
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
} from '../kernel/types.js';
import { evaluateState } from './evaluate-state.js';
import { pickRandom } from './agent-move-selection.js';

export interface GreedyAgentConfig {
  readonly maxMovesToEvaluate?: number;
}

export class GreedyAgent implements Agent {
  private readonly maxMovesToEvaluate: number | undefined;

  constructor(config: GreedyAgentConfig = {}) {
    const { maxMovesToEvaluate } = config;
    if (
      maxMovesToEvaluate !== undefined
      && (!Number.isSafeInteger(maxMovesToEvaluate) || maxMovesToEvaluate < 1)
    ) {
      throw new RangeError('GreedyAgent maxMovesToEvaluate must be a positive safe integer');
    }
    this.maxMovesToEvaluate = maxMovesToEvaluate;
  }

  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult;
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
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
}
