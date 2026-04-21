import type { Agent } from '../kernel/types.js';
import type {
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
} from '../kernel/types.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { pickRandom } from './agent-move-selection.js';

export class RandomAgent implements Agent {
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult;
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    if (input.microturn.legalActions.length === 0) {
      throw new Error('RandomAgent.chooseDecision called with empty legalActions');
    }

    const candidateActions = input.microturn.kind === 'chooseNStep'
      ? (() => {
          const confirmDecision = input.microturn.legalActions.find(
            (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
          );
          if (confirmDecision !== undefined) {
            return [confirmDecision];
          }

          const addActions = input.microturn.legalActions.filter(
            (decision) => decision.kind === 'chooseNStep' && decision.command === 'add',
          );
          return addActions.length > 0 ? addActions : input.microturn.legalActions;
        })()
      : input.microturn.legalActions;

    const { item: selected, rng: nextRng } = pickRandom(candidateActions, input.rng);
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
}
