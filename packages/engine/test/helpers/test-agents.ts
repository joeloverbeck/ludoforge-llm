import type {
  Agent,
  AgentMicroturnDecisionInput,
  AgentMicroturnDecisionResult,
} from '../../src/kernel/index.js';
import { pickRandom } from '../../src/agents/agent-move-selection.js';

const requireDecision = (
  input: AgentMicroturnDecisionInput,
  label: string,
): NonNullable<AgentMicroturnDecisionResult['decision']> => {
  const decision = input.microturn.legalActions[0];
  if (decision === undefined) {
    throw new Error(`${label} requires at least one legal action`);
  }
  return decision;
};

const chooseNProgressCandidates = (
  input: AgentMicroturnDecisionInput,
): AgentMicroturnDecisionInput['microturn']['legalActions'] =>
  input.microturn.kind !== 'chooseNStep'
    ? [requireDecision(input, 'chooseNProgressAgent')]
    : (() => {
        const confirmDecision = input.microturn.legalActions.find(
          (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
        );
        if (confirmDecision !== undefined) {
          return [confirmDecision];
        }

        const addDecisions = input.microturn.legalActions.filter(
          (decision) => decision.kind === 'chooseNStep' && decision.command === 'add',
        );
        return addDecisions.length > 0 ? addDecisions : [requireDecision(input, 'chooseNProgressAgent')];
      })();

export const firstLegalAgent: Agent = {
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    return {
      decision: requireDecision(input, 'firstLegalAgent'),
      rng: input.rng,
    };
  },
};

export const chooseNProgressAgent: Agent = {
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    return {
      decision: chooseNProgressCandidates(input)[0]!,
      rng: input.rng,
    };
  },
};

export const createSeededChoiceAgent = (): Agent => ({
  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    const candidates = input.microturn.kind === 'chooseNStep'
      ? chooseNProgressCandidates(input)
      : input.microturn.legalActions;
    const { item: decision, rng } = pickRandom(candidates, input.rng);
    return { decision, rng };
  },
});

export const createFirstLegalAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => firstLegalAgent);

export const createSeededChoiceAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => createSeededChoiceAgent());
