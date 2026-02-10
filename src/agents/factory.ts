import type { Agent } from '../kernel/types.js';
import { RandomAgent } from './random-agent.js';

export type AgentType = 'random' | 'greedy';

const createUnimplementedAgent = (agentName: string): Agent => ({
  chooseMove: () => {
    throw new Error(`${agentName}.chooseMove is not implemented yet`);
  },
});

export const createAgent = (type: AgentType): Agent => {
  switch (type) {
    case 'random':
      return new RandomAgent();
    case 'greedy':
      return createUnimplementedAgent('GreedyAgent');
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};

const isAgentType = (value: string): value is AgentType => value === 'random' || value === 'greedy';

export const parseAgentSpec = (spec: string, playerCount: number): readonly Agent[] => {
  const types = spec
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  if (types.length !== playerCount) {
    throw new Error(`Agent spec has ${types.length} agents but game needs ${playerCount} players`);
  }

  return types.map((type) => {
    if (!isAgentType(type)) {
      throw new Error(`Unknown agent type: ${type}. Allowed: random, greedy`);
    }

    return createAgent(type);
  });
};
